const mongoose = require('mongoose');
// Saraha application - private recipient inbox; no sender identity is stored.
// Assignment A - Question 1 - The original comment above describes guest messages; registered hidden messages now retain a private sender reference.
// W15S2 - Question 10 - Timestamped private inbox records preserve guest-message compatibility
const schema = new mongoose.Schema({
  // Assignment A - Question 1 - Registered senders are private; older guest records stay unassociated
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', select: false },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  isRead: { type: Boolean, default: false }
}, { collection: 'Messages', timestamps: true });
schema.index({ recipientId: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('Messages', schema);
