const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const mongoose = require('mongoose');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.OTP_SECRET = crypto.randomBytes(48).toString('hex');
process.env.EMAIL_DB_TIMEOUT_MS = '250';
process.env.EMAIL_REQUEST_TIMEOUT_MS = '1200';
process.env.MAIL_DELIVERY_TIMEOUT_MS = '150';
for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'REDIS_URL']) delete process.env[name];
const app = require('../app');
const mail = require('../services/email.service');
const Challenges = require('../models/challenge.model');
const Users = require('../models/user.model');
let account;
const auth = () => ({ Authorization: `Bearer ${account.accessToken}` });
const send = () => request(app).post('/auth/email/request').set(auth()).send({}).timeout(1800);
before(async () => {
  const uri = `mongodb://127.0.0.1:27017/email_timeout_${crypto.randomBytes(6).toString('hex')}_test`;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  await Challenges.init();
  account = (await request(app).post('/auth/signup').send({ name: 'Timeout test', email: 'timeouts@example.com', password: 'test-only-password', Phone: '01012345678' }).expect(201)).body;
});
after(async () => {
  if (mongoose.connection.readyState === 1 && /^email_timeout_[a-f\d]+_test$/.test(mongoose.connection.name)) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('email request returns controlled 503 for missing OTP/SMTP configuration without a fake success', async () => {
  const secret = process.env.OTP_SECRET; delete process.env.OTP_SECRET;
  try {
    const response = await send().expect(503);
    assert.equal(response.body.message, 'OTP secret is not configured');
  } finally { process.env.OTP_SECRET = secret; }
  const response = await send().expect(503);
  assert.equal(response.body.message, 'Mail delivery is not configured');
  assert.equal(await Challenges.countDocuments({ userId: account.user._id }), 0);
});

test('never-settling mail returns 503, invokes cancellation, cleans challenge and logs only safe stages', async () => {
  let closed = false;
  mail.useTestTransport({ sendMail: () => new Promise(() => {}), close: () => { closed = true; } });
  const logs = [], original = console.info;
  process.env.EMAIL_DIAGNOSTICS = 'true'; console.info = value => logs.push(value);
  const started = Date.now();
  try { await send().expect(503); }
  finally { console.info = original; delete process.env.EMAIL_DIAGNOSTICS; }
  assert.ok(Date.now() - started < 1000); assert.equal(closed, true);
  assert.equal(await Challenges.countDocuments({ userId: account.user._id }), 0);
  const stages = logs.map(line => JSON.parse(line));
  assert.ok(stages.some(e => e.stage === 'authentication.mongo' && e.outcome === 'completed'));
  assert.ok(stages.some(e => e.stage === 'mail.delivery' && e.outcome === 'failed'));
  assert.ok(stages.some(e => e.stage === 'error-handler' && e.outcome === '503'));
  assert.ok(stages.some(e => e.stage === 'response' && e.outcome === '503'));
  for (const entry of stages) assert.deepEqual(Object.keys(entry).sort(), ['elapsedMs', 'event', 'outcome', 'requestId', 'stage']);
  for (const secret of [account.accessToken, account.refreshToken, process.env.OTP_SECRET, 'timeouts@example.com']) assert.equal(logs.join('').includes(secret), false);
});

test('stalled authentication query has a bounded 503 instead of reaching controller or mail', async () => {
  const original = Users.findById;
  Users.findById = () => ({ setOptions() {}, then: () => new Promise(() => {}) });
  const started = Date.now();
  try { await send().expect(503); }
  finally { Users.findById = original; }
  assert.ok(Date.now() - started < 1000);
});

test('stalled OTP database operation returns controlled 503', async () => {
  const original = Challenges.deleteOne;
  Challenges.deleteOne = () => new Promise(() => {});
  const started = Date.now();
  try { await send().expect(503); }
  finally { Challenges.deleteOne = original; }
  assert.ok(Date.now() - started < 1000);
});

async function localServer(connection) {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {}); connection(socket);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.address().port, async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}

test('real Nodemailer SMTP greeting stall returns bounded 503 and does not substitute JSON transport', async () => {
  mail.useTestTransport(undefined);
  const smtp = await localServer(() => {});
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.port); process.env.SMTP_SECURE = 'false';
  const started = Date.now();
  try { await send().expect(503); }
  finally { await smtp.close(); }
  assert.ok(Date.now() - started < 1100);
  assert.equal(await Challenges.countDocuments({ userId: account.user._id }), 0);
});

test('real SMTP transport delivers to an isolated local capture and confirmation consumes the mailed code', async () => {
  process.env.MAIL_DELIVERY_TIMEOUT_MS = '1000';
  let captured = '';
  const smtp = await localServer(socket => {
    socket.write('220 localhost local test capture\r\n');
    let buffer = '', receiving = false;
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'); const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (receiving) {
          if (line === '.') { receiving = false; socket.write('250 message captured\r\n'); }
          else captured += line + '\r\n';
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250 localhost\r\n');
        else if (/^MAIL FROM:|^RCPT TO:/.test(line)) socket.write('250 OK\r\n');
        else if (line === 'DATA') { receiving = true; socket.write('354 Send message\r\n'); }
        else if (line === 'QUIT') socket.end('221 Goodbye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  process.env.SMTP_PORT = String(smtp.port);
  try {
    const response = await send().expect(200);
    assert.equal(response.body.code, undefined);
    assert.match(captured, /Confirm your Saraha email/);
    const code = captured.match(/confirmation code is (\d{6})/)[1];
    await request(app).post('/auth/email/confirm').set(auth()).send({ code }).timeout(1800).expect(200);
    await request(app).post('/auth/email/confirm').set(auth()).send({ code }).timeout(1800).expect(400);
  } finally {
    await smtp.close(); process.env.MAIL_DELIVERY_TIMEOUT_MS = '150';
    delete process.env.SMTP_HOST;
    await Users.updateOne({ _id: account.user._id }, { $set: { isEmailVerified: false } });
  }
});

test('total workflow deadline also bounds mail cleanup when its budget is exhausted', async () => {
  process.env.EMAIL_REQUEST_TIMEOUT_MS = '100';
  process.env.MAIL_DELIVERY_TIMEOUT_MS = '500';
  mail.useTestTransport({ sendMail: () => new Promise(() => {}) });
  const started = Date.now();
  try { await send().expect(503); }
  finally { process.env.EMAIL_REQUEST_TIMEOUT_MS = '1200'; process.env.MAIL_DELIVERY_TIMEOUT_MS = '150'; }
  assert.ok(Date.now() - started < 700);
});

test('Redis handshake with a black-hole TCP server terminates without endless retries', async () => {
  const redis = require('../services/redis.service');
  const server = await localServer(() => {});
  process.env.REDIS_URL = `redis://127.0.0.1:${server.port}`;
  process.env.REDIS_OPERATION_TIMEOUT_MS = '150';
  const started = Date.now();
  try { await assert.rejects(redis.connect()); }
  finally { await redis.close(); await server.close(); delete process.env.REDIS_URL; }
  assert.ok(Date.now() - started < 1000);
});

test('Redis GET has an operation deadline even after its connection handshake succeeds', async () => {
  const redis = require('../services/redis.service');
  const server = await localServer(socket => {
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      // Parse complete RESP array commands. Acknowledge handshake only; deliberately stall GET.
      while (buffer.length) {
        const header = buffer.indexOf('\r\n'); if (header < 0) return;
        const count = Number(buffer.subarray(1, header).toString());
        let offset = header + 2; const args = [];
        for (let i = 0; i < count; i++) {
          const end = buffer.indexOf('\r\n', offset); if (end < 0) return;
          const length = Number(buffer.subarray(offset + 1, end).toString());
          if (buffer.length < end + 2 + length + 2) return;
          args.push(buffer.subarray(end + 2, end + 2 + length).toString()); offset = end + 2 + length + 2;
        }
        buffer = buffer.subarray(offset);
        if (args[0]?.toUpperCase() === 'HELLO') socket.write('%0\r\n');
        else if (args[0]?.toUpperCase() !== 'GET') socket.write('+OK\r\n');
      }
    });
  });
  process.env.REDIS_URL = `redis://127.0.0.1:${server.port}`;
  process.env.REDIS_OPERATION_TIMEOUT_MS = '200';
  const started = Date.now();
  try {
    await redis.connect();
    await assert.rejects(redis.get('timeout-test'));
  } finally {
    await server.close(); await redis.close(); delete process.env.REDIS_URL;
  }
  assert.ok(Date.now() - started < 1200);
});
