module.exports = {
  smtp: {
    label: 'Custom SMTP',
    transport: 'SMTP',
    fields: ['from', 'host', 'port', 'user', 'pass'],
    build: (f) => ({
      from: f.from,
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
    fields: ['from', 'apiKey', 'domain'],
    build: (f) => ({
      from: f.from,
      transport: 'Mailgun',
      options: { auth: { api_key: f.apiKey, domain: f.domain } }
    })
  }
};