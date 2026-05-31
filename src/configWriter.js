const fs   = require('fs');
const path = require('path');

// Ghost always boots from its root directory, so process.cwd() is the most reliable way 
// to get the Ghost root, especially when the plugin is symlinked or installed locally.
const ghostRoot = process.cwd();

exports.read = function() {
  const env = process.env.NODE_ENV || 'development';
  const configPath = path.join(ghostRoot, `config.${env}.json`);
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
};

exports.writeMail = function(mailBlock) {
  const env = process.env.NODE_ENV || 'development';
  const configPath = path.join(ghostRoot, `config.${env}.json`);
  const config = exports.read();
  config.mail = mailBlock;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};