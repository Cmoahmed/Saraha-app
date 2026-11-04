const Users = require('../models/user.model');
const otp = require('../services/otp.service');
const tokens = require('../services/token.service');
const { ApiError } = require('../middleware/error.middleware');
const { success } = require('../utils/response');
// Assignment B - Question 2 - Request enabling with authenticated, verified registered email
exports.requestEnable = async (req, res) => {
  if (!req.auth.user.isEmailVerified) throw new ApiError(403, 'Verify your email first');
  if (req.auth.user.isTwoFactorEnabled) throw new ApiError(409, 'Two-step verification is already enabled');
  await otp.issue(req.auth.user.id, req.auth.user.email, 'enable2fa', undefined, req.auth.user.authVersion || 0);
  success(res, { message: 'Verification code sent' });
};
// Assignment B - Question 2 - Consume the enable OTP before persisting the flag
exports.confirmEnable = async (req, res) => {
  const user = req.auth.user;
  if (!user.isEmailVerified) throw new ApiError(403, 'Verify your email first');
  await otp.consume(user.id, 'enable2fa', req.body.code, user.email, user.authVersion || 0);
  const updated = await Users.updateOne({ _id: user._id, email: user.email, isEmailVerified: true, $expr: { $eq: [{ $ifNull: ['$authVersion', 0] }, user.authVersion || 0] } }, { $set: { isTwoFactorEnabled: true }, $inc: { authVersion: 1 } });
  if (!updated.matchedCount) throw new ApiError(409, 'Account changed; restart verification');
  success(res, { isTwoFactorEnabled: true, message: 'Two-step verification enabled; log in again' });
};
// Assignment B - Question 2 - No session or login tokens before successful OTP confirmation
exports.beginLogin = async (user, res) => {
  if (!user.isEmailVerified) throw new ApiError(403, 'Verify your email before two-step login');
  await otp.issue(user.id, user.email, 'login2fa', undefined, user.authVersion || 0);
  success(res, { requiresTwoFactor: true, userId: user.id });
};
// Assignment B - Question 2 - Single-use, purpose-bound, expiring second factor
exports.confirmLogin = async (req, res) => {
  const user = await Users.findById(req.body.userId).select('+lockUntil');
  if (!user?.isTwoFactorEnabled || !user.isEmailVerified) throw new ApiError(400, 'Invalid or expired challenge');
  if (user.lockUntil > new Date()) throw new ApiError(429, 'Login temporarily unavailable; try again later');
  await otp.consume(user.id, 'login2fa', req.body.code, user.email, user.authVersion || 0);
  success(res, { user: require('../services/auth.service').safeProfile(user), ...await tokens.createSession(user.id, user.authVersion || 0) });
};
