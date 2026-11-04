const Users = require('../models/user.model');
const Sessions = require('../models/refreshToken.model');
const otp = require('../services/otp.service');
const passwords = require('../utils/password');
const { ApiError } = require('../middleware/error.middleware');
const generic = res => res.json({ message: 'If eligible, a code has been sent.' });
// Section 3 - Question 4 - Explicit requests preserve existing account login behavior
exports.requestVerification = async (req, res) => {
  req.emailWorkflow?.trace('controller', 'started');
  if (!req.auth.user.isEmailVerified) await otp.issue(req.auth.user.id, req.auth.user.email, 'verify', req.emailWorkflow);
  generic(res);
};
// Section 3 - Question 7 - Confirmation consumes the challenge before updating status
exports.confirm = async (req, res) => {
  await otp.consume(req.auth.user.id, 'verify', req.body.code, req.auth.user.email);
  const updated = await Users.updateOne({ _id: req.auth.user.id, email: req.auth.user.email }, { $set: { isEmailVerified: true } });
  if (!updated.matchedCount) throw new ApiError(400, 'Email changed; request a new challenge');
  res.json({ message: 'Email verified' });
};
// Section 3 - Question 13 - Uniform unknown/known account response
// Section 3 - Question 14 - Recovery uses a different challenge purpose
exports.forgot = async (req, res) => {
  const user = await Users.findOne({ email: req.body.email }).select('+Password');
  if (user?.Password) {
    try { await otp.issue(user.id, user.email, 'recover'); }
    catch (error) { if (![429, 503].includes(error.status)) throw error; }
  }
  generic(res);
};
// Section 4 - Question 5 - Verify recovery OTP and issue reset credential
exports.verifyRecovery = async (req, res) => {
  const user = await Users.findOne({ email: req.body.email });
  if (!user) throw new ApiError(400, 'Invalid or expired challenge');
  await otp.consume(user.id, 'recover', req.body.code, user.email);
  res.json({ resetToken: await otp.authorizeReset(user.id, user.email) });
};
// Section 4 - Question 6 - Reset existing password and revoke all existing sessions
exports.reset = async (req, res) => {
  const user = await Users.findOne({ email: req.body.email });
  if (!user) throw new ApiError(400, 'Invalid or expired challenge');
  const hash = await passwords.hash(req.body.password);
  await otp.consume(user.id, 'reset', req.body.resetToken, user.email);
  // Revoke first: failure cannot leave a changed password with active old sessions.
  await Sessions.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } });
  await Users.updateOne({ _id: user._id }, { $set: { Password: hash }, $inc: { authVersion: 1 } });
  res.json({ message: 'Password reset; sign in again' });
};
