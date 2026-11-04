const mongoose = require('mongoose');
// Section 3 - Question 5 - Purpose-specific protected challenges
// Section 4 - Question 2 - Expiry is checked by queries as well as TTL cleanup
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  purpose: { type: String, enum: ['verify', 'recover', 'reset', 'enable2fa', 'login2fa'], required: true },
  email: String,
  // Assignment B - Question 2 - Bind second-factor challenges to the password/session generation
  authVersion: Number,
  verifier: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  sends: { type: Number, default: 1 },
  nextSendAt: Date,
  expiresAt: { type: Date, required: true }
});
schema.index({ userId: 1, purpose: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('Challenge', schema);
