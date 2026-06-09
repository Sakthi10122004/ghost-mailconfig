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

// Authentication middleware to restrict route access to administrators
async function requireAdminAuth(req, res, next) {
  // Allow frontend-inject.js to load without session auth
  if (req.path === '/frontend-inject.js') return next();

  if (getSession) {
    try {
      const sessionObj = await getSession(req, res);
      if (sessionObj && sessionObj.user_id) {
        return next();
      }
    } catch (err) {
      console.error('[Mailconfig Auth] Error verifying session:', err.message);
    }
  }

  // Fallback for isolated development/test environments
  const isDevFallback = process.env.NODE_ENV !== 'production' && !getGhostPath('core/server/services/auth/session/express-session');
  if (isDevFallback) {
    const cookies = req.headers.cookie || '';
    if (cookies.includes('ghost-admin-api-session')) {
      return next();
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

// GET current running mail config settings
router.get('/api/config', (req, res) => {
  const config = configWriter.read();
  res.json(config.mail || {});
});

// POST save incoming configuration adjustments
router.post('/api/save', (req, res) => {
  const { provider, fields } = req.body;
  
  if (provider === 'reset') {
    configWriter.writeMail(undefined);
    return res.json({ ok: true, message: 'Configuration reset. Restart Ghost to apply.' });
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