const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
process.env.NODE_ENV = 'test';
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_SECRET']) process.env[key] = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
delete process.env.REDIS_URL;
const app = require('../app');
const Users = require('../models/user.model');
const Messages = require('../models/message.model');
const Requests = require('../models/identity-request.model');
const Conversations = require('../models/conversation.model');
const Chat = require('../models/conversation-message.model');
const Challenges = require('../models/challenge.model');
const Sessions = require('../models/refreshToken.model');
const mail = require('../services/email.service');
const otp = require('../services/otp.service');
const captures = [];
const capture = { async sendMail(m) { captures.push(m); return {}; } };
mail.useTestTransport(capture);
const code = () => captures.at(-1).text.match(/\b\d{6}\b/)[0];
const password = 'part3-course-password';
let a, b, outsider, hidden, accepted, conversation;
const auth = u => ({ Authorization: `Bearer ${u.accessToken}` });
const login = (email, value = password) => request(app).post('/auth/login').send({ email, password: value });
async function signup(name) {
  return (await request(app).post('/auth/signup').send({ name, email: `${name}@example.test`, username: name, Phone: '01012345678', password }).expect(201)).body;
}
before(async () => {
  // Each run uses a new isolated database. No real development records or collections are removed.
  const name = `saraha_part3_${crypto.randomBytes(6).toString('hex')}_test`;
  await mongoose.connect(`mongodb://127.0.0.1:27017/${name}`, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Users, Messages, Requests, Conversations, Chat, Challenges, Sessions].map(m => m.init()));
  a = await signup('sender_part3'); b = await signup('recipient_part3'); outsider = await signup('outsider_part3');
  await Users.updateOne({ _id: outsider.user._id }, { $set: { role: 'admin' } });
});
after(async () => { await mongoose.disconnect(); });
beforeEach(() => {
  // Independent scenarios share one in-process app; clear only its HTTP OTP limiter.
  // Mongo account lockout and per-challenge attempt counters remain authoritative and intact.
  const limit = require('../routes/two-factor.routes').otpLimiter;
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1']) limit.resetKey(require('express-rate-limit').ipKeyGenerator(ip));
});

test('A1 hidden sender is stored privately; forged identities, self, unknown recipients and invalid content rejected', async () => {
  for (const body of [{ content: '' }, { content: 'x', senderId: outsider.user._id }, { content: 'x'.repeat(2001) }]) await request(app).post(`/messages/hidden/${b.user._id}`).set(auth(a)).send(body).expect(400);
  await request(app).post(`/messages/hidden/${b.user._id}`).send({ content: 'x' }).expect(401);
  await request(app).post(`/messages/hidden/${a.user._id}`).set(auth(a)).send({ content: 'x' }).expect(400);
  await request(app).post('/messages/hidden/not_registered').set(auth(a)).send({ content: 'x' }).expect(404);
  hidden = (await request(app).post(`/messages/hidden/${b.user._id}`).set(auth(a)).send({ content: 'Private sender' }).expect(201)).body.message;
  assert.equal(hidden.senderId, undefined);
  const inbox = (await request(app).get('/messages').set(auth(b)).expect(200)).body;
  assert.equal(inbox.messages[0].senderId, undefined);
  assert.equal((await request(app).get(`/messages/${hidden._id}`).set(auth(b)).expect(200)).body.message.senderId, undefined);
  assert.equal(String((await Messages.findById(hidden._id).select('+senderId')).senderId), a.user._id);
});
test('A2 ownership, pending request, duplicate prevention and legacy guest compatibility', async () => {
  await request(app).post(`/messages/${hidden._id}/identity-request`).set(auth(outsider)).send({}).expect(404);
  const item = (await request(app).post(`/messages/${hidden._id}/identity-request`).set(auth(b)).send({}).expect(201)).body.request;
  assert.equal(item.status, 'pending'); assert.equal(item.senderId, undefined);
  accepted = item._id;
  await request(app).post(`/messages/${hidden._id}/identity-request`).set(auth(b)).send({}).expect(409);
  await request(app).post(`/messages/public/${b.user._id}`).send({ content: 'Guest' }).expect(201);
  const guest = await Messages.findOne({ recipientId: b.user._id, content: 'Guest' });
  await request(app).post(`/messages/${guest.id}/identity-request`).set(auth(b)).send({}).expect(409);
});
test('A3 pagination, status filters and incoming request ownership', async () => {
  const list = (await request(app).get('/identity-requests?status=pending&limit=1').set(auth(a)).expect(200)).body;
  assert.equal(list.total, 1); assert.equal(list.items[0]._id, accepted); assert.equal(list.totalPages, 1);
  assert.equal((await request(app).get('/identity-requests').set(auth(outsider)).expect(200)).body.total, 0);
  for (const query of ['page=0', 'limit=101', 'status=unknown', 'page=no', 'senderId=x']) await request(app).get(`/identity-requests?${query}`).set(auth(a)).expect(400);
});
test('A4 rejected identity stays hidden; concurrent acceptance has one winner; disclosure restricted', async () => {
  const msg = (await request(app).post(`/messages/hidden/${b.user._id}`).set(auth(a)).send({ content: 'Reject this request' }).expect(201)).body.message;
  const reject = (await request(app).post(`/messages/${msg._id}/identity-request`).set(auth(b)).send({}).expect(201)).body.request;
  await request(app).patch(`/identity-requests/${reject._id}`).set(auth(a)).send({ status: 'rejected' }).expect(200);
  assert.equal((await request(app).get(`/identity-requests/${reject._id}`).set(auth(b)).expect(200)).body.sender, undefined);
  await request(app).post(`/identity-requests/${reject._id}/conversation`).set(auth(b)).send({}).expect(404);
  await request(app).patch(`/identity-requests/${accepted}`).set(auth(b)).send({ status: 'accepted' }).expect(404);
  const results = await Promise.all([1, 2].map(() => request(app).patch(`/identity-requests/${accepted}`).set(auth(a)).send({ status: 'accepted' })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 404]);
  const disclosure = (await request(app).get(`/identity-requests/${accepted}`).set(auth(b)).expect(200)).body;
  assert.equal(disclosure.sender._id, a.user._id); assert.equal(disclosure.sender.email, undefined); assert.equal(disclosure.sender.Phone, undefined);
  await request(app).get(`/identity-requests/${accepted}`).set(auth(outsider)).expect(404);
});
test('A5 only accepted participants create; unique conversation links request, original message and two users', async () => {
  await request(app).post(`/identity-requests/${accepted}/conversation`).set(auth(outsider)).send({}).expect(404);
  const results = await Promise.all([a, b].map(u => request(app).post(`/identity-requests/${accepted}/conversation`).set(auth(u)).send({}).expect(201)));
  conversation = results[0].body.conversation;
  assert.equal(results[1].body.conversation._id, conversation._id);
  assert.equal(await Conversations.countDocuments({ requestId: accepted }), 1);
  assert.equal(conversation.messageId, hidden._id);
  assert.deepEqual(conversation.participants.slice().sort(), [a.user._id, b.user._id].sort());
  assert.ok(await Messages.findById(hidden._id));
});
test('A6 both participants send; admin outsider, forged sender and empty content rejected', async () => {
  const url = `/conversations/${conversation._id}/messages`;
  for (const u of [a, b]) {
    const msg = (await request(app).post(url).set(auth(u)).send({ content: `Hello from ${u.user.name}` }).expect(201)).body.message;
    assert.equal(msg.senderId, u.user._id);
  }
  await request(app).post(url).set(auth(outsider)).send({ content: 'Intrusion' }).expect(404);
  await request(app).post(url).set(auth(a)).send({ content: 'Forged', senderId: b.user._id }).expect(400);
  await request(app).post(url).set(auth(a)).send({ content: ' ' }).expect(400);
});
test('A7 both participants read with stable pagination; third user including admin has no access', async () => {
  const url = `/conversations/${conversation._id}/messages`;
  for (const u of [a, b]) {
    const list = (await request(app).get(`${url}?limit=1`).set(auth(u)).expect(200)).body;
    assert.equal(list.total, 2); assert.equal(list.hasNextPage, true);
    assert.notEqual(list.items[0]._id, (await request(app).get(`${url}?limit=1&page=2`).set(auth(u)).expect(200)).body.items[0]._id);
  }
  await request(app).get(url).set(auth(outsider)).expect(404);
  await request(app).get(url).expect(401);
  await request(app).get('/conversations/invalid/messages').set(auth(a)).expect(400);
});
test('B1 five consecutive failures lock exactly five minutes; correct password blocked and legacy cannot bypass', async () => {
  const start = Date.now();
  for (let n = 1; n <= 4; n++) {
    await login(a.user.email, 'wrong').expect(401);
    assert.equal((await Users.findById(a.user._id).select('+failedLoginAttempts')).failedLoginAttempts, n);
  }
  await login(a.user.email, 'wrong').expect(429);
  const locked = await Users.findById(a.user._id).select('+lockUntil +failedLoginAttempts');
  assert.equal(locked.failedLoginAttempts, 5);
  assert.ok(+locked.lockUntil >= start + 300000 && +locked.lockUntil <= Date.now() + 300000);
  const expiry = +locked.lockUntil;
  await login(a.user.email).expect(429);
  await request(app).post('/users/login').send({ email: a.user.email, password }).expect(429);
  assert.equal(+(await Users.findById(a.user._id).select('+lockUntil')).lockUntil, expiry);
  await login(b.user.email).expect(200);
  // Simulate persisted expiry without waiting five real minutes or affecting driver timers.
  await Users.updateOne({ _id: a.user._id }, { $set: { lockUntil: new Date(Date.now() - 1) } });
  await login(a.user.email).expect(200);
  assert.equal((await Users.findById(a.user._id).select('+failedLoginAttempts')).failedLoginAttempts, 0);
  const legacy = (await request(app).post('/users/login').send({ email: a.user.email, password }).expect(200)).body;
  assert.equal(legacy.user.failedLoginAttempts, undefined); assert.equal(legacy.user.lockUntil, undefined);
  await login(a.user.email, 'wrong').expect(401); await login(a.user.email).expect(200);
  assert.equal((await Users.findById(a.user._id).select('+failedLoginAttempts')).failedLoginAttempts, 0);
});
test('B1 concurrent failures stop at five; expired lock starts a new consecutive sequence', async () => {
  const results = await Promise.all(Array.from({ length: 7 }, () => login(outsider.user.email, 'wrong')));
  assert.equal(results.filter(r => r.status === 401).length, 4);
  assert.equal(results.filter(r => r.status === 429).length, 3);
  assert.equal((await Users.findById(outsider.user._id).select('+failedLoginAttempts')).failedLoginAttempts, 5);
  await Users.updateOne({ _id: outsider.user._id }, { $set: { lockUntil: new Date(0) } });
  await login(outsider.user.email, 'wrong').expect(401);
  assert.equal((await Users.findById(outsider.user._id).select('+failedLoginAttempts')).failedLoginAttempts, 1);
});
test('B1 fake clock enforces the exact 299999ms/300000ms lock expiry boundary', async t => {
  const start = Date.now();
  await Users.updateOne({ _id: a.user._id }, { $set: { failedLoginAttempts: 5, lockUntil: new Date(start + 300000) } });
  t.mock.timers.enable({ apis: ['Date'], now: start });
  try {
    t.mock.timers.tick(299999);
    await login(a.user.email).expect(429);
    t.mock.timers.tick(1);
    await login(a.user.email).expect(200);
  } finally { t.mock.timers.reset(); }
});
test('B2 enabling requires authenticated verified email; wrong, expired and replayed OTP cannot enable', async () => {
  await request(app).post('/auth/2fa/request').send({}).expect(401);
  await request(app).post('/auth/2fa/request').set(auth(b)).send({}).expect(403);
  await Users.updateOne({ _id: b.user._id }, { $set: { isEmailVerified: true } });
  await request(app).post('/auth/2fa/request').set(auth(b)).send({}).expect(200);
  assert.equal((await Users.findById(b.user._id)).isTwoFactorEnabled, false);
  const first = code();
  await request(app).post('/auth/2fa/enable').set(auth(b)).send({ code: '000000' }).expect(400);
  await Challenges.updateOne({ userId: b.user._id, purpose: 'enable2fa' }, { $set: { expiresAt: new Date(0) } });
  await request(app).post('/auth/2fa/enable').set(auth(b)).send({ code: first }).expect(400);
  await request(app).post('/auth/2fa/request').set(auth(b)).send({}).expect(200);
  await request(app).post('/auth/2fa/enable').set(auth(b)).send({ code: code() }).expect(200);
  assert.equal((await Users.findById(b.user._id)).isTwoFactorEnabled, true);
  await assert.rejects(otp.consume(b.user._id, 'enable2fa', code()));
  await request(app).get('/auth/profile').set(auth(b)).expect(401);
});
test('B2 password step creates no tokens or sessions; wrong OTP, correct single use, refresh and logout', async () => {
  const before = await Sessions.countDocuments({ userId: b.user._id });
  const pending = (await login(b.user.email).expect(200)).body;
  assert.equal(pending.requiresTwoFactor, true); assert.equal(pending.accessToken, undefined); assert.equal(pending.refreshToken, undefined);
  assert.equal(await Sessions.countDocuments({ userId: b.user._id }), before);
  const value = code();
  await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: '000000' }).expect(400);
  const done = (await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: value }).expect(200)).body;
  assert.ok(done.accessToken && done.refreshToken);
  await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: value }).expect(400);
  await request(app).get('/auth/profile').set(auth(done)).expect(200);
  const refreshed = (await request(app).post('/auth/refresh').send({ refreshToken: done.refreshToken }).expect(200)).body;
  await request(app).post('/auth/logout').set(auth(refreshed)).expect(200);
  await request(app).get('/auth/profile').set(auth(refreshed)).expect(401);
});
test('B2 OTP expiry, attempt exhaustion, purpose isolation and SMTP failure create no session', async () => {
  await login(b.user.email).expect(200); const value = code();
  await assert.rejects(otp.consume(b.user._id, 'enable2fa', value));
  await Challenges.updateOne({ userId: b.user._id, purpose: 'login2fa' }, { $set: { expiresAt: new Date(0) } });
  await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: value }).expect(400);
  await login(b.user.email).expect(200);
  const next = code();
  for (let i = 0; i < 5; i++) await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: '000000' }).expect(400);
  await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: next }).expect(400);
  await Challenges.updateOne({ userId: b.user._id, purpose: 'login2fa' }, { $set: { expiresAt: new Date(0) } });
  const count = await Sessions.countDocuments({ userId: b.user._id });
  mail.useTestTransport({ async sendMail() { throw new Error('SMTP offline'); } });
  await login(b.user.email).expect(503);
  assert.equal(await Sessions.countDocuments({ userId: b.user._id }), count);
  assert.equal(await Challenges.countDocuments({ userId: b.user._id, purpose: 'login2fa' }), 0);
  mail.useTestTransport(capture);
});
test('security headers, CORS allowlist, forged proxy isolation, readiness and rate limiter fail-closed behavior', async () => {
  const good = await request(app).get('/health').set('Origin', 'http://localhost:4200').expect(200);
  assert.equal(good.headers['x-content-type-options'], 'nosniff'); assert.equal(good.headers['access-control-allow-origin'], 'http://localhost:4200');
  assert.equal((await request(app).get('/health').set('Origin', 'https://evil.example').expect(200)).headers['access-control-allow-origin'], undefined);
  await request(app).options('/auth/login').set('Origin', 'http://localhost:4200').set('Access-Control-Request-Method', 'POST').expect(204);
  await request(app).get('/ready').expect(200); assert.equal(app.get('trust proxy'), false);
  await request(app).get('/IDENTITY-REQUESTS/').set(auth(a)).expect(200);
  const { key, RedisStore } = require('../middleware/course-rate-limit');
  assert.equal(key({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '1.2.3.4' } }), key({ ip: '127.0.0.1' }));
  assert.notEqual(key({ ip: '127.0.0.1' }), key({ ip: '127.0.0.2' }));
  const store = new RedisStore('test'); store.init({ windowMs: 1000 });
  await assert.rejects(store.increment('synthetic'), { status: 503 });
  const isolated = require('express')();
  isolated.get('/', require('../middleware/course-rate-limit').limiter('threshold', 2), (req, res) => res.json({ ok: true }));
  await request(isolated).get('/').expect(200); await request(isolated).get('/').expect(200);
  const limited = await request(isolated).get('/').expect(429);
  assert.ok(limited.headers['retry-after']); assert.ok(limited.headers.ratelimit);
});
test('real Nodemailer SMTP to Mailpit captures enable and login OTPs before token issuance', async () => {
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '1025'; process.env.SMTP_SECURE = 'false';
  delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  mail.useTestTransport(undefined);
  const u = await signup('mailpit_part3');
  await Users.updateOne({ _id: u.user._id }, { $set: { isEmailVerified: true } });
  async function mailCode() {
    const list = await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json();
    const found = list.messages.find(m => m.To.some(to => to.Address === u.user.email));
    assert.ok(found, 'Mailpit actually captured a message addressed to this synthetic account');
    const message = await (await fetch(`http://127.0.0.1:8025/api/v1/message/${found.ID}`)).json();
    return message.Text.match(/\b\d{6}\b/)[0];
  }
  try {
    await request(app).post('/auth/2fa/request').set(auth(u)).send({}).expect(200);
    await request(app).post('/auth/2fa/enable').set(auth(u)).send({ code: await mailCode() }).expect(200);
    const pending = (await login(u.user.email).expect(200)).body;
    assert.equal(pending.accessToken, undefined); assert.equal(pending.refreshToken, undefined);
    const done = (await request(app).post('/auth/2fa/login').send({ userId: u.user._id, code: await mailCode() }).expect(200)).body;
    assert.ok(done.accessToken && done.refreshToken);
    await request(app).get('/auth/profile').set(auth(done)).expect(200);
  } finally { mail.useTestTransport(capture); }
});
test('B2 password generation changes invalidate pending second-factor OTPs', async () => {
  await login(b.user.email).expect(200); const value = code();
  await Users.updateOne({ _id: b.user._id }, { $inc: { authVersion: 1 } });
  await request(app).post('/auth/2fa/login').send({ userId: b.user._id, code: value }).expect(400);
});
test('B2 Google verified adapter also gates enabled accounts on OTP and preserves admin role', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const original = OAuth2Client.prototype.verifyIdToken;
  const previous = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'part3-mocked-client';
  await Users.updateOne({ _id: outsider.user._id }, { $set: { googleId: 'part3-google-subject', isEmailVerified: true, isTwoFactorEnabled: true } });
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: 'part3-google-subject', email: outsider.user.email, email_verified: true }) });
  try {
    const pending = (await request(app).post('/auth/google').send({ idToken: 'mocked-verified-adapter-token' }).expect(200)).body;
    assert.equal(pending.requiresTwoFactor, true); assert.equal(pending.accessToken, undefined);
    const done = (await request(app).post('/auth/2fa/login').send({ userId: outsider.user._id, code: code() }).expect(200)).body;
    assert.equal(done.user.role, 'admin');
    await request(app).get('/auth/admin/status').set(auth(done)).expect(200);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previous;
  }
});
test('production server starts privately, serves health/readiness and disables legacy Assignment 8 routes', async () => {
  const net = require('node:net');
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = require('node:child_process').spawn(process.execPath, ['server.js'], {
    cwd: require('node:path').join(__dirname, '..'), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', MONGO_URI: `mongodb://127.0.0.1:27017/${mongoose.connection.name}`, LEGACY_ASSIGNMENT_MODE: 'false' }
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    let healthy = false;
    for (let n = 0; n < 80; n++) {
      try { healthy = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(250) })).status === 200; } catch {}
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(healthy, true);
    assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/users/signup`, { method: 'POST' })).status, 404);
  } finally { child.kill(); await exited; }
});
