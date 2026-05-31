const path = require('path');
const fs = require('fs');
const http = require('http');

let express;
try {
    express = require(path.join(process.cwd(), 'current/core/shared/express'))._express;
} catch (e) {
    express = require('express');
}

let SchedulingDefault;
try {
    SchedulingDefault = require(path.join(process.cwd(), 'current/core/server/adapters/scheduling/scheduling-default'));
} catch (e) {
    class Dummy { schedule() {} unschedule() {} run() {} }
    SchedulingDefault = Dummy;
}

class MailconfigAdapter extends SchedulingDefault {
    constructor(options) {
        super(options);
        
        // 1. Hook into Ghost Admin's Express response to inject our frontend script
        if (express && express.response && !express.response._mailconfigHooked) {
            const originalSendFile = express.response.sendFile;
            express.response.sendFile = function(filePath) {
                if (filePath && typeof filePath === 'string' && filePath.endsWith('index.html')) {
                    try {
                        let html = fs.readFileSync(filePath, 'utf8');
                        html = html.replace('</head>', `<script src="/ghost/mailconfig/frontend-inject.js"></script></head>`);
                        this.removeHeader('ETag');
                        this.removeHeader('Content-Length');
                        return this.send(html);
                    } catch (e) {
                        console.error('[mailconfig] Error injecting script:', e);
                    }
                }
                return originalSendFile.apply(this, arguments);
            };
            express.response._mailconfigHooked = true;
        }

        // 2. Hook into Node's HTTP Server to hijack /ghost/mailconfig routes instantly
        if (!http.Server.prototype._mailconfigHooked) {
            const mailconfigApp = express();
            mailconfigApp.use(express.json());
            
            mailconfigApp.get('/ghost/mailconfig/frontend-inject.js', (req, res) => {
                res.sendFile(path.join(__dirname, 'frontend-inject.js'));
            });
            
            const router = require('./router');
            mailconfigApp.use('/ghost/mailconfig', router);

            const originalEmit = http.Server.prototype.emit;
            http.Server.prototype.emit = function(event, req, res) {
                if (event === 'request' && req.url && req.url.startsWith('/ghost/mailconfig')) {
                    mailconfigApp(req, res);
                    return true;
                }
                return originalEmit.apply(this, arguments);
            };
            http.Server.prototype._mailconfigHooked = true;
            
            console.log('\n==================================================');
            console.log('mailconfig: Native scheduling adapter active');
            console.log('==================================================\n');
        }
    }
}

module.exports = MailconfigAdapter;
