// Real HTTP + configured MongoDB + Mailpit integration. Never prints credentials or mail bodies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const suffix = crypto.randomBytes(12).toString('hex');
const email = `live-mailpit-${suffix}@example.test`;
const password = crypto.randomBytes(32).toString('base64url');
let userId, token, mailId;
let observedExample;
const events = [];
async function call(stage, url, options = {}, timeout = 5000) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
    const data = await response.json();
    const result = { stage, status: response.status, elapsedMs: Date.now() - started };
    if (stage === 'email-request') result.workflowVersion = response.headers.get('x-email-workflow-version');
    events.push(result); console.log(JSON.stringify(result));
    return { response, data };
  } catch (error) {
    const result = { stage, clientDeadlineExceeded: error.name === 'TimeoutError', elapsedMs: Date.now() - started, errorType: error.name, ...(error.cause?.code ? { code: error.cause.code } : {}) };
    events.push(result); console.log(JSON.stringify(result)); throw new Error(`Stage failed: ${stage}`);
  }
}
const api = (stage, route, body, timeout) => call(stage, `http://127.0.0.1:3001${route}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
}, timeout);
async function main() {
  assert.ok(/^(127\.0\.0\.1|localhost)$/.test(env.SMTP_HOST || ''), 'Expected explicitly configured local Mailpit SMTP');
  assert.equal(env.SMTP_PORT, '1025');
  const account = await api('signup', '/auth/signup', { name: 'Disposable live Mailpit verification', email, password, Phone: '01012345678' });
  assert.equal(account.response.status, 201);
  userId = account.data.user._id;
  // Obtain a real token from password authentication, not a signed fixture or direct database insertion.
  const login = await api('login', '/auth/login', { email, password });
  assert.equal(login.response.status, 200); token = login.data.accessToken;
  const profile = await api('profile-before', '/auth/profile');
  assert.equal(profile.response.status, 200); assert.equal(profile.data.user.isEmailVerified, false);
  let requestResult;
  try {
    if (process.argv.includes('--postman-runtime') || process.argv.includes('--clean-collection')) {
      const newman = require('newman');
      const collection = JSON.parse(fs.readFileSync(path.join(__dirname, process.argv.includes('--clean-collection') ? '../postman/Saraha_Email_Verification_Live.postman_collection.json' : '../postman/Saraha_Backend.postman_collection.json')));
      const folder = process.argv.includes('--clean-collection') ? collection : collection.item.find(item => item.name.startsWith('L -'));
      const item = folder.item.find(item => item.name === (process.argv.includes('--clean-collection') ? '2 - Request Email Verification' : 'RequestEmailVerification'));
      const started = Date.now();
      const summary = await new Promise((resolve, reject) => newman.run({
        collection: { info: collection.info, event: collection.event, item: [item] }, reporters: [],
        environment: { values: [
          { key: 'baseUrl', value: 'http://localhost:3001', enabled: true },
          { key: 'accessToken', value: token, enabled: true },
          { key: 'part2Token', value: token, enabled: true }
        ] }, timeoutRequest: 25000, timeoutScript: 3000
      }, (error, result) => error ? reject(error) : resolve(result)));
      const response = summary.run.executions[0]?.response;
      if (process.argv.includes('--save-example') && response?.code === 200) {
        const body = JSON.parse(response.stream.toString());
        assert.deepEqual(Object.keys(body), ['message']);
        observedExample = {
          name: 'Observed 200 - real Mailpit delivery and OTP verified',
          originalRequest: item.request,
          status: 'OK', code: 200, _postman_previewlanguage: 'json',
          header: response.headers.all().filter(header => ['content-type', 'date', 'x-email-workflow-version', 'x-email-request-id'].includes(header.key.toLowerCase())).map(header => ({ key: header.key, value: header.value })),
          cookie: [], body: JSON.stringify(body, null, 2)
        };
      }
      const requestError = summary.run.executions[0]?.requestError || summary.run.failures.find(f => f.error?.code)?.error;
      const result = { stage: 'email-request', client: 'real Postman Runtime/Newman',
        status: response?.code, elapsedMs: Date.now() - started,
        workflowVersion: response?.headers.get('x-email-workflow-version'),
        requests: summary.run.stats.requests.total, assertions: summary.run.stats.assertions.total,
        failures: summary.run.failures.length,
        ...(requestError ? { transportError: { name: requestError.name, code: requestError.code,
          loopbackAddress: ['127.0.0.1', '::1'].includes(requestError.address) ? requestError.address : undefined } } : {}) };
      events.push(result); console.log(JSON.stringify(result));
      assert.equal(result.requests, 1); assert.equal(result.failures, 0);
      requestResult = { response: { status: response?.code } };
    } else requestResult = await api('email-request', '/auth/email/request', {}, 25000);
  }
  catch { /* Still inspect this unique recipient's inbox after a client deadline. */ }
  const searchUrl = `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  const search = await call('mailpit-search', searchUrl);
  assert.equal(search.response.status, 200);
  const messages = search.data.messages || [];
  console.log(JSON.stringify({ stage: 'mailpit-capture', messagesForDisposableRecipient: messages.length }));
  if (!messages.length || requestResult?.response.status !== 200) {
    events.push({ stage: 'live-flow', success: false, capturedMessages: messages.length });
    process.exitCode = 1; return;
  }
  mailId = messages[0].ID;
  const message = await call('mailpit-message', `http://127.0.0.1:8025/api/v1/message/${encodeURIComponent(mailId)}`);
  const code = message.data.Text?.match(/confirmation code is (\d{6})/)?.[1];
  assert.ok(code, 'Expected a confirmation code in the matched test message');
  const confirmed = await api('confirm-email', '/auth/email/confirm', { code });
  assert.equal(confirmed.response.status, 200);
  const profileAfter = await api('profile-after', '/auth/profile');
  assert.equal(profileAfter.data.user.isEmailVerified, true);
  const replay = await api('replay-otp', '/auth/email/confirm', { code });
  assert.equal(replay.response.status, 400);
  events.push({ stage: 'live-flow', success: true, realMailpitCapture: true, verified: true, replayRejected: true });
  console.log(JSON.stringify(events.at(-1)));
  if (observedExample) {
    const destination = path.join(__dirname, '../postman/Saraha_Email_Verification_Live.postman_collection.json');
    const saved = JSON.parse(fs.readFileSync(destination));
    saved.item.find(item => item.name === '2 - Request Email Verification').response = [observedExample];
    saved.info.description += ' The saved HTTP 200 example was captured from the real backend by Postman Runtime/Newman, with actual Mailpit delivery and successful OTP confirmation. Credentials are placeholders, not saved values.';
    fs.writeFileSync(destination, JSON.stringify(saved, null, 2) + '\n');
    console.log('Saved actual HTTP 200 example with no credentials or OTP values.');
  }
}
main().catch(() => { console.error('Live Mailpit check failed; see sanitized stage results.'); process.exitCode = 1; }).finally(async () => {
  try {
    if (userId) {
      // Delete only the exact generated account and its own temporary state; never drop a database.
      const db = await mongoose.createConnection(env.MONGO_URI, { serverSelectionTimeoutMS: 3000 }).asPromise();
      try {
        const id = new mongoose.Types.ObjectId(userId);
        const owned = await db.collection('Users').findOne({ _id: id, email });
        if (owned) {
          for (const collection of ['RefreshTokens', 'challenges']) await db.collection(collection).deleteMany({ userId: id });
          await db.collection('Users').deleteOne({ _id: id, email });
          events.push({ stage: 'cleanup', onlyGeneratedAccountRemoved: true });
        }
      } finally { await db.close(); }
    }
  } catch { console.error('Generated account cleanup needs retry; existing records were not targeted.'); process.exitCode = 1; }
  fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, process.argv.includes('--clean-collection') ? '../test-results/live-mailpit-clean-collection.json' : process.argv.includes('--postman-runtime') ? '../test-results/live-mailpit-postman-runtime.json' : '../test-results/live-mailpit.json'), JSON.stringify(events, null, 2));
});
