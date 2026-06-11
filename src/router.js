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
  
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return res.status(403).json({ error: 'Forbidden. Origin mismatch.' });
      }
    } catch (e) {
      return res.status(403).json({ error: 'Forbidden. Invalid origin header.' });
    }
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== host) {
        return res.status(403).json({ error: 'Forbidden. Referer mismatch.' });
      }
    } catch (e) {
      return res.status(403).json({ error: 'Forbidden. Invalid referer header.' });
    }
  } else {
    return res.status(403).json({ error: 'Forbidden. Missing Origin or Referer header.' });
  }

  const { provider, fields } = req.body;
  
  // Validate provider name
  if (!['smtp', 'mailgun', 'reset'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider name.' });
  }

  // Reject prototype pollution keys in body or fields
  const isSafeKey = key => key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
  const allKeys = [...Object.keys(req.body || {}), ...(fields ? Object.keys(fields) : [])];
  if (allKeys.some(k => !isSafeKey(k))) {
    return res.status(400).json({ error: 'Invalid field keys detected.' });
  }

  if (provider === 'reset') {
    configWriter.writeMail(undefined);
    return res.json({ ok: true, message: 'Configuration reset. Restart Ghost to apply.' });
  }

  const allowedFields = {
    smtp: ['host', 'port', 'user', 'pass'],
    mailgun: ['apiKey', 'domain']
  };

  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'Missing fields object.' });
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
      const portInt = parseInt(val, 10);
      if (isNaN(portInt) || portInt < 1 || portInt > 65535 || String(val).includes('.')) {
        return res.status(400).json({ error: 'SMTP Port must be a valid integer between 1 and 65535.' });
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
  configWriter.writeMail(mailBlock);

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