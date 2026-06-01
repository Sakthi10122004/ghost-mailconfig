const express      = require('express');
const path         = require('path');
const router       = express.Router();
const configWriter = require('./configWriter');
const providers    = require('./providers');

router.use(express.json());

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
  res.json({ ok: true, message: 'Configuration attributes written successfully. Restart Ghost to apply updates.' });
});

module.exports = router;