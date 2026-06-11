const fs   = require('fs');
const path = require('path');

const ghostRoot = process.env.INIT_CWD || process.cwd();

function getEnvConfigPath() {
  const env = process.env.NODE_ENV || 'development';
  return path.join(ghostRoot, `config.${env}.json`);
}

let cachedConfig = null;

exports.read = function() {
  if (cachedConfig !== null) {
    return cachedConfig;
  }
  const configPath = getEnvConfigPath();
  if (!fs.existsSync(configPath)) {
    cachedConfig = { mail: {} };
    return cachedConfig;
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cachedConfig = { mail: config.mail || {} };
    return cachedConfig;
  } catch (e) {
    cachedConfig = { mail: {} };
    return cachedConfig;
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

  // Update in-memory cache
  cachedConfig = { mail: config.mail || {} };

  // Write atomically
  const tmpPath = configPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, configPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (e) {}
    throw err;
  }
};