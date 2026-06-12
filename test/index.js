const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

// Set NODE_ENV to test to prevent overriding real configs
process.env.NODE_ENV = 'test';

// Clean test environment config file if it exists
const testConfigPath = path.join(process.cwd(), 'config.test.json');
if (fs.existsSync(testConfigPath)) {
  fs.unlinkSync(testConfigPath);
}

// 1. Load router and configWriter
const router = require('../src/router');
const configWriter = require('../src/configWriter');

console.log('Running @sakthi10122004/mailconfig Unit Tests...\n');

// Test isPlainObject
console.log('Testing isPlainObject...');
assert.strictEqual(router._test.isPlainObject({}), true);
assert.strictEqual(router._test.isPlainObject({ a: 1 }), true);
assert.strictEqual(router._test.isPlainObject([]), false);
assert.strictEqual(router._test.isPlainObject(null), false);
assert.strictEqual(router._test.isPlainObject('string'), false);
assert.strictEqual(router._test.isPlainObject(123), false);

// Test isSafeKey
console.log('Testing isSafeKey...');
assert.strictEqual(router._test.isSafeKey('host'), true);
assert.strictEqual(router._test.isSafeKey('__proto__'), false);
assert.strictEqual(router._test.isSafeKey('constructor'), false);
assert.strictEqual(router._test.isSafeKey('prototype'), false);

// Test validatePortValue
console.log('Testing validatePortValue...');
assert.strictEqual(router._test.validatePortValue(587), null);
assert.strictEqual(router._test.validatePortValue('587'), null);
assert.strictEqual(router._test.validatePortValue('587abc'), 'SMTP Port must contain digits only.');
assert.strictEqual(router._test.validatePortValue('0'), 'SMTP Port must be between 1 and 65535.');
assert.strictEqual(router._test.validatePortValue('65536'), 'SMTP Port must be between 1 and 65535.');
assert.strictEqual(router._test.validatePortValue('58.7'), 'SMTP Port must contain digits only.');

// Test buildAllowedHosts
console.log('Testing buildAllowedHosts...');
const allowed = router._test.buildAllowedHosts('localhost:2368');
assert.ok(allowed.has('localhost:2368'));

// Test configWriter unparseable abort
console.log('Testing configWriter error handling...');
fs.writeFileSync(testConfigPath, '{ malformed: json ');
configWriter._test.resetCache();
assert.throws(() => {
  configWriter.writeMail({ transport: 'SMTP' });
}, /Cannot parse existing Ghost config/);

// Cleanup
if (fs.existsSync(testConfigPath)) {
  fs.unlinkSync(testConfigPath);
}

console.log('\nAll tests passed successfully!');
