const crypto = require('node:crypto');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
process.env.NODE_ENV = 'test';
for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_SECRET']) process.env[k] = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '1025'; process.env.SMTP_SECURE = 'false';
delete process.env.REDIS_URL; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
let server;
async function run() {
  await mongoose.connect(`mongodb://127.0.0.1:27017/saraha_part3_newman_${crypto.randomBytes(6).toString('hex')}_test`);
  await Promise.all(['user', 'note', 'message', 'identity-request', 'conversation', 'conversation-message', 'challenge', 'refreshToken'].map(n => require(`../models/${n}.model`).init()));
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const legacy = process.argv.includes('--legacy');
  const collection = JSON.parse(fs.readFileSync(path.join(__dirname, legacy ? '../postman/Saraha_Backend.postman_collection.json' : '../postman/Saraha_Course_Part3.postman_collection.json')));
  const environment = legacy ? JSON.parse(fs.readFileSync(path.join(__dirname, '../postman/Saraha_Local.postman_environment.json'))) : { values: [] };
  environment.values = environment.values.filter(v => !['baseUrl', 'skipExternalMail'].includes(v.key));
  environment.values.push({ key: 'baseUrl', value: `http://127.0.0.1:${server.address().port}`, enabled: true }, { key: 'skipExternalMail', value: 'true', enabled: true });
  const result = await new Promise((resolve, reject) => require('newman').run({ collection, environment, reporters: [] }, (err, summary) => err ? reject(err) : resolve(summary)));
  const evidence = { stats: result.run.stats, failures: result.run.failures.map(f => ({ request: f.source.name, message: f.error.message })) };
  fs.writeFileSync(path.join(__dirname, legacy ? '../test-results/part3-legacy-postman.json' : '../test-results/part3-postman.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  if (evidence.failures.length) process.exitCode = 1;
}
run().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => { if (server) await new Promise(r => server.close(r)); await mongoose.disconnect(); });
