const mongoose = require('mongoose');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
// This runner never loads .env and never connects to the development database.
process.env.NODE_ENV = 'test';
process.env.LEGACY_ASSIGNMENT_MODE = 'true';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.OTP_SECRET = crypto.randomBytes(32).toString('hex');
process.env.AVATAR_DIR = path.join(require('node:os').tmpdir(), `saraha-newman-${crypto.randomUUID()}`);
let server;
async function main() {
  const uri = process.env.POSTMAN_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/saraha_postman_test';
  const name = new URL(uri).pathname.slice(1);
  if (!name.endsWith('_test') || ['sticky_notes_assignment_test', 'saraha_security_test'].includes(name)) throw new Error('Postman needs a separate database ending _test');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all(['user', 'note', 'message', 'refreshToken'].map(n => require(`../models/${n}.model`).init()));
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const environment = require('../postman/Saraha_Local.postman_environment.json');
  // Explicit test-runner opt-out; interactive requests send without a mailConfigured flag.
  environment.values.push({ key: 'skipExternalMail', value: 'true', enabled: true });
  environment.values.find(v => v.key === 'baseUrl').value = `http://127.0.0.1:${server.address().port}`;
  const summary = await new Promise((resolve, reject) => newman.run({ collection: require('../postman/Saraha_Backend.postman_collection.json'), environment, reporters: [] }, (error, result) => error ? reject(error) : resolve(result)));
  const result = { stats: summary.run.stats, failures: summary.run.failures.map(f => ({ source: f.source.name, message: f.error.message })) };
  function sanitize(value) {
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, ['accessToken', 'refreshToken', 'Password', 'password', 'tokenHash', 'resetToken', 'code'].includes(key) ? `<redacted-${key}>` : sanitize(v)]));
    return value;
  }
  const examples = {};
  for (const execution of summary.run.executions) {
    if (execution.response) {
      try { examples[execution.item.name] = { status: execution.response.code, body: sanitize(JSON.parse(execution.response.stream.toString())) }; } catch { /* Non-JSON responses remain in failure reports. */ }
    }
  }
  fs.writeFileSync(path.join(__dirname, '../docs/postman-response-examples.json'), JSON.stringify(examples, null, 2) + '\n');
  fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../test-results/postman-summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  // This path is generated above inside the operating system temporary directory.
  fs.rmSync(process.env.AVATAR_DIR, { recursive: true, force: true });
});
