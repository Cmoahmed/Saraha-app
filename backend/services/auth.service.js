const Users = require('../models/user.model');
const passwords = require('../utils/password');
const { encryptPhone, decryptPhone } = require('./encryption.service');
const { ApiError } = require('../middleware/error.middleware');
// Section 1 - Question 4 - Reuse safe profiles for password and Google login
function safeProfile(user) {
  return { _id: user.id, name: user.name, email: user.email, Phone: decryptPhone(user.Phone), age: user.age, username: user.username, role: user.role || 'user', publicId: user.username || user.id, isEmailVerified: user.isEmailVerified === true, avatar: user.avatar ? `/avatars/${user.avatar}` : undefined };
}
// Authentication Question 11 - Refactor Signup and Login
// Advanced Validation Question 8 - Refactor Signup
async function register(data) {
  const { password, Password, confirmPassword, ...fields } = data;
  if (await Users.exists({ email: fields.email })) throw new ApiError(409, 'Email already exists.');
  return Users.create({ ...fields, Phone: encryptPhone(fields.Phone), Password: await passwords.hash(password || Password), role: 'user' });
}
// Authentication Question 11 - Refactor Signup and Login
async function login(data) {
  if (typeof data.email !== 'string' || typeof (data.password || data.Password) !== 'string') throw new ApiError(401, 'Invalid email or password');
  const user = await Users.findOne({ email: data.email.trim().toLowerCase() }).select('+Password +failedLoginAttempts +lockUntil');
  const value = data.password || data.Password;
  // Assignment B - Question 1 - Five consecutive failures, atomic increments, five-minute expiry
  // Course Section A - Question 15 - Account lockout is separate from HTTP limiting
  if (user?.lockUntil > new Date()) throw new ApiError(429, 'Login temporarily unavailable; try again later');
  if (!user || !await passwords.verify(user.Password, value)) {
    if (user) {
      const now = new Date();
      const updated = await Users.findOneAndUpdate({ _id: user._id, $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }] }, [
        { $set: { failedLoginAttempts: { $add: [{ $cond: [{ $and: [{ $ne: [{ $ifNull: ['$lockUntil', null] }, null] }, { $lte: ['$lockUntil', now] }] }, 0, { $ifNull: ['$failedLoginAttempts', 0] }] }, 1] } } },
        { $set: { lockUntil: { $cond: [{ $gte: ['$failedLoginAttempts', 5] }, new Date(+now + 300000), null] } } }
      ], { new: true }).select('+lockUntil');
      if (!updated || updated.lockUntil > now) throw new ApiError(429, 'Login temporarily unavailable; try again later');
    }
    throw new ApiError(401, 'Invalid email or password');
  }
  const reset = await Users.updateOne({ _id: user._id, $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }] }, { $set: { failedLoginAttempts: 0, lockUntil: null } });
  if (!reset.matchedCount) throw new ApiError(429, 'Login temporarily unavailable; try again later');
  if (user.Password.startsWith('$2')) {
    const upgraded = await passwords.hash(value);
    await Users.updateOne({ _id: user._id, Password: user.Password }, { $set: { Password: upgraded } });
  }
  return user;
}
module.exports = { register, login, safeProfile };
