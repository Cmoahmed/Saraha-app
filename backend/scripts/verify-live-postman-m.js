// Execute the actual folder M against the running backend and Mailpit. No mock transports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const newman = require('newman');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const config = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
const tag = crypto.randomBytes(12).toString('hex');
const email = `verified-m-${tag}@example.test`;
const oldPassword = crypto.randomBytes(32).toString('base64url');
const newPassword = crypto.randomBytes(32).toString('base64url');
const sourcePath = path.join(root, 'postman/Saraha_Backend.postman_collection.json');
const destination = path.join(root, 'postman/Saraha_Verified_Password_Reset_Uploads.postman_collection.json');
const source = JSON.parse(fs.readFileSync(sourcePath));
const originals = source.item.find(f => f.name.startsWith('M -'));
assert.equal(originals.item.length, 15);
const runtime = structuredClone(originals);
let userId, initialAccess, initialRefresh, latestAccess, firstAvatar;
const avatars = new Set();
const report = { realBackend: true, realMailpit: true, requests: [], additionalChecks: [] };

async function http(url, options = {}, timeout = 25000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const body = response.headers.get('content-type')?.includes('json') ? JSON.parse(bytes.toString()) : bytes;
  return { response, body };
}
const api = (route, body, token) => http(`http://127.0.0.1:3001${route}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['accessToken', 'refreshToken', 'resetToken', 'password', 'Password', 'tokenHash', 'verifier', 'code'].includes(key) ? `<redacted-${key}>` : redact(item)]));
  return value;
}
function expected(item) {
  return Number(item.event.find(e => e.listen === 'test').script.exec[0].match(/HTTP (\d+)/)[1]);
}
function safeRequest(item) {
  const request = structuredClone(item.request);
  if (request.body?.mode === 'raw') {
    const body = JSON.parse(request.body.raw);
    if (body.password) body.password = ['RejectOldPassword'].includes(item.name) ? '{{part2Password}}' : '{{part2NewPassword}}';
    request.body.raw = JSON.stringify(body, null, 2);
  }
  return request;
}
async function main() {
  assert.ok(/^(127\.0\.0\.1|localhost)$/.test(config.SMTP_HOST || ''), 'Expected configured local SMTP');
  assert.equal(config.SMTP_PORT, '1025');
  const signup = await api('/auth/signup', { name: 'Verified M test account', email, password: oldPassword, Phone: '01012345678', username: `v_${tag}` });
  assert.equal(signup.response.status, 201); userId = signup.body.user._id;
  const login = await api('/auth/login', { email, password: oldPassword });
  assert.equal(login.response.status, 200);
  initialAccess = login.body.accessToken; initialRefresh = login.body.refreshToken;
  const forgot = await api('/auth/password/forgot', { email });
  assert.equal(forgot.response.status, 200);
  let messages = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const search = await http(`http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    assert.equal(search.response.status, 200); messages = search.body.messages || [];
    if (messages.length) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(messages.length, 1, 'Expected one recovery message for the unique test recipient');
  const message = await http(`http://127.0.0.1:8025/api/v1/message/${encodeURIComponent(messages[0].ID)}`);
  const recoveryOtp = message.body.Text?.match(/recovery code is (\d{6})/)?.[1];
  assert.ok(recoveryOtp, 'Expected recovery OTP in the real Mailpit message');
  report.mailpitMessageReceived = true;
  console.log('Real Mailpit recovery email received; code retained privately in memory.');
  const environment = { name: 'Ephemeral verified M runtime', values: Object.entries({
    baseUrl: 'http://127.0.0.1:3001', part2Email: email, part2Token: initialAccess,
    part2Refresh: initialRefresh, recoveryOtp, resetToken: '', avatarUrl: ''
  }).map(([key, value]) => ({ key, value, enabled: true, type: 'secret' })) };
  for (const item of runtime.item) {
    if (item.request.body?.mode === 'raw') {
      const body = JSON.parse(item.request.body.raw);
      if (body.password) body.password = item.name === 'RejectOldPassword' ? oldPassword : newPassword;
      item.request.body.raw = JSON.stringify(body);
    }
    if (item.request.body?.mode === 'formdata') for (const field of item.request.body.formdata) {
      if (field.type === 'file') field.src = path.join(root, field.src);
    }
  }
  // Run the exact requests and test scripts one at a time; retain credentials only in memory.
  const observed = [];
  for (const [index, item] of runtime.item.entries()) {
    const started = Date.now();
    const summary = await new Promise((resolve, reject) => newman.run({
      collection: { info: source.info, item: [item] }, environment,
      workingDir: root, reporters: [], timeoutRequest: 25000, timeoutScript: 3000
    }, (error, result) => error ? reject(error) : resolve(result)));
    const execution = summary.run.executions[0];
    const response = execution?.response;
    const entry = { name: item.name, expected: expected(originals.item[index]), status: response?.code,
      elapsedMs: Date.now() - started, assertions: summary.run.stats.assertions.total, failures: summary.run.failures.length };
    report.requests.push(entry); console.log(JSON.stringify(entry));
    assert.equal(summary.run.stats.requests.total, 1, `Request skipped: ${item.name}`);
    assert.equal(entry.failures, 0, `Request failed: ${item.name}`);
    assert.equal(response?.code, entry.expected);
    environment.values = summary.environment.toJSON().values;
    const read = key => environment.values.find(v => v.key === key)?.value;
    latestAccess = read('part2Token');
    const binary = response.headers.get('content-type')?.includes('image/');
    const bytes = Buffer.from(response.stream);
    let body;
    if (binary) {
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, 'webp'); assert.ok(metadata.width <= 512 && metadata.height <= 512);
      body = bytes.toString('latin1');
      fs.writeFileSync(path.join(root, 'postman/fixtures/observed-avatar.webp'), bytes);
      report.avatar = { format: metadata.format, width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    } else body = JSON.stringify(redact(JSON.parse(bytes.toString())), null, 2);
    const example = { name: `Observed ${response.code} - real backend and Mailpit`, originalRequest: safeRequest(originals.item[index]),
      status: response.status, code: response.code, _postman_previewlanguage: binary ? 'text' : 'json',
      header: response.headers.all().filter(h => !['set-cookie', 'authorization'].includes(h.key.toLowerCase())).map(h => ({ key: h.key, value: h.value })),
      cookie: [], body,
      ...(binary ? { stream: bytes.toJSON() } : {}) };
    observed.push({ name: item.name, example });
    if (['UploadValidAvatar', 'ReplaceAvatar'].includes(item.name)) {
      const result = JSON.parse(bytes.toString());
      assert.match(result.avatar, /^\/avatars\/[a-f\d-]{36}\.webp$/);
      avatars.add(result.avatar); if (!firstAvatar) firstAvatar = result.avatar;
    }
    if (item.name === 'ResetPassword') {
      assert.equal((await api('/auth/profile', undefined, initialAccess)).response.status, 401);
      assert.equal((await api('/auth/refresh', { refreshToken: initialRefresh })).response.status, 401);
      report.additionalChecks.push('Password reset rejected both original access and refresh sessions');
    }
    if (item.name === 'ReplaceAvatar') {
      assert.equal((await http(`http://127.0.0.1:3001${firstAvatar}`)).response.status, 404);
      report.additionalChecks.push('Replacing avatar removed the previous generated file');
    }
    if (item.name === 'GetProfileAfterResetOrUpload') {
      const result = JSON.parse(bytes.toString());
      assert.equal(result.user._id, userId); assert.equal(result.user.role, 'user'); assert.equal(result.user.email, email);
      report.additionalChecks.push('Password reset preserved user identity, email, username and role');
    }
    if (item.name === 'CleanupPart2Account') {
      assert.equal((await api('/auth/profile', undefined, latestAccess)).response.status, 401);
      report.additionalChecks.push('Cleanup deleted the generated account and rejected its session');
    }
  }
  assert.equal(observed.length, 15);
  // Append only this run's named examples; preserve all other requests and user examples.
  for (const item of originals.item) {
    const found = observed.find(o => o.name === item.name);
    item.response = [...(item.response || []).filter(r => r.name !== found.example.name), found.example];
  }
  fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2) + '\n');
  const verifiedItems = originals.item.map(item => ({ ...structuredClone(item), request: safeRequest(item),
    description: 'Executed against the running localhost backend using a dedicated account and real Mailpit. Saved JSON credentials are redacted. The test account was cleaned up; rerun scripts/verify-live-postman-m.js for a fresh complete cycle.' }));
  const exported = { info: { name: 'Saraha - Verified Password Reset and Avatar Uploads',
    schema: source.info.schema, _postman_id: fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination)).info._postman_id : crypto.randomUUID(),
    description: 'All 15 screenshot requests were executed against the real running backend. Recovery code was obtained privately from Mailpit. These are observed responses, with credentials redacted. GetPublicAvatar preserves its actual binary WebP stream. No existing user account was reset or deleted.' },
    item: [{ name: 'M - Verified live responses (15 requests)', item: verifiedItems }] };
  const text = JSON.stringify(exported, null, 2) + '\n';
  for (const secret of [oldPassword, newPassword, initialAccess, initialRefresh, latestAccess, recoveryOtp]) assert.ok(!secret || !text.includes(secret), 'Sensitive value in saved artifact');
  assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text), 'JWT in saved artifact');
  fs.writeFileSync(destination, text);
  report.success = true; report.savedExamples = observed.length;
  console.log(JSON.stringify({ success: true, executed: observed.length, savedExamples: observed.length,
    assertions: report.requests.reduce((n, r) => n + r.assertions, 0), failures: 0 }));
}
main().catch(error => { report.success = false; report.failureType = error.name; console.error('Live folder M verification failed; see sanitized status report.'); process.exitCode = 1; }).finally(async () => {
  try {
    if (userId) {
      const db = await mongoose.createConnection(config.MONGO_URI, { serverSelectionTimeoutMS: 3000 }).asPromise();
      try {
        const id = new mongoose.Types.ObjectId(userId);
        const existing = await db.collection('Users').findOne({ _id: id });
        assert.ok(!existing || existing.email === email, 'Cleanup ownership mismatch');
        await db.collection('RefreshTokens').deleteMany({ userId: id });
        await db.collection('challenges').deleteMany({ userId: id });
        await db.collection('Users').deleteOne({ _id: id, email });
        report.onlyGeneratedAccountCleaned = true;
      } finally { await db.close(); }
    }
    const directory = path.resolve(config.AVATAR_DIR || path.join(root, 'uploads/avatars'));
    for (const url of avatars) {
      const name = url.slice('/avatars/'.length);
      assert.match(name, /^[a-f\d-]{36}\.webp$/);
      const file = path.resolve(directory, name);
      assert.equal(path.dirname(file), directory);
      try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  } catch { report.cleanupFailed = true; process.exitCode = 1; console.error('Generated-data cleanup needs attention; existing records were not targeted.'); }
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results/live-postman-m.json'), JSON.stringify(report, null, 2) + '\n');
});
