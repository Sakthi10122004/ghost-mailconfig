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

function bootCooperativePlugins(options) {
    try {
        const fs = require('fs');
        const path = require('path');
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (!fs.existsSync(pkgPath)) return;
        
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = Object.keys(pkg.dependencies || {});
        
        global.__bootedGhostPlugins = global.__bootedGhostPlugins || {};
        
        deps.forEach(dep => {
            const isPlugin = dep.startsWith('ghost-') || dep.includes('mailconfig') || dep.startsWith('@sakthi10122004/');
            if (isPlugin && !global.__bootedGhostPlugins[dep]) {
                global.__bootedGhostPlugins[dep] = true;
                try {
                    console.log(`[Cooperative Boot] Loading plugin: ${dep}`);
                    const PluginModule = require(path.join(process.cwd(), 'node_modules', dep));
                    
                    if (typeof PluginModule === 'function') {
                        new PluginModule(options);
                    } else if (PluginModule && typeof PluginModule.init === 'function') {
                        PluginModule.init(options);
                    }
                } catch (err) {
                    console.error(`[Cooperative Boot] Failed to boot plugin ${dep}:`, err.message);
                }
            }
        });
    } catch (e) {
        console.error('[Cooperative Boot] Error during discovery:', e.message);
    }
}

class MailconfigAdapter extends SchedulingDefault {
    constructor(options) {
        super(options);

        // Register ourselves first to prevent cyclic loading
        global.__bootedGhostPlugins = global.__bootedGhostPlugins || {};
        global.__bootedGhostPlugins['@sakthi10122004/mailconfig'] = true;
        global.__ghostAdapterOptions = options;

        // Scan and load other installed plugins cooperatively
        bootCooperativePlugins(options);
        
        // Call static inject method to register hooks
        MailconfigAdapter.inject();
    }

    static inject() {
        // Register ourselves first to prevent cyclic loading
        global.__bootedGhostPlugins = global.__bootedGhostPlugins || {};
        global.__bootedGhostPlugins['@sakthi10122004/mailconfig'] = true;

        // 1. Hook into Ghost Admin's Express response to inject our frontend script cooperatively
        if (express && express.response) {
            // Register our script
            global.__ghostCooperativeScripts = global.__ghostCooperativeScripts || [];
            if (!global.__ghostCooperativeScripts.includes('/ghost/mailconfig/frontend-inject.js')) {
                global.__ghostCooperativeScripts.push('/ghost/mailconfig/frontend-inject.js');
            }

            // Hook res.send if not already hooked
            if (!express.response._cooperativeSendHooked) {
                const originalSend = express.response.send;
                express.response.send = function(body) {
                    if (typeof body === 'string' && body.includes('</head>')) {
                        // Dynamic discovery of newly installed packages
                        bootCooperativePlugins(global.__ghostAdapterOptions);

                        const scripts = global.__ghostCooperativeScripts || [];
                        scripts.forEach(src => {
                            const tag = `<script src="${src}"></script>`;
                            if (!body.includes(src)) {
                                body = body.replace('</head>', `  ${tag}\n  </head>`);
                            }
                        });
                    }
                    return originalSend.call(this, body);
                };
                express.response._cooperativeSendHooked = true;
            }

            // Hook res.sendFile if not already hooked
            if (!express.response._cooperativeSendFileHooked) {
                const originalSendFile = express.response.sendFile;
                express.response.sendFile = function(filePath) {
                    if (filePath && typeof filePath === 'string' && filePath.endsWith('index.html')) {
                        try {
                            const html = fs.readFileSync(filePath, 'utf8');
                            this.removeHeader('ETag');
                            this.removeHeader('Content-Length');
                            return this.send(html);
                        } catch (e) {
                            console.error('[mailconfig] Cooperative sendFile error:', e);
                        }
                    }
                    return originalSendFile.apply(this, arguments);
                };
                express.response._cooperativeSendFileHooked = true;
            }
        }

        // 2. Hook into Node's HTTP Server to hijack /ghost/mailconfig routes instantly
        if (!http.Server.prototype._mailconfigHooked) {
            const mailconfigApp = express();
            mailconfigApp.use(express.json());
            
            mailconfigApp.get('/ghost/mailconfig/frontend-inject.js', (req, res) => {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                try {
                    let content = fs.readFileSync(path.join(__dirname, 'frontend-inject.js'), 'utf8');
                    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
                    content = content.replace('__VERSION_PLACEHOLDER__', pkg.version || '1.0.0');
                    res.setHeader('Content-Type', 'application/javascript');
                    res.send(content);
                } catch (e) {
                    res.sendFile(path.join(__dirname, 'frontend-inject.js'));
                }
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
            console.log('mailconfig: Dynamic hooks successfully injected');
            console.log('==================================================\n');
        }
    }
}

module.exports = MailconfigAdapter;
