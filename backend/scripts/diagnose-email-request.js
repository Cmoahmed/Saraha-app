// Disposable reproduction: never connects to the database in backend/.env.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const nodemailer = require('nodemailer');
const configured = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const uri = `mongodb://127.0.0.1:27017/email_diagnosis_${crypto.randomBytes(6).toString('hex')}_test`;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
delete process.env.OTP_SECRET;
delete process.env.SMTP_HOST;
if (configured.OTP_SECRET) process.env.OTP_SECRET = configured.OTP_SECRET;
// Never send a real message merely to reproduce the user's configuration.
const app = require('../app');
const mail = require('../services/email.service');
const Challenges = require('../models/challenge.model');
let server;
async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  await Challenges.init();
  if (process.argv.includes('--port=3001')) {
    server = app.listen(3001, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    console.log('Disposable test server listening on http://localhost:3001; database is isolated.');
  }
  const client = request(server || app);
  const person = { name: 'Disposable diagnosis', email: 'email-diagnosis@example.com', Phone: '01012345678', password: 'diagnostic-password' };
  const account = (await client.post('/auth/signup').send(person).timeout(4000).expect(201)).body;
  const auth = { Authorization: `Bearer ${account.accessToken}` };
  await client.get('/auth/profile').set(auth).timeout(2000).expect(200);
  let started = Date.now();
  const missing = await client.post('/auth/email/request').set(auth).send({}).timeout(2000);
  console.log(JSON.stringify({ scenario: 'current local OTP configuration, SMTP not enabled', status: missing.status, elapsedMs: Date.now() - started, message: missing.body.message }));
  process.env.OTP_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.MAIL_DELIVERY_TIMEOUT_MS = '150';
  mail.useTestTransport({ sendMail: () => new Promise(() => {}) });
  started = Date.now();
  try {
    const result = await client.post('/auth/email/request').set(auth).send({}).timeout(700);
    console.log(JSON.stringify({ scenario: 'never-settling test mail transport', status: result.status, elapsedMs: Date.now() - started, message: result.body.message }));
  } catch (error) {
    console.log(JSON.stringify({ scenario: 'never-settling test mail transport', clientDeadlineExceeded: !!error.timeout, elapsedMs: Date.now() - started, operation: 'await mail.deliver -> transport.sendMail' }));
  }
  await Challenges.deleteMany({ userId: account.user._id });
  const captures = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  mail.useTestTransport({ async sendMail(message) { const result = await transport.sendMail(message); captures.push(JSON.parse(result.message)); return result; } });
  const captured = await client.post('/auth/email/request').set(auth).send({}).timeout(2000).expect(200);
  console.log(JSON.stringify({ scenario: 'explicit local JSON test transport', status: captured.status, capturedMessages: captures.length, codeInApiResponse: Object.hasOwn(captured.body, 'code'), realSmtpDelivery: false }));
}
main().catch(() => { console.error('Disposable endpoint diagnosis failed'); process.exitCode = 1; }).finally(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (mongoose.connection.readyState === 1 && mongoose.connection.name.endsWith('_test')) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
