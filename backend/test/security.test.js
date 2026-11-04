const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
const app = require('../app');
const Users = require('../models/user.model');
const Sessions = require('../models/refreshToken.model');
const Messages = require('../models/message.model');
const passwords = require('../utils/password');
const enc = require('../services/encryption.service');
const tokens = require('../services/token.service');
const { config, validateEnv } = require('../config/env');
let one, two;
const person = { name: 'Security student', email: 'secure@example.com', password: 'course-password', confirmPassword: 'course-password', Phone: '+201012345678', age: 22, username: 'student_one' };
const auth = token => ({ Authorization: `Bearer ${token}` });
before(async () => {
  const uri = process.env.SECURITY_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/saraha_security_test';
  const name = new URL(uri).pathname.slice(1);
  if (!name.endsWith('_test') || name === 'sticky_notes_assignment_test') throw new Error('Security tests need a separate database ending _test');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Users.init(), Sessions.init(), Messages.init()]);
});
after(async () => { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
// Authentication Question 10 - Hash Example
test('passwords: unique salts, correct/incorrect verification and bcrypt compatibility', async () => {
  const a = await passwords.hash(person.password), b = await passwords.hash(person.password);
  assert.notEqual(a, person.password); assert.notEqual(a, b);
  assert.equal(await passwords.verify(a, person.password), true);
  assert.equal(await passwords.verify(a, 'wrong'), false);
  assert.equal(await passwords.verify(await passwords.hashLegacy(person.password), person.password), true);
  assert.equal(await passwords.verify('unknown', 'wrong'), false);
});
test('phone encryption: authenticated roundtrip, randomness, tampering, keys, legacy and no double encryption', () => {
  const a = enc.encryptPhone(person.Phone), b = enc.encryptPhone(person.Phone);
  assert.notEqual(a, b); assert.equal(enc.decryptPhone(a), person.Phone);
  assert.equal(enc.encryptPhone(a), a); assert.equal(enc.decryptPhone('010123'), '010123');
  const parts = a.split(':'); parts[3] = '0'.repeat(32); assert.throws(() => enc.decryptPhone(parts.join(':')));
  const old = process.env.ENCRYPTION_KEY;
  try { process.env.ENCRYPTION_KEY = 'bad'; assert.throws(() => enc.encryptPhone('010')); process.env.ENCRYPTION_KEY = '0'.repeat(64); assert.throws(() => enc.decryptPhone(a)); }
  finally { process.env.ENCRYPTION_KEY = old; }
});
test('environment rejects missing keys and unsafe configuration', () => {
  const env = { ...process.env };
  try {
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/unused'; validateEnv();
    process.env.JWT_ACCESS_SECRET = ''; assert.throws(validateEnv);
    process.env.JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET;
    process.env.BCRYPT_ROUNDS = '2'; assert.throws(validateEnv);
  } finally { process.env = env; }
});
test('JWT signature, expiry, issuer, audience, algorithm, subject and type verification', () => {
  const uid = new mongoose.Types.ObjectId().toString(), sid = new mongoose.Types.ObjectId().toString();
  const valid = tokens.sign(uid, sid, 'access'); assert.equal(tokens.verify(valid, 'access').sub, uid);
  assert.throws(() => tokens.verify(valid, 'refresh'));
  assert.throws(() => tokens.verify('malformed', 'access'));
  const expiredRefresh = jwt.sign({ type: 'refresh', sid }, config().refreshSecret, { subject: uid, issuer: config().issuer, audience: config().audience, expiresIn: -1, jwtid: 'expired-refresh' });
  assert.throws(() => tokens.verify(expiredRefresh, 'refresh'));
  const c = config();
  for (const overrides of [{ expiresIn: -1 }, { audience: 'other' }, { issuer: 'other' }, { algorithm: 'HS384' }, { subject: 'bad' }]) {
    const token = jwt.sign({ type: 'access', sid }, c.accessSecret, { subject: uid, issuer: c.issuer, audience: c.audience, expiresIn: '15m', jwtid: 'test', ...overrides });
    assert.throws(() => tokens.verify(token, 'access'));
  }
  const invalid = jwt.sign({ type: 'access', sid }, 'wrong', { subject: uid, issuer: c.issuer, audience: c.audience, expiresIn: '15m' });
  assert.throws(() => tokens.verify(invalid, 'access'));
});
test('Zod schemas: strict/loose/catchall, literals, enum, custom and cross-field rules', () => {
  const { z } = require('zod'), s = require('../validations/auth.schema');
  assert.equal(s.signup.safeParse({ ...person, confirmPassword: 'wrong' }).success, false);
  assert.equal(s.signup.safeParse({ ...person, password: '        ' }).success, false);
  assert.equal(s.signup.safeParse({ ...person, Password: person.password }).success, false);
  assert.equal(s.signup.safeParse({ ...person, username: 'a'.repeat(24) }).success, false);
  assert.equal(s.role.safeParse('root').success, false); assert.equal(s.tokenType.safeParse('Bearer').success, true);
  assert.equal(z.strictObject({}).safeParse({ extra: 1 }).success, false);
  assert.equal(z.looseObject({}).parse({ extra: 1 }).extra, 1);
  assert.equal(z.object({}).catchall(z.string()).safeParse({ extra: 1 }).success, false);
});
test('auth signup, login, private profile, validation, role and legacy hash upgrade', async () => {
  one = (await request(app).post('/auth/signup').send(person).expect(201)).body;
  const stored = await Users.findById(one.user._id).select('+Password');
  assert.match(stored.Password, /^\$argon2id\$/); assert.match(stored.Phone, /^enc:v1:/);
  assert.equal(one.user.Password, undefined); assert.equal(one.user.Phone, person.Phone);
  await request(app).post('/auth/signup').send(person).expect(409);
  for (const patch of [{ email: 'bad' }, { age: '22' }, { age: 17 }, { role: 'admin' }, { password: undefined, confirmPassword: undefined }, { Phone: 'badphone' }, { confirmPassword: 'wrong' }]) await request(app).post('/auth/signup').send({ ...person, ...patch }).expect(400);
  const ar = await request(app).post('/auth/signup').set('Accept-Language', 'ar').send({}).expect(400);
  assert.equal(ar.body.message, 'بيانات غير صالحة'); assert.ok(ar.body.errors[0].field);
  await request(app).post('/auth/login').send({ email: person.email, password: 'wrong' }).expect(401);
  await request(app).post('/auth/login').send({ email: person.email, password: person.password }).expect(200);
  for (const header of ['', 'Basic x', 'Bearer bad', 'Bearer x y', `Bearer ${one.refreshToken}`]) await request(app).get('/auth/profile').set('Authorization', header).expect(401);
  const p = (await request(app).get('/auth/profile').set(auth(one.accessToken)).expect(200)).body;
  assert.equal(p.user._id, one.user._id);
  await request(app).get('/auth/admin/status').set(auth(one.accessToken)).expect(403);
  await Users.updateOne({ _id: one.user._id }, { $set: { role: 'admin' } });
  await request(app).get('/auth/admin/status').set(auth(one.accessToken)).expect(200);
  await Users.updateOne({ _id: one.user._id }, { $set: { role: 'user' } });
  await request(app).patch('/auth/profile').set(auth(one.accessToken)).send({ role: 'admin' }).expect(400);
  await request(app).patch('/auth/profile').set(auth(one.accessToken)).send({ Phone: '01055555555' }).expect(200);
  const legacy = await Users.create({ name: 'Legacy', email: 'legacy@example.com', Password: await passwords.hashLegacy(person.password), Phone: '010' });
  await request(app).post('/auth/login').send({ email: legacy.email, Password: person.password }).expect(200);
  assert.match((await Users.findById(legacy.id).select('+Password')).Password, /^\$argon2id\$/);
  await request(app).post('/users/login').send({ email: legacy.email, password: person.password }).expect(200);
  two = (await request(app).post('/auth/signup').send({ ...person, email: 'second@example.com', username: 'student_two' }).expect(201)).body;
  const second = await request(app).get('/auth/profile').set(auth(two.accessToken)).expect(200);
  assert.equal(second.body.user.email, 'second@example.com');
});
test('anonymous messages: privacy, ownership, pagination, params, filters, read/delete and rate limiting', async () => {
  await request(app).get('/messages/public/student_one').expect(200);
  await request(app).post('/messages/public/not_here').send({ content: 'Hello' }).expect(404);
  await request(app).post('/messages/public/student_one').send({ content: 'x'.repeat(2001) }).expect(400);
  await request(app).post('/messages/public/student_one').send({ content: 'Anonymous hello' }).expect(201);
  await request(app).get('/messages').expect(401);
  const inbox = (await request(app).get('/messages?page=1&limit=1&isRead=false').set(auth(one.accessToken)).expect(200)).body;
  assert.equal(inbox.total, 1); const mid = inbox.messages[0]._id; assert.equal(inbox.messages[0].senderId, undefined);
  for (const method of ['get', 'patch', 'delete']) await request(app)[method](`/messages/${mid}`).set(auth(two.accessToken)).send({ isRead: true }).expect(404);
  await request(app).get('/messages/bad').set(auth(one.accessToken)).expect(400);
  for (const q of ['page=0', 'limit=101', 'isRead=no', 'unknown=1']) await request(app).get(`/messages?${q}`).set(auth(one.accessToken)).expect(400);
  await request(app).get(`/messages/${mid}`).set(auth(one.accessToken)).expect(200);
  await request(app).patch(`/messages/${mid}`).set(auth(one.accessToken)).send({ isRead: 'false' }).expect(400);
  await request(app).patch(`/messages/${mid}`).set(auth(one.accessToken)).send({ isRead: true }).expect(200);
  await request(app).delete(`/messages/${mid}`).set(auth(one.accessToken)).expect(200);
  let throttled = false;
  for (let i = 0; i < 12; i++) { const r = await request(app).post('/messages/public/student_one').send({ content: 'Rate test' }); if (r.status === 429) throttled = true; }
  assert.equal(throttled, true);
});
test('secure notes use authenticated identity and reject ownership spoofing', async () => {
  const note = (await request(app).post('/api/notes').set(auth(one.accessToken)).send({ title: 'Private note', content: 'Secret' }).expect(201)).body.note;
  await request(app).get(`/api/notes/${note._id}`).set(auth(two.accessToken)).expect(403);
  await request(app).get(`/api/notes/${note._id}?userId=${one.user._id}`).set(auth(two.accessToken)).expect(400);
  await request(app).patch(`/api/notes/${note._id}`).set(auth(two.accessToken)).send({ title: 'Stolen' }).expect(403);
  await request(app).get('/api/notes/paginate-sort?page=1&limit=2').set(auth(one.accessToken)).expect(200);
  await request(app).patch(`/api/notes/${note._id}`).set(auth(one.accessToken)).send({ content: 'Updated' }).expect(200);
  await request(app).delete(`/api/notes/${note._id}`).set(auth(one.accessToken)).expect(200);
});
test('refresh rotation, race/reuse detection, expiry, logout and deleted accounts', async () => {
  const fresh = async () => (await request(app).post('/auth/login').send({ email: person.email, password: person.password }).expect(200)).body;
  let a = await fresh();
  const b = (await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200)).body;
  assert.notEqual(a.refreshToken, b.refreshToken);
  await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  await request(app).get('/auth/profile').set(auth(b.accessToken)).expect(401);
  a = await fresh();
  const races = await Promise.all([1, 2].map(() => request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken })));
  assert.deepEqual(races.map(r => r.status).sort(), [200, 401]);
  a = await fresh();
  await request(app).post('/auth/refresh').send({ refreshToken: a.accessToken }).expect(401);
  const p = tokens.verify(a.refreshToken, 'refresh');
  await Sessions.updateOne({ _id: p.sid }, { $set: { expiresAt: new Date(0) } });
  await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  a = await fresh();
  await request(app).post('/auth/logout').set(auth(a.accessToken)).expect(200);
  await request(app).get('/auth/profile').set(auth(a.accessToken)).expect(401);
  await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  a = await fresh();
  await request(app).post('/auth/logout-all').set(auth(a.accessToken)).expect(200);
  await request(app).get('/auth/profile').set(auth(one.accessToken)).expect(401);
  await request(app).delete('/auth/account').set(auth(two.accessToken)).expect(200);
  await request(app).get('/auth/profile').set(auth(two.accessToken)).expect(401);
  await request(app).post('/auth/refresh').send({ refreshToken: two.refreshToken }).expect(401);
});
test('Google login disabled or invalid token rejected; no fabricated identity accepted', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  await request(app).post('/auth/google').send({ idToken: 'fake' }).expect(503);
  process.env.GOOGLE_CLIENT_ID = 'unit-test.apps.googleusercontent.com';
  await request(app).post('/auth/google').send({ idToken: 'fake' }).expect(401);
  delete process.env.GOOGLE_CLIENT_ID;
});
test('Google adapter handles verified claims and refuses automatic account linking (mocked verifier)', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const original = OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID = 'mock.apps.googleusercontent.com';
  try {
    let payload = { sub: 'mock-google-sub', email: 'mock-google@example.com', email_verified: true, name: 'Mock identity' };
    OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => payload });
    const first = (await request(app).post('/auth/google').send({ idToken: 'mock-verifier-only' }).expect(200)).body;
    await request(app).get('/auth/profile').set(auth(first.accessToken)).expect(200);
    await request(app).post('/auth/google').send({ idToken: 'mock-verifier-only' }).expect(200);
    payload = { ...payload, sub: 'different-sub', email: person.email };
    await request(app).post('/auth/google').send({ idToken: 'mock-verifier-only' }).expect(409);
    payload = { ...payload, email_verified: false };
    await request(app).post('/auth/google').send({ idToken: 'mock-verifier-only' }).expect(401);
  } finally { OAuth2Client.prototype.verifyIdToken = original; delete process.env.GOOGLE_CLIENT_ID; }
});
test('authentication abuse prevention enforces login rate limit', async () => {
  let throttled = false;
  for (let i = 0; i < 55; i++) {
    const result = await request(app).post('/auth/login').send({ email: 'missing@example.com', password: 'wrong' });
    if (result.status === 429) throttled = true;
  }
  assert.equal(throttled, true);
});
test('production disables insecure legacy endpoints', async () => {
  process.env.NODE_ENV = 'production';
  try {
    delete require.cache[require.resolve('../app')]; const productionApp = require('../app');
    await request(productionApp).get('/users?userId=bad').expect(404);
    await request(productionApp).get('/notes').expect(404);
  } finally { process.env.NODE_ENV = 'test'; }
});
