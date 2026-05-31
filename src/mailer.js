const nodemailer = require('nodemailer');

exports.sendTest = async function(mailConfig, to) {
  if (!mailConfig || !mailConfig.options) {
    throw new Error('Mail setup attributes are missing or blank.');
  }
  const transport = nodemailer.createTransport(mailConfig.options);
  await transport.sendMail({
    from: mailConfig.options.auth?.user || 'mailconfig@ghost.local',
    to,
    subject: 'Ghost mailconfig — Verification Test Handshake',
    text: 'Success! Your independent mailconfig provider routing loop works perfectly!'
  });
};