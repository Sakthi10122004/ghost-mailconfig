const fs   = require('fs');
const path = require('path');

const ghostRoot = process.cwd();

function getContentPath() {
  try {
    const env = process.env.NODE_ENV || 'development';
    const configPath = path.join(ghostRoot, `config.${env}.json`);
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.paths && config.paths.contentPath) {
        return config.paths.contentPath;
      }
    }
  } catch (e) {}
  
  const candidate = path.join(ghostRoot, 'content');
  if (fs.existsSync(candidate)) return candidate;
  return '/var/lib/ghost/content';
}

exports.read = function() {
  const mailconfigPath = path.join(getContentPath(), 'settings/mailconfig.json');
  if (!fs.existsSync(mailconfigPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(mailconfigPath, 'utf8'));
  } catch (e) {
    return {};
  }
};

exports.writeMail = function(mailBlock) {
  const contentPath = getContentPath();
  const settingsDir = path.join(contentPath, 'settings');
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }
  const mailconfigPath = path.join(contentPath, 'settings/mailconfig.json');
  const config = { mail: mailBlock };
  fs.writeFileSync(mailconfigPath, JSON.stringify(config, null, 2));
};