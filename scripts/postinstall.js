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

// Fallback to checking the node_modules parent if symlinked locally
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