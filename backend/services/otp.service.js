const crypto = require('node:crypto');
const Challenges = require('../models/challenge.model');
const mail = require('./email.service');
const { ApiError } = require('../middleware/error.middleware');
function ttl() {
  const seconds = Number(process.env.OTP_TTL_SECONDS || 300);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 900) throw new ApiError(503, 'OTP TTL must be 60 to 900 seconds');
  return seconds * 1000;
}
// Section 3 - Question 6 - Random codes protected with a purpose-bound HMAC
function digest(userId, purpose, code) {
  const key = process.env.OTP_SECRET;
  if (!key || Buffer.byteLength(key) < 32) throw new ApiError(503, 'OTP secret is not configured');
  return crypto.createHmac('sha256', key).update(`${userId}:${purpose}:${code}`).digest('hex');
}
// Section 3 - Question 10 - Atomic resend reservation, cooldown, and bounded sends
async function issue(userId, email, purpose, workflow, authVersion) {
  const code = String(crypto.randomInt(100000, 1000000));
  const now = new Date();
  workflow?.trace('otp.configuration', 'started');
  const verifier = digest(userId, purpose, code);
  ttl();
  workflow?.trace('otp.configuration', 'completed');
  // Expired records must not block a new challenge while Mongo TTL cleanup lags.
  const database = (stage, operation) => workflow ? workflow.run(stage, duration => operation({ maxTimeMS: duration, timeoutMS: duration })) : operation({});
  await database('otp.remove-expired', options => Challenges.deleteOne({ userId, purpose, expiresAt: { $lte: now } }, options));
  let challenge;
  try {
    challenge = await database('otp.reserve-resend', options => Challenges.findOneAndUpdate({ userId, purpose, nextSendAt: { $lte: now }, sends: { $lt: 3 } }, {
      $set: { verifier, email, ...(authVersion === undefined ? {} : { authVersion }), attempts: 0, nextSendAt: new Date(+now + 60000), expiresAt: new Date(+now + ttl()) }, $inc: { sends: 1 }
    }, { new: true, ...options }));
    if (!challenge) challenge = await database('otp.create', options => new Challenges({ userId, purpose, email, authVersion, verifier, nextSendAt: new Date(+now + 60000), expiresAt: new Date(+now + ttl()) }).save(options));
  } catch (error) { if (error.code === 11000) throw new ApiError(429, 'Challenge cooldown or resend limit reached'); throw error; }
  try { await mail.deliver(email, purpose, code, workflow); }
  catch (error) {
    try {
      await database('otp.failed-delivery-cleanup', options => Challenges.deleteOne({ _id: challenge._id, verifier }, options));
    } catch {
      // Expiry and attempt checks stay authoritative if cleanup is unavailable.
      // Do not allow a second stalled operation to hide the delivery failure.
      workflow?.trace('otp.failed-delivery-cleanup', 'deferred-to-expiry');
    }
    throw error;
  }
}
// Section 3 - Question 8 - Shared verification helper
// Section 3 - Question 11 - Atomic attempts prevent concurrent guessing bypass
// Section 4 - Question 3 - Refactor(check OTP), both screenshot occurrences
async function consume(userId, purpose, code, email, authVersion) {
  const expected = digest(userId, purpose, code);
  const challenge = await Challenges.findOneAndUpdate({ userId, purpose, ...(email ? { email } : {}), ...(authVersion === undefined ? {} : { authVersion }), attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } }, { $inc: { attempts: 1 } }, { new: true }).select('+verifier');
  if (!challenge || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(challenge.verifier, 'hex'))) throw new ApiError(400, 'Invalid or expired challenge');
  const removed = await Challenges.deleteOne({ _id: challenge._id, verifier: expected, expiresAt: { $gt: new Date() } });
  if (!removed.deletedCount) throw new ApiError(400, 'Invalid or expired challenge');
}
// Section 4 - Question 5 - Short-lived single-use recovery authorization
async function authorizeReset(userId, email) {
  const token = crypto.randomBytes(32).toString('hex');
  await Challenges.findOneAndUpdate({ userId, purpose: 'reset' }, { $set: { email, verifier: digest(userId, 'reset', token), attempts: 0, expiresAt: new Date(Date.now() + ttl()) } }, { upsert: true });
  return token;
}
module.exports = { issue, consume, authorizeReset, digest };
