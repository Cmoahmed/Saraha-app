const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const Sessions = require('../models/refreshToken.model');
const { config } = require('../config/env');
const { ApiError } = require('../middleware/error.middleware');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
// JWT Question 4 - JWT Implementation (Sign)
// JWT Question 6 - JWT Options
// JWT Question 7 - JWT Options Part 2
// JWT Question 8 - JWT Audience and Issuer
function sign(userId, sessionId, type, jti = crypto.randomUUID()) {
  const c = config();
  return jwt.sign({ type, sid: String(sessionId) }, type === 'access' ? c.accessSecret : c.refreshSecret, {
    algorithm: 'HS256', subject: String(userId), issuer: c.issuer, audience: c.audience,
    expiresIn: type === 'access' ? c.accessExpiry : c.refreshExpiry, jwtid: jti
  });
}
// JWT Question 5 - JWT Decode and Verify
// Authorization Question 6 - Handle Decode Token
function verify(token, type) {
  const c = config();
  try {
    const p = jwt.verify(token, type === 'access' ? c.accessSecret : c.refreshSecret, { algorithms: ['HS256'], issuer: c.issuer, audience: c.audience });
    if (p.type !== type || !/^[a-f\d]{24}$/i.test(p.sub || '') || !/^[a-f\d]{24}$/i.test(p.sid || '') || !p.jti || !Number.isFinite(p.exp)) throw new Error('Invalid claims');
    return p;
  } catch { throw new ApiError(401, 'Invalid or expired token'); }
}
// JWT Question 9 - Access and Refresh Token
// Authorization Question 3 - Refactor Create Tokens
function pair(userId, sid) {
  const refreshToken = sign(userId, sid, 'refresh');
  return { accessToken: sign(userId, sid, 'access'), refreshToken, tokenType: 'Bearer' };
}
// Section 2 - Question 11 - Shared session creation for password and Google login
async function createSession(userId, authVersion = 0) {
  const session = new Sessions({ userId, authVersion });
  const tokens = pair(userId, session.id);
  session.tokenHash = digest(tokens.refreshToken);
  session.expiresAt = new Date(verify(tokens.refreshToken, 'refresh').exp * 1000);
  await session.save();
  return tokens;
}
// JWT Question 12 - Rotate Token Implementation Part 2
// Authorization Question 2 - Rotate Token
async function rotate(token) {
  const p = verify(token, 'refresh');
  const tokens = pair(p.sub, p.sid);
  const session = await Sessions.findOneAndUpdate({ _id: p.sid, userId: p.sub, tokenHash: digest(token), revokedAt: null, expiresAt: { $gt: new Date() } }, {
    $set: { tokenHash: digest(tokens.refreshToken), expiresAt: new Date(verify(tokens.refreshToken, 'refresh').exp * 1000) }
  }, { new: true });
  if (!session) {
    await Sessions.updateOne({ _id: p.sid, userId: p.sub }, { $set: { revokedAt: new Date() } });
    throw new ApiError(401, 'Refresh token revoked or reused; log in again');
  }
  const user = await require('../models/user.model').findById(p.sub);
  if (!user || (session.authVersion || 0) !== (user.authVersion || 0)) throw new ApiError(401, 'Session predates password reset');
  return tokens;
}
module.exports = { sign, verify, pair, digest, createSession, rotate };
