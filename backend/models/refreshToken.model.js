const mongoose = require('mongoose');
// JWT Question 11 - Rotate Token Implementation Part 1
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
  tokenHash: { type: String, required: true }, revokedAt: Date,
  authVersion: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { collection: 'RefreshTokens', timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('RefreshTokens', schema);
