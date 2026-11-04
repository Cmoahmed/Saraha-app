const mongoose = require('mongoose');
// Authentication Question 3 - User Collection
// Assignment 8 Schema - Question 1 - Preserve Users fields, with conditional password/phone requirements for Google accounts
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email must be valid'] },
  Password: { type: String, required: function () { return !this.googleId; }, select: false },
  Phone: { type: String, required: function () { return !this.googleId; }, trim: true },
  googleId: { type: String, select: false },
  // Section 3 - Question 4 - No forced migration or login gate for existing users
  isEmailVerified: { type: Boolean, default: false },
  avatar: String,
  authVersion: { type: Number, default: 0 },
  // Assignment B - Question 1 - Persistent account lockout; old accounts default safely
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  // Assignment B - Question 2 - Enabling requires verified email and a consumed OTP
  isTwoFactorEnabled: { type: Boolean, default: false },
  username: { type: String, lowercase: true, trim: true, match: /^[a-z\d_]{3,30}$/, validate: { validator: v => !v || !/^[a-f\d]{24}$/i.test(v), message: 'Username cannot resemble an ObjectId' } },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  age: { type: Number, min: 18, max: 60 }
}, { collection: 'Users' });
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } });
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
module.exports = mongoose.model('Users', userSchema);
