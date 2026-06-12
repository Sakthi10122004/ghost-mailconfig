const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const router       = express.Router();
const configWriter = require('./configWriter');
const providers    = require('./providers');

const INTERNAL_REQUEST_HEADER = 'x-mailconfig-request';
const SECRET_MASK = '••••••••';

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

function buildAllowedHosts(host) {
  const allowedHosts = new Set();
  if (host) {
    allowedHosts.add(host.toLowerCase());
  }

  if (ghostAdminUrl) {
    try { allowedHosts.add(new URL(ghostAdminUrl).host.toLowerCase()); } catch (e) {}
  }
  if (ghostUrl) {
    try { allowedHosts.add(new URL(ghostUrl).host.toLowerCase()); } catch (e) {}
  }

  return allowedHosts;
}

function isHostAllowed(urlStr, allowedHosts) {
  try {
    const u = new URL(urlStr);
    return allowedHosts.has(u.host.toLowerCase());
  } catch (e) {
    return false;
  }
}

function validateSameOrigin(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedHosts = buildAllowedHosts(req.headers.host);

  if (origin) {
    return isHostAllowed(origin, allowedHosts) ? null : 'Forbidden. Origin mismatch.';
  }
  if (referer) {
    return isHostAllowed(referer, allowedHosts) ? null : 'Forbidden. Referer mismatch.';
  }
  return 'Forbidden. Missing Origin or Referer header.';
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeKey(key) {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function validatePortValue(val) {
  if (typeof val !== 'string' && typeof val !== 'number') {
    return 'SMTP Port must be a valid integer.';
  }
  const valStr = String(val).trim();
  if (!/^\d+$/.test(valStr)) {
    return 'SMTP Port must contain digits only.';
  }
  const portInt = Number(valStr);
  if (portInt < 1 || portInt > 65535) {
    return 'SMTP Port must be between 1 and 65535.';
  }
  return null;
}

function isExpectedFetchDestination(req, allowedDestinations) {
  const destination = req.headers['sec-fetch-dest'];
  if (!destination) return true;
  return allowedDestinations.includes(String(destination).toLowerCase());
}

function requireFetchDestination(allowedDestinations) {
  return function(req, res, next) {
    if (!isExpectedFetchDestination(req, allowedDestinations)) {
      return res.status(404).send('Not Found');
    }
    next();
  };
}

function requireInternalRequest(req, res, next) {
  if (req.get(INTERNAL_REQUEST_HEADER) !== '1') {
    return res.status(404).send('Not Found');
  }
  next();
}

function serveFrontendInject(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    let content = fs.readFileSync(path.join(__dirname, 'frontend-inject.js'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    content = content.replace(/__VERSION_PLACEHOLDER__/g, pkg.version || '1.0.0');
    res.setHeader('Content-Type', 'application/javascript');
    res.send(content);
  } catch (e) {
    res.sendFile(path.join(__dirname, 'frontend-inject.js'));
  }
}

// Authentication middleware to restrict route access to administrators
async function requireAdminAuth(req, res, next) {
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

// Frontend asset: authenticated and served only as a script load, not direct navigation.
router.get('/frontend-inject.js', requireFetchDestination(['script', 'empty']), serveFrontendInject);

// UI Dashboard serving route
router.get('/', requireFetchDestination(['iframe', 'frame']), (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/index.html'));
});

// GET current running mail config settings with masked secrets
router.get('/api/config', requireInternalRequest, (req, res) => {
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
router.post('/api/save', requireInternalRequest, (req, res) => {
  // Same-Origin Protection
  const sameOriginError = validateSameOrigin(req);
  if (sameOriginError) {
    return res.status(403).json({ error: sameOriginError });
  }

  // Reject non-object bodies
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request body shape.' });
  }

  const { provider, fields } = req.body;
  
  // Validate provider name
  if (!['smtp', 'mailgun', 'reset'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider name.' });
  }

  // Reject prototype pollution keys in body or fields
  const allKeys = [...Object.keys(req.body), ...(isPlainObject(fields) ? Object.keys(fields) : [])];
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

  if (!isPlainObject(fields)) {
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
      const portError = validatePortValue(val);
      if (portError) {
        return res.status(400).json({ error: portError });
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

router._test = {
  buildAllowedHosts,
  isHostAllowed,
  validateSameOrigin,
  isPlainObject,
  isSafeKey,
  validatePortValue
};

module.exports = router;
