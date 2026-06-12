const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const router       = express.Router();
const configWriter = require('./configWriter');
const providers    = require('./providers');

// Helper to locate Ghost files dynamically
function getGhostPath(relativePath) {
    const ghostRoot = process.env.INIT_CWD || process.cwd();
    const extensions = ['', '.js', '.json'];
    
    // Strategy 1: Check in current/ symlink
    for (const ext of extensions) {
        let candidate = path.join(ghostRoot, 'current', relativePath + ext);
        if (fs.existsSync(candidate)) return path.join(ghostRoot, 'current', relativePath);
    }
    
    // Strategy 2: Check directly in ghostRoot
    for (const ext of extensions) {
        let candidate = path.join(ghostRoot, relativePath + ext);
        if (fs.existsSync(candidate)) return path.join(ghostRoot, relativePath);
    }
    
    // Strategy 3: Check inside versions/*/
    const versionsDir = path.join(ghostRoot, 'versions');
    if (fs.existsSync(versionsDir)) {
        try {
            const versions = fs.readdirSync(versionsDir);
            for (const ver of versions) {
                for (const ext of extensions) {
                    let candidate = path.join(versionsDir, ver, relativePath + ext);
                    if (fs.existsSync(candidate)) return path.join(versionsDir, ver, relativePath);
                }
            }
        } catch (e) {}
    }
    
    return null;
}

// Load Ghost's core session service dynamically
let getSession = null;
try {
  const sessionPath = getGhostPath('core/server/services/auth/session/express-session');
  if (sessionPath) {
    getSession = require(sessionPath).getSession;
  }
} catch (err) {
  console.error('[Mailconfig Auth] Failed to load Ghost session service:', err.message);
}

// Load Ghost models dynamically
let models = null;
try {
  const modelsPath = getGhostPath('core/server/models');
  if (modelsPath) {
    models = require(modelsPath);
  }
} catch (err) {
  console.error('[Mailconfig Auth] Failed to load Ghost models:', err.message);
}

// Load Ghost's core config service dynamically to get URLs
let ghostUrl = null;
let ghostAdminUrl = null;
try {
  const configPath = getGhostPath('core/shared/config');
  if (configPath) {
    const ghostConfig = require(configPath);
    if (ghostConfig && typeof ghostConfig.get === 'function') {
      ghostUrl = ghostConfig.get('url');
      const adminObj = ghostConfig.get('admin');
      if (adminObj && typeof adminObj === 'object') {
        ghostAdminUrl = adminObj.url;
      } else {
        ghostAdminUrl = ghostConfig.get('admin:url');
      }
    }
  }
} catch (e) {
  console.error('[Mailconfig Auth] Failed to load Ghost URL config:', e.message);
}

// Authentication middleware to restrict route access to administrators
async function requireAdminAuth(req, res, next) {
  // Allow frontend-inject.js to load without session auth
  if (req.path === '/frontend-inject.js') return next();

  if (getSession) {
    try {
      const sessionObj = await getSession(req, res);
      if (sessionObj && sessionObj.user_id) {
        if (models && models.User) {
          const user = await models.User.findOne({ id: sessionObj.user_id }, { withRelated: ['roles'] });
          if (user) {
            const roles = user.related('roles').models.map(r => r.get('name'));
            const isAdminOrOwner = roles.includes('Administrator') || roles.includes('Owner');
            if (isAdminOrOwner) {
              return next();
            }
          }
        }
      }
    } catch (err) {
      console.error('[Mailconfig Auth] Error verifying session:', err.message);
    }
  }

  res.status(401).json({ error: 'Unauthorized. Ghost Admin session required.' });
}

router.use(express.json());
router.use(requireAdminAuth);

// UI Dashboard serving route
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/index.html'));
});

// GET current running mail config settings with masked secrets
router.get('/api/config', (req, res) => {
  const config = configWriter.read();
  const mailConfig = JSON.parse(JSON.stringify(config.mail || {}));
  
  if (mailConfig.options && mailConfig.options.auth) {
    if (mailConfig.options.auth.pass) {
      mailConfig.options.auth.pass = '••••••••';
    }
    if (mailConfig.options.auth.api_key) {
      mailConfig.options.auth.api_key = '••••••••';
    }
  }
  res.json(mailConfig);
});

// POST save incoming configuration adjustments
router.post('/api/save', (req, res) => {
  // Same-Origin Protection
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;
  
  const allowedHosts = new Set();
  if (host) {
    allowedHosts.add(host.toLowerCase());
  }
  
  const xForwardedHost = req.headers['x-forwarded-host'];
  if (xForwardedHost) {
    xForwardedHost.split(',').forEach(h => allowedHosts.add(h.trim().toLowerCase()));
  }
  
  if (ghostAdminUrl) {
    try { allowedHosts.add(new URL(ghostAdminUrl).host.toLowerCase()); } catch (e) {}
  }
  if (ghostUrl) {
    try { allowedHosts.add(new URL(ghostUrl).host.toLowerCase()); } catch (e) {}
  }

  function isHostAllowed(urlStr) {
    try {
      const u = new URL(urlStr);
      return allowedHosts.has(u.host.toLowerCase());
    } catch (e) {
      return false;
    }
  }
  
  if (origin) {
    if (!isHostAllowed(origin)) {
      return res.status(403).json({ error: 'Forbidden. Origin mismatch.' });
    }
  } else if (referer) {
    if (!isHostAllowed(referer)) {
      return res.status(403).json({ error: 'Forbidden. Referer mismatch.' });
    }
  } else {
    return res.status(403).json({ error: 'Forbidden. Missing Origin or Referer header.' });
  }

  // Reject non-object bodies
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body shape.' });
  }

  const { provider, fields } = req.body;
  
  // Validate provider name
  if (!['smtp', 'mailgun', 'reset'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider name.' });
  }

  // Reject prototype pollution keys in body or fields
  const isSafeKey = key => key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
  const allKeys = [...Object.keys(req.body), ...(fields && typeof fields === 'object' && !Array.isArray(fields) ? Object.keys(fields) : [])];
  if (allKeys.some(k => !isSafeKey(k))) {
    return res.status(400).json({ error: 'Invalid field keys detected.' });
  }

  if (provider === 'reset') {
    try {
      configWriter.writeMail(undefined);
    } catch (err) {
      console.error('[Mailconfig Router] Failed to reset config:', err.message);
      return res.status(500).json({ error: 'Internal server error. Failed to save configuration to disk.' });
    }
    return res.json({ ok: true, message: 'Configuration reset. Restart Ghost to apply.' });
  }

  const allowedFields = {
    smtp: ['host', 'port', 'user', 'pass'],
    mailgun: ['apiKey', 'domain']
  };

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return res.status(400).json({ error: 'Missing or invalid fields object.' });
  }

  const expectedFields = allowedFields[provider];
  const actualFields = Object.keys(fields);
  
  // Verify no unexpected fields
  for (const key of actualFields) {
    if (!expectedFields.includes(key)) {
      return res.status(400).json({ error: `Unexpected field: ${key}` });
    }
  }
  
  // Verify all expected fields exist and validate them
  for (const key of expectedFields) {
    const val = fields[key];
    if (val === undefined || val === null) {
      return res.status(400).json({ error: `Missing required field: ${key}` });
    }
    
    if (key === 'port') {
      if (typeof val !== 'string' && typeof val !== 'number') {
        return res.status(400).json({ error: 'SMTP Port must be a valid integer.' });
      }
      const valStr = String(val).trim();
      if (!/^\d+$/.test(valStr)) {
        return res.status(400).json({ error: 'SMTP Port must contain digits only.' });
      }
      const portInt = Number(valStr);
      if (portInt < 1 || portInt > 65535) {
        return res.status(400).json({ error: 'SMTP Port must be between 1 and 65535.' });
      }
    } else {
      if (typeof val !== 'string') {
        return res.status(400).json({ error: `Field ${key} must be a string.` });
      }
      if (val.length === 0) {
        return res.status(400).json({ error: `Field ${key} cannot be empty.` });
      }
      if (val.length > 255) {
        return res.status(400).json({ error: `Field ${key} exceeds maximum length of 255 characters.` });
      }
    }
  }

  // Preserve existing secrets if masked values are sent
  const currentConfig = configWriter.read();
  const currentMail = currentConfig.mail || {};
  
  if (provider === 'smtp') {
    if (fields.pass === '••••••••') {
      if (currentMail.transport === 'SMTP' && currentMail.options && currentMail.options.auth && currentMail.options.auth.pass) {
        fields.pass = currentMail.options.auth.pass;
      } else {
        return res.status(400).json({ error: 'No existing SMTP password found to preserve.' });
      }
    }
  } else if (provider === 'mailgun') {
    if (fields.apiKey === '••••••••') {
      if (currentMail.transport === 'Mailgun' && currentMail.options && currentMail.options.auth && currentMail.options.auth.api_key) {
        fields.apiKey = currentMail.options.auth.api_key;
      } else {
        return res.status(400).json({ error: 'No existing Mailgun API key found to preserve.' });
      }
    }
  }

  const schema = providers[provider];
  if (!schema) return res.status(400).json({ error: 'Unknown provider option raw payload' });

  const mailBlock = schema.build(fields);
  try {
    configWriter.writeMail(mailBlock);
  } catch (err) {
    console.error('[Mailconfig Router] Failed to write config:', err.message);
    return res.status(500).json({ error: 'Internal server error. Failed to save configuration to disk.' });
  }

  // Sync in-memory configuration immediately
  try {
      const MailconfigAdapter = require('./adapter');
      if (MailconfigAdapter && typeof MailconfigAdapter.updateConfig === 'function') {
          MailconfigAdapter.updateConfig(mailBlock);
      }
  } catch (err) {
      console.error('[Mailconfig Router] Failed to update dynamic config in-memory:', err.message);
  }

  res.json({ ok: true, message: 'Configuration saved successfully.' });
});

module.exports = router;