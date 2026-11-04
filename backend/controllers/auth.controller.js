const Users = require('../models/user.model');
const Sessions = require('../models/refreshToken.model');
const service = require('../services/auth.service');
const tokens = require('../services/token.service');
const { encryptPhone } = require('../services/encryption.service');
const { success } = require('../utils/response');
const { ApiError } = require('../middleware/error.middleware');
const { config } = require('../config/env');
exports.signup = async (req, res) => {
  const user = await service.register(req.body);
  success(res, { user: service.safeProfile(user), ...await tokens.createSession(user.id, user.authVersion || 0) }, 201);
};
exports.login = async (req, res) => {
  const user = await service.login(req.body);
  if (user.isTwoFactorEnabled) return require('./two-factor.controller').beginLogin(user, res);
  success(res, { user: service.safeProfile(user), ...await tokens.createSession(user.id, user.authVersion || 0) });
};
exports.profile = (req, res) => success(res, { user: service.safeProfile(req.auth.user) });
exports.update = async (req, res) => {
  const data = { ...req.body };
  if (data.Phone) data.Phone = encryptPhone(data.Phone);
  if (data.email && data.email !== req.auth.user.email) {
    data.isEmailVerified = false;
    await require('../models/challenge.model').deleteMany({ userId: req.auth.user.id });
  }
  const user = await Users.findByIdAndUpdate(req.auth.user._id, { $set: data }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'User not found');
  success(res, { user: service.safeProfile(user) });
};
exports.refresh = async (req, res) => {
  const p = tokens.verify(req.body.refreshToken, 'refresh');
  if (!await Users.exists({ _id: p.sub })) throw new ApiError(401, 'Account no longer active');
  success(res, await tokens.rotate(req.body.refreshToken));
};
// Section 2 - Question 6 - Current-device logout concept: revoke its authoritative session
// Section 2 - Question 7 - Other sessions keep independent IDs
// Section 2 - Question 8 - Old access and refresh credentials are rejected
exports.logout = async (req, res) => {
  await Sessions.updateOne({ _id: req.auth.sessionId }, { $set: { revokedAt: new Date() } });
  success(res, {});
};
// Section 2 - Question 9 - All-device logout includes every account session
// Section 2 - Question 10 - Mongo revocation is authoritative, never bypassed by Redis
exports.logoutAll = async (req, res) => {
  await Sessions.updateMany({ userId: req.auth.user._id }, { $set: { revokedAt: new Date() } });
  success(res, {});
};
exports.remove = async (req, res) => {
  await Users.deleteOne({ _id: req.auth.user._id });
  await Sessions.updateMany({ userId: req.auth.user._id }, { $set: { revokedAt: new Date() } });
  success(res, {});
};
// Advanced Validation Question 12 - Social Login Approach
// Section 1 - Question 2 - Official verifier validates signature, issuer, audience, expiry
// Section 1 - Question 3 - First and returning Google users; no email-only linking
exports.google = async (req, res) => {
  if (!config().googleClientId) throw new ApiError(503, 'Google login is not configured');
  const { OAuth2Client } = require('google-auth-library');
  let p;
  try {
    const ticket = await new OAuth2Client(config().googleClientId).verifyIdToken({ idToken: req.body.idToken, audience: config().googleClientId });
    p = ticket.getPayload();
    if (!p.email_verified || !p.sub || !p.email) throw new Error('Unverified identity');
  } catch { throw new ApiError(401, 'Invalid Google identity token'); }
  let user = await Users.findOne({ googleId: p.sub }).select('+lockUntil');
  if (!user) {
    if (await Users.exists({ email: p.email.toLowerCase() })) throw new ApiError(409, 'Existing account: sign in with password; automatic linking is disabled');
    user = await Users.create({ googleId: p.sub, name: p.name || 'Google user', email: p.email, role: 'user' });
  }
  // Assignment B - Question 1 - A verified Google identity does not override an active account lock
  if (user.lockUntil > new Date()) throw new ApiError(429, 'Login temporarily unavailable; try again later');
  // Assignment B - Question 2 - Google login also requires the configured email second factor
  if (user.isTwoFactorEnabled) return require('./two-factor.controller').beginLogin(user, res);
  success(res, { user: service.safeProfile(user), ...await tokens.createSession(user.id, user.authVersion || 0) });
};
