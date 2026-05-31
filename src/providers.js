module.exports = {
  smtp: {
    label: 'Custom SMTP',
    transport: 'SMTP',
    fields: ['host', 'port', 'user', 'pass'],
    build: (f) => ({
      transport: 'SMTP',
      options: { 
        host: f.host, 
        port: parseInt(f.port, 10), 
        auth: { user: f.user, pass: f.pass } 
      }
    })
  },
  mailgun: {
    label: 'Mailgun',
    transport: 'Mailgun',
    fields: ['apiKey', 'domain'],
    build: (f) => ({
      transport: 'Mailgun',
      options: { auth: { api_key: f.apiKey, domain: f.domain } }
    })
  }
};