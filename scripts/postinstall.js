const path = require('path');
const fs   = require('fs');

// Locate the directory where the user ran npm install
let ghostRoot = process.env.INIT_CWD;

if (!ghostRoot || !fs.existsSync(path.join(ghostRoot, 'package.json'))) {
  // Fallback if INIT_CWD is missing or incorrect
  ghostRoot = path.resolve(process.cwd(), '../../');
}

const ghostPkgPath = path.join(ghostRoot, 'package.json');

console.log('\n[+] mailconfig: Running postinstall setup...\n');

let isGhost = false;
if (fs.existsSync(ghostPkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(ghostPkgPath, 'utf8'));
    // Check if the name in package.json is "ghost" or if we see typical Ghost folders
    if (pkg.name === 'ghost' || fs.existsSync(path.join(ghostRoot, 'current/index.js'))) {
      isGhost = true;
    }
  } catch (err) {}
}

if (!isGhost) {
  console.warn('\x1b[31m%s\x1b[0m', '[!] Error: You must run `npm install mailconfig` inside a valid Ghost installation directory.');
  console.warn('\x1b[33m%s\x1b[0m', '[!] Setup aborted. Please cd into your Ghost root folder and try again.');
  process.exit(1);
}

// Dynamically target the active environment file
const isDev = fs.existsSync(path.join(ghostRoot, 'config.development.json'));
const targetConfigFile = isDev ? 'config.development.json' : 'config.production.json';
const configPath = path.join(ghostRoot, targetConfigFile);

let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Inject a base configuration placeholder if none exists
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

// Register as a native Ghost Scheduling Adapter
let configModified = false;

// Attempt to patch both dev and prod configs if they exist
['config.development.json', 'config.production.json'].forEach(configFile => {
    const filePath = path.join(ghostRoot, configFile);
    if (fs.existsSync(filePath)) {
        let conf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Ensure scheduling block exists and registers our plugin natively
        if (!conf.scheduling || conf.scheduling.active !== 'mailconfig') {
            conf.scheduling = {
                active: 'mailconfig',
                mailconfig: {}
            };
            fs.writeFileSync(filePath, JSON.stringify(conf, null, 2));
            console.log('\x1b[32m%s\x1b[0m', `[+] mailconfig natively registered as an adapter in ${configFile}`);
            configModified = true;
        }
    }
});

if (configModified) {
    console.log('\x1b[32m%s\x1b[0m', '[+] Plugin installed! Restart Ghost for changes to take effect.');
}