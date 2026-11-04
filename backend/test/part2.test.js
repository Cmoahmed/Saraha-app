const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const request = require('supertest');
const nodemailer = require('nodemailer');
const sharp = require('sharp');
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.OTP_SECRET = crypto.randomBytes(32).toString('hex');
process.env.AVATAR_DIR = path.join(os.tmpdir(), `saraha-avatar-test-${crypto.randomUUID()}`);
const app = require('../app');
const Users = require('../models/user.model');
const Sessions = require('../models/refreshToken.model');
const Challenges = require('../models/challenge.model');
const otp = require('../services/otp.service');
const mail = require('../services/email.service');
const captures = [];
const transport = nodemailer.createTransport({ jsonTransport: true });
mail.useTestTransport({ async sendMail(message) { const result = await transport.sendMail(message); captures.push(JSON.parse(result.message)); return result; } });
const person = { name: 'Audit', email: 'part2@example.com', password: 'original-password', Phone: '01012345678', username: 'audit_student' };
let account, bearer;
const auth = () => ({ Authorization: `Bearer ${bearer}` });
const lastCode = () => captures.at(-1).text.match(/\b\d{6}\b/)[0];
before(async () => {
  const uri = process.env.PART2_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/saraha_part2_test';
  const name = new URL(uri).pathname.slice(1);
  if (!name.endsWith('_test') || ['saraha_security_test', 'sticky_notes_assignment_test', 'saraha_postman_test'].includes(name)) throw new Error('Part2 requires its own test database');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Users.init(), Sessions.init(), Challenges.init()]);
  account = (await request(app).post('/auth/signup').send(person).expect(201)).body;
  bearer = account.accessToken;
});
after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  // Only this suite's generated temporary directory is removed.
  await fs.rm(process.env.AVATAR_DIR, { recursive: true, force: true });
});
// Section 3 - Question 12 - Complete captured-mail confirmation cycle
test('confirmation cycle, trusted attachment, wrong code, purpose isolation, replay and email changes', async () => {
  assert.equal(account.user.isEmailVerified, false);
  await request(app).post('/auth/email/request').set(auth()).send({}).expect(200);
  await request(app).post('/auth/email/request').set(auth()).send({}).expect(429);
  const code = lastCode();
  await assert.rejects(otp.consume(account.user._id, 'verify', code, 'different@example.com'));
  assert.equal(captures.length, 1);
  assert.equal(captures[0].attachments[0].filename, 'security.txt');
  const stored = await Challenges.findOne({ userId: account.user._id, purpose: 'verify' }).select('+verifier');
  assert.notEqual(stored.verifier, code); assert.match(stored.verifier, /^[a-f\d]{64}$/);
  await request(app).post('/auth/email/confirm').set(auth()).send({ code: '000000' }).expect(400);
  await assert.rejects(otp.consume(account.user._id, 'recover', code));
  await request(app).post('/auth/email/confirm').set(auth()).send({ code }).expect(200);
  await request(app).post('/auth/email/confirm').set(auth()).send({ code }).expect(400);
  assert.equal((await request(app).get('/auth/profile').set(auth()).expect(200)).body.user.isEmailVerified, true);
  await request(app).patch('/auth/profile').set(auth()).send({ email: 'changed@example.com' }).expect(200);
  assert.equal((await Users.findById(account.user._id)).isEmailVerified, false);
  await request(app).patch('/auth/profile').set(auth()).send({ email: person.email }).expect(200);
});
test('OTP cooldown, resend limit, old-code invalidation, atomic attempts, expiry and concurrent single use', async () => {
  const id = account.user._id;
  await otp.issue(id, person.email, 'verify'); const first = lastCode();
  await assert.rejects(otp.issue(id, person.email, 'verify'), { status: 429 });
  await Challenges.updateOne({ userId: id, purpose: 'verify' }, { $set: { nextSendAt: new Date(0) } });
  await otp.issue(id, person.email, 'verify'); const second = lastCode();
  if (first !== second) await assert.rejects(otp.consume(id, 'verify', first));
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => otp.consume(id, 'verify', '000000')));
  assert.equal(attempts.every(v => v.status === 'rejected'), true);
  assert.equal((await Challenges.findOne({ userId: id, purpose: 'verify' })).attempts, 5);
  await assert.rejects(otp.consume(id, 'verify', second));
  await Challenges.updateOne({ userId: id, purpose: 'verify' }, { $set: { nextSendAt: new Date(0) } });
  await otp.issue(id, person.email, 'verify');
  await Challenges.updateOne({ userId: id, purpose: 'verify' }, { $set: { nextSendAt: new Date(0) } });
  await assert.rejects(otp.issue(id, person.email, 'verify'), { status: 429 });
  await Challenges.updateOne({ userId: id, purpose: 'verify' }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(otp.consume(id, 'verify', lastCode()));
  await otp.issue(id, person.email, 'verify');
  const winners = await Promise.allSettled([otp.consume(id, 'verify', lastCode()), otp.consume(id, 'verify', lastCode())]);
  assert.equal(winners.filter(v => v.status === 'fulfilled').length, 1);
});
// Section 4 - Question 4 - Recovery preparation cycle
// Section 4 - Question 7 - Complete password reset and session invalidation
test('recovery resets password once, rejects expired authorization, preserves roles and owned data', async () => {
  const Notes = require('../models/note.model'), Messages = require('../models/message.model');
  await Users.updateOne({ _id: account.user._id }, { $set: { role: 'admin' } });
  const note = await Notes.create({ userId: account.user._id, title: 'Preserved', content: 'Keep' });
  const message = await Messages.create({ recipientId: account.user._id, content: 'Keep message' });
  const known = await request(app).post('/auth/password/forgot').send({ email: person.email }).expect(200);
  const code = lastCode();
  const unknown = await request(app).post('/auth/password/forgot').send({ email: 'absent@example.com' }).expect(200);
  assert.deepEqual(known.body, unknown.body); assert.equal(known.body.code, undefined);
  await request(app).post('/auth/password/verify').send({ email: person.email, code: '000000' }).expect(400);
  const verified = (await request(app).post('/auth/password/verify').send({ email: person.email, code }).expect(200)).body;
  await request(app).post('/auth/password/verify').send({ email: person.email, code }).expect(400);
  await request(app).post('/auth/password/reset').send({ email: person.email, resetToken: verified.resetToken, password: 'short' }).expect(400);
  await request(app).post('/auth/password/reset').send({ email: person.email, resetToken: verified.resetToken, password: 'changed-password' }).expect(200);
  await request(app).post('/auth/password/reset').send({ email: person.email, resetToken: verified.resetToken, password: 'another-password' }).expect(400);
  await request(app).get('/auth/profile').set(auth()).expect(401);
  await request(app).post('/auth/refresh').send({ refreshToken: account.refreshToken }).expect(401);
  await request(app).post('/auth/login').send({ email: person.email, password: person.password }).expect(401);
  bearer = (await request(app).post('/auth/login').send({ email: person.email, password: 'changed-password' }).expect(200)).body.accessToken;
  const user = await Users.findById(account.user._id);
  assert.equal(user.role, 'admin'); assert.equal(user.username, person.username);
  assert.ok(await Notes.findById(note.id)); assert.ok(await Messages.findById(message.id));
  // A login already validating the old password cannot create a usable session after reset.
  const stale = await require('../services/token.service').createSession(user.id, 0);
  await request(app).get('/auth/profile').set('Authorization', `Bearer ${stale.accessToken}`).expect(401);
  await request(app).post('/auth/refresh').send({ refreshToken: stale.refreshToken }).expect(401);
  const expired = await otp.authorizeReset(user.id);
  await Challenges.updateOne({ userId: user.id, purpose: 'reset' }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(otp.consume(user.id, 'reset', expired));
});
test('device logout isolates sessions; all-device logout rejects both token types', async () => {
  const login = async () => (await request(app).post('/auth/login').send({ email: person.email, password: 'changed-password' }).expect(200)).body;
  const one = await login(), two = await login();
  await request(app).post('/auth/logout').set('Authorization', `Bearer ${one.accessToken}`).expect(200);
  await request(app).get('/auth/profile').set('Authorization', `Bearer ${one.accessToken}`).expect(401);
  await request(app).get('/auth/profile').set('Authorization', `Bearer ${two.accessToken}`).expect(200);
  await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${two.accessToken}`).expect(200);
  await request(app).post('/auth/refresh').send({ refreshToken: two.refreshToken }).expect(401);
  bearer = (await login()).accessToken;
});
test('avatar decoding, retrieval, replacement cleanup, limits and authentication', async () => {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#5a9' } }).png().toBuffer();
  const upload = () => request(app).post('/auth/avatar').set(auth());
  const first = (await upload().attach('avatar', image, { filename: '../../.env', contentType: 'image/png' }).expect(200)).body.avatar;
  const retrieved = await request(app).get(first).expect(200);
  assert.match(retrieved.headers['content-type'], /image\/webp/); assert.equal(retrieved.headers['x-content-type-options'], 'nosniff');
  await upload().attach('avatar', Buffer.from('hello'), { filename: 'fake.png', contentType: 'image/png' }).expect(415);
  await upload().attach('avatar', image, { filename: 'wrong.jpg', contentType: 'image/jpeg' }).expect(415);
  await upload().attach('avatar', image.subarray(0, 30), { filename: 'broken.png', contentType: 'image/png' }).expect(415);
  await upload().attach('avatar', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' }).expect(415);
  await upload().attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
  await upload().attach('wrong', image, 'x.png').expect(400);
  await upload().attach('avatar', image, 'x.png').attach('avatar', image, 'y.png').expect(400);
  await upload().field('extra', 'x').attach('avatar', image, 'x.png').expect(400);
  await request(app).post('/auth/avatar').attach('avatar', image, 'x.png').expect(401);
  const second = (await upload().attach('avatar', image, 'new.png').expect(200)).body.avatar;
  assert.notEqual(first, second); await request(app).get(first).expect(404); await request(app).get(second).expect(200);
  await request(app).get('/avatars/.env').expect(404);
  assert.equal((await fs.readdir(process.env.AVATAR_DIR)).length, 1);
});
test('new input validation preserves existing login and normalizes valid inputs', async () => {
  const s = require('../validations/auth.schema');
  for (const patch of [{ username: 'admin' }, { username: 'a!' }, { Phone: '123' }, { password: 'short' }, { email: 'invalid' }]) assert.equal(s.signup.safeParse({ ...person, ...patch }).success, false);
  assert.equal(s.signup.parse({ ...person, Phone: '+20 (10) 1234-5678', email: ' AUDIT@EXAMPLE.COM ' }).Phone, '+201012345678');
  await request(app).post('/auth/signup').send({ ...person, email: 'duplicate-username@example.com' }).expect(409);
});
test('OTP TTL configuration uses seconds, survives attempt updates and rejects unsafe configuration', async () => {
  process.env.OTP_TTL_SECONDS = '90';
  try {
    await otp.issue(account.user._id, person.email, 'verify');
    const before = await Challenges.findOne({ userId: account.user._id, purpose: 'verify' });
    assert.ok(+before.expiresAt - Date.now() > 88000);
    assert.ok(+before.expiresAt - Date.now() <= 90000);
    await assert.rejects(otp.consume(account.user._id, 'verify', '000000'));
    const after = await Challenges.findById(before.id);
    assert.equal(+before.expiresAt, +after.expiresAt);
    process.env.OTP_TTL_SECONDS = '-1';
    await assert.rejects(otp.authorizeReset(account.user._id), { status: 503 });
  } finally { delete process.env.OTP_TTL_SECONDS; }
});
test('mail failure removes unusable challenge; public cache fails safely when Redis is absent', async () => {
  mail.useTestTransport({ async sendMail() { throw new Error('Simulated SMTP outage'); } });
  await assert.rejects(otp.issue(account.user._id, person.email, 'recover'));
  assert.equal(await Challenges.countDocuments({ userId: account.user._id, purpose: 'recover' }), 0);
  const { remember } = require('../services/cache.service');
  const previous = process.env.REDIS_URL; delete process.env.REDIS_URL;
  assert.deepEqual(await remember('test', 10, async () => ({ public: true })), { public: true });
  if (previous) process.env.REDIS_URL = previous;
});
