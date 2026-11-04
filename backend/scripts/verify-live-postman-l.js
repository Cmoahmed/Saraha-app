// Real confirmation/cooldown/replay cycle; OTP and authentication stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const newman = require('newman');
const root = path.resolve(__dirname, '..');
const config = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
const collectionPath = path.join(root, 'postman/Saraha_Backend.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(collectionPath));
const folder = collection.item.find(f => f.name.startsWith('L -'));
const email = `verified-l-${crypto.randomBytes(12).toString('hex')}@example.test`;
const password = crypto.randomBytes(32).toString('base64url');
let userId, accessToken, code;
const results = [];
const examples = [];
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
  return { status: response.status, body: await response.json() };
}
const api = (route, body, token) => json(`http://127.0.0.1:3001${route}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
async function run(name, expected) {
  const original = folder.item.find(i => i.name === name);
  const summary = await new Promise((resolve, reject) => newman.run({
    collection: { info: collection.info, item: [original] }, reporters: [], timeoutRequest: 25000, timeoutScript: 3000,
    environment: { values: Object.entries({ baseUrl: 'http://127.0.0.1:3001', part2Token: accessToken, emailOtp: code || '' }).map(([key, value]) => ({ key, value, enabled: true, type: 'secret' })) }
  }, (error, result) => error ? reject(error) : resolve(result)));
  const response = summary.run.executions[0]?.response;
  console.log(JSON.stringify({ stage: 'observed', name, status: response?.code, sent: summary.run.stats.requests.total, failures: summary.run.failures.length, transportCode: summary.run.executions[0]?.requestError?.code }));
  assert.equal(summary.run.stats.requests.total, 1, 'Request must not skip');
  assert.equal(response?.code, expected);
  assert.equal(summary.run.failures.length, 0);
  const body = JSON.parse(response.stream.toString());
  assert.deepEqual(Object.keys(body), ['message']);
  const example = { name: `Observed ${expected} - real Mailpit - ${name}`, originalRequest: structuredClone(original.request),
    status: response.status, code: expected, _postman_previewlanguage: 'json',
    header: response.headers.all().filter(h => !['set-cookie', 'authorization'].includes(h.key.toLowerCase())).map(h => ({ key: h.key, value: h.value })),
    cookie: [], body: JSON.stringify(body, null, 2) };
  examples.push({ name, example });
  results.push({ name, status: expected, assertions: summary.run.stats.assertions.total, failures: 0 });
  console.log(JSON.stringify(results.at(-1)));
}
async function main() {
  assert.ok(/^(127\.0\.0\.1|localhost)$/.test(config.SMTP_HOST || ''));
  const signup = await api('/auth/signup', { name: 'Disposable email verification test', email, password, Phone: '01012345678' });
  assert.equal(signup.status, 201); userId = signup.body.user._id;
  const login = await api('/auth/login', { email, password });
  assert.equal(login.status, 200); accessToken = login.body.accessToken;
  assert.equal((await api('/auth/email/request', {}, accessToken)).status, 200);
  // Must run before confirmation and before the real 60-second cooldown elapses.
  await run('ResendBeforeCooldown', 429);
  const search = await json(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  assert.equal(search.status, 200); assert.equal(search.body.messages.length, 1);
  const message = await json(`http://127.0.0.1:8025/api/v1/message/${encodeURIComponent(search.body.messages[0].ID)}`);
  code = message.body.Text?.match(/confirmation code is (\d{6})/)?.[1];
  assert.ok(code);
  await run('ConfirmEmailValidOTP', 200);
  assert.equal((await api('/auth/profile', undefined, accessToken)).body.user.isEmailVerified, true);
  await run('ConfirmEmailReusedOTP', 400);
  for (const { name, example } of examples) {
    const item = folder.item.find(i => i.name === name);
    item.response = [...(item.response || []).filter(r => r.name !== example.name), example];
  }
  const output = JSON.stringify(examples, null, 2);
  for (const secret of [accessToken, password, code]) assert.ok(!output.includes(secret));
  fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'postman/Verified_Email_Examples.json'), output + '\n');
}
main().catch(error => { console.error('Live email cycle failed; no credential values logged.'); process.exitCode = 1; }).finally(async () => {
  if (userId) {
    const db = await mongoose.createConnection(config.MONGO_URI, { serverSelectionTimeoutMS: 3000 }).asPromise();
    try {
      const id = new mongoose.Types.ObjectId(userId);
      const user = await db.collection('Users').findOne({ _id: id, email });
      if (user) {
        await db.collection('RefreshTokens').deleteMany({ userId: id });
        await db.collection('challenges').deleteMany({ userId: id });
        await db.collection('Users').deleteOne({ _id: id, email });
      }
    } finally { await db.close(); }
  }
  fs.writeFileSync(path.join(root, 'test-results/live-postman-l.json'), JSON.stringify({ realMailpit: true, results, verified: results.length === 3, onlyGeneratedAccountCleaned: !!userId }, null, 2));
});
