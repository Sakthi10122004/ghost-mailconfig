const path = require('path');
const fs   = require('fs');

console.log('\n[+] mailconfig: Running postinstall setup...\n');

// Robustly find Ghost root by climbing up the tree from where the script is executed
let ghostRoot = null;
let currentDir = process.env.INIT_CWD || process.cwd();

// Climb up to 5 directories looking for a Ghost installation signature
for (let i = 0; i < 5; i++) {
  if (fs.existsSync(path.join(currentDir, '.ghost-cli')) || 
      fs.existsSync(path.join(currentDir, 'config.development.json')) ||
      fs.existsSync(path.join(currentDir, 'config.production.json'))) {
    ghostRoot = currentDir;
    break;
  }
  // Try looking one level higher
  currentDir = path.resolve(currentDir, '..');
}

if (!ghostRoot) {
  const nodeModulesParent = path.resolve(__dirname, '../../../');
  if (fs.existsSync(path.join(nodeModulesParent, '.ghost-cli'))) {
    ghostRoot = nodeModulesParent;
  }
}

if (!ghostRoot) {
  console.warn('\x1b[31m%s\x1b[0m', '[!] Error: You must run `npm install mailconfig` inside a valid Ghost installation directory.');
  console.warn('\x1b[33m%s\x1b[0m', '[!] Setup aborted. Please cd into your Ghost root folder and try again.');
  process.exit(1);
}

const isDev = fs.existsSync(path.join(ghostRoot, 'config.development.json'));
const targetConfigFile = isDev ? 'config.development.json' : 'config.production.json';
const configPath = path.join(ghostRoot, targetConfigFile);

let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

if (!config.mail || config.mail.transport === 'Direct') {
  config.mail = {
    transport: 'SMTP',
    options: {
      host: 'localhost',
      port: 587,
      auth: { user: '', pass: '' }
    },
    _mailconfig: true
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('\x1b[32m%s\x1b[0m', `Mail block initialized inside ${targetConfigFile}`);
}

// Get our own package name dynamically
const myPkgPath = path.join(__dirname, '../package.json');
let myPkgName = 'mailconfig';
if (fs.existsSync(myPkgPath)) {
  try {
    myPkgName = JSON.parse(fs.readFileSync(myPkgPath, 'utf8')).name;
  } catch(e) {}
}

// Register as a native Ghost Scheduling Adapter
let configModified = false;

// Attempt to patch both dev and prod configs if they exist
['config.development.json', 'config.production.json'].forEach(configFile => {
    const filePath = path.join(ghostRoot, configFile);
    if (fs.existsSync(filePath)) {
        let conf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Ensure scheduling block exists and registers our plugin natively
        if (!conf.scheduling || conf.scheduling.active !== myPkgName) {
            conf.scheduling = {
                active: myPkgName
            };
            conf.scheduling[myPkgName] = {};
            
            fs.writeFileSync(filePath, JSON.stringify(conf, null, 2));
            configModified = true;
        }
    }
});

// Dynamic In-Process Injection Section
const child_process = require('child_process');
const net = require('net');
const http = require('http');
const url = require('url');
const crypto = require('crypto');

function findGhostPids() {
    const pids = [];
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
        try {
            const output = child_process.execSync('wmic process where "name=\'node.exe\'" get ProcessId, CommandLine /format:list', { encoding: 'utf8' });
            const blocks = output.split(/\r\r\n\r\r\n|\r\n\r\n/);
            for (const block of blocks) {
                let pid = null;
                let cmd = '';
                const lines = block.split(/\r\n|\n/);
                for (const line of lines) {
                    if (line.startsWith('CommandLine=')) {
                        cmd = line.substring('CommandLine='.length).trim();
                    } else if (line.startsWith('ProcessId=')) {
                        pid = line.substring('ProcessId='.length).trim();
                    }
                }
                if (pid) {
                    const parsedPid = parseInt(pid, 10);
                    if (parsedPid && parsedPid !== process.pid) {
                        const lowerCmd = cmd.toLowerCase();
                        if (lowerCmd.includes('ghost') || lowerCmd.includes('index.js') || lowerCmd.includes('current')) {
                            pids.push(parsedPid);
                        }
                    }
                }
            }
        } catch (e) {
            try {
                const output = child_process.execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { encoding: 'utf8' });
                const lines = output.split(/\r\n|\n/);
                for (const line of lines) {
                    const parts = line.split(',');
                    if (parts.length > 1) {
                        const pidStr = parts[1].replace(/"/g, '').trim();
                        const pid = parseInt(pidStr, 10);
                        if (pid && pid !== process.pid) {
                            pids.push(pid);
                        }
                    }
                }
            } catch (err) {}
        }
    } else {
        try {
            const files = fs.readdirSync('/proc');
            for (const name of files) {
                if (/^\d+$/.test(name)) {
                    const pid = parseInt(name, 10);
                    if (pid === process.pid) continue;
                    try {
                        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
                        if (cmdline.toLowerCase().includes('node') && (cmdline.includes('ghost') || cmdline.includes('index.js') || cmdline.includes('current'))) {
                            pids.push(pid);
                        }
                    } catch (err) {}
                }
            }
        } catch (e) {
            try {
                const output = child_process.execSync('pgrep -f node', { encoding: 'utf8' });
                const foundPids = output.split(/\r\n|\n/).map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p !== process.pid);
                pids.push(...foundPids);
            } catch (err) {}
        }
    }
    return [...new Set(pids)];
}

function encodeWSFrame(payload) {
    const data = Buffer.from(payload);
    const len = data.length;
    let header;
    if (len <= 125) {
        header = Buffer.alloc(6);
        header[0] = 0x81;
        header[1] = 0x80 | len;
    } else if (len <= 65535) {
        header = Buffer.alloc(8);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(14);
        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(len, 6);
    }
    
    const maskKeyOffset = header.length - 4;
    const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    maskKey.copy(header, maskKeyOffset);
    
    const maskedData = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
        maskedData[i] = data[i] ^ maskKey[i % 4];
    }
    
    return Buffer.concat([header, maskedData]);
}

function getWebSocketDebuggerUrl(callback) {
    const options = {
        hostname: '127.0.0.1',
        port: 9229,
        path: '/json/list',
        method: 'GET',
        timeout: 1000
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const list = JSON.parse(body);
                if (Array.isArray(list) && list.length > 0 && list[0].webSocketDebuggerUrl) {
                    callback(null, list[0].webSocketDebuggerUrl);
                } else {
                    callback(new Error('No valid target found in JSON list'));
                }
            } catch (e) {
                callback(e);
            }
        });
    });

    req.on('error', err => callback(err));
    req.on('timeout', () => {
        req.destroy();
        callback(new Error('Timeout connecting to debugger'));
    });
    req.end();
}

function injectIntoProcess(wsUrl, code, callback) {
    const parsed = url.parse(wsUrl);
    const host = parsed.hostname || '127.0.0.1';
    const port = parseInt(parsed.port || '9229', 10);
    const path = parsed.path;

    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(port, host, () => {
        const handshake = [
            `GET ${path} HTTP/1.1`,
            `Host: ${host}:${port}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${key}`,
            'Sec-WebSocket-Version: 13',
            '\r\n'
        ].join('\r\n');
        socket.write(handshake);
    });

    let buffer = Buffer.alloc(0);
    let upgraded = false;

    socket.on('data', (data) => {
        if (!upgraded) {
            buffer = Buffer.concat([buffer, data]);
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd !== -1) {
                const responseHeaders = buffer.slice(0, headerEnd).toString();
                if (responseHeaders.includes('101 Switching Protocols')) {
                    upgraded = true;
                    const msg = JSON.stringify({
                        id: 1,
                        method: 'Runtime.evaluate',
                        params: {
                            expression: code
                        }
                    });
                    socket.write(encodeWSFrame(msg));
                } else {
                    socket.destroy();
                    callback(new Error('Handshake failed: ' + responseHeaders));
                }
            }
        } else {
            socket.end();
            callback(null);
        }
    });

    socket.on('error', err => callback(err));
    socket.setTimeout(2000, () => {
        socket.destroy();
        callback(new Error('WebSocket connection timed out'));
    });
}

function reportStatus(successfulInjections) {
    console.log('\n==================================================');
    if (successfulInjections > 0) {
        console.log('\x1b[32m%s\x1b[0m', `[+] mailconfig: Hooks dynamically injected into ${successfulInjections} running process(es)!`);
        console.log('\x1b[32m%s\x1b[0m', '[+] Ghost Admin option tab is now active. No restart required.');
    } else {
        console.log('\x1b[33m%s\x1b[0m', '[!] mailconfig: Dynamic injection was not successful or no active process could be injected.');
        console.log('\x1b[33m%s\x1b[0m', '[!] Please run `ghost restart` or restart your Ghost instance to apply changes.');
    }
    console.log('==================================================\n');
}

function injectSequentially(pids, index = 0, successful = 0) {
    if (index >= pids.length) {
        reportStatus(successful);
        return;
    }
    
    const pid = pids[index];
    getWebSocketDebuggerUrl((err, wsUrl) => {
        const wasAlreadyOpen = !err && wsUrl;
        
        const proceedWithUrl = (targetUrl, shouldCloseInspector) => {
            const injectCodeStr = `
                (function() {
                    try {
                        const path = require('path');
                        const fs = require('fs');
                        let pkgPath = path.join(process.cwd(), 'node_modules/@sakthi10122004/mailconfig/src/adapter.js');
                        if (!fs.existsSync(pkgPath)) {
                            pkgPath = '@sakthi10122004/mailconfig';
                        }
                        const MailconfigAdapter = require(pkgPath);
                        MailconfigAdapter.inject();
                        console.log('[mailconfig] Hooks dynamically injected successfully!');
                    } catch (e) {
                        console.error('[mailconfig] Failed to dynamically inject hooks:', e.message);
                    } finally {
                        if (${shouldCloseInspector}) {
                            setTimeout(() => {
                                try { require('inspector').close(); } catch(err) {}
                            }, 500);
                        }
                    }
                })()
            `;
            injectIntoProcess(targetUrl, injectCodeStr, (injectErr) => {
                if (!injectErr) {
                    console.log(`[mailconfig] Dynamic injection succeeded for process ${pid}.`);
                    setTimeout(() => {
                        injectSequentially(pids, index + 1, successful + 1);
                    }, shouldCloseInspector ? 1000 : 100);
                } else {
                    console.error(`[mailconfig] Dynamic injection failed for process ${pid}:`, injectErr.message);
                    injectSequentially(pids, index + 1, successful);
                }
            });
        };

        if (wasAlreadyOpen) {
            proceedWithUrl(wsUrl, false);
        } else {
            let triggered = false;
            if (typeof process._debugProcess === 'function') {
                try {
                    process._debugProcess(pid);
                    triggered = true;
                } catch (e) {
                    if (process.platform !== 'win32') {
                        try {
                            process.kill(pid, 'SIGUSR1');
                            triggered = true;
                        } catch (killErr) {}
                    }
                }
            } else if (process.platform !== 'win32') {
                try {
                    process.kill(pid, 'SIGUSR1');
                    triggered = true;
                } catch (killErr) {}
            }
            
            if (!triggered) {
                console.error(`[mailconfig] Could not trigger debugger on process ${pid}.`);
                injectSequentially(pids, index + 1, successful);
                return;
            }

            setTimeout(() => {
                getWebSocketDebuggerUrl((retryErr, newWsUrl) => {
                    if (!retryErr && newWsUrl) {
                        proceedWithUrl(newWsUrl, true);
                    } else {
                        console.error(`[mailconfig] Could not retrieve debugger URL for process ${pid} after triggering:`, retryErr ? retryErr.message : 'No URL');
                        injectSequentially(pids, index + 1, successful);
                    }
                });
            }, 600);
        }
    });
}

console.log('[mailconfig] Scanning for running Ghost processes to inject option...');
const pids = findGhostPids();
if (pids.length === 0) {
    console.log('[mailconfig] No running Ghost process found to dynamically inject hooks.');
    console.log('[mailconfig] Plugin configuration will be active upon next Ghost start/restart.');
} else {
    console.log(`[mailconfig] Found running Ghost process(es): ${pids.join(', ')}. Initializing injection...`);
    injectSequentially(pids);
}