const fs   = require('fs');
const path = require('path');

const ghostRoot = process.env.INIT_CWD || process.cwd();

function getEnvConfigPath() {
  const env = process.env.NODE_ENV || 'development';
  return path.join(ghostRoot, `config.${env}.json`);
}

exports.read = function() {
  const configPath = getEnvConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { mail: config.mail || {} };
  } catch (e) {
    return {};
  }
};

exports.writeMail = function(mailBlock) {
  const configPath = getEnvConfigPath();
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      config = {};
    }
  }
  if (mailBlock === undefined) {
    delete config.mail;
  } else {
    config.mail = mailBlock;
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};