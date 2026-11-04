const mongoose = require('mongoose');
// Assignment A - Question 5 - Unique request link makes retries and concurrent creation idempotent
const schema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'IdentityRequest', required: true, unique: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Messages', required: true },
  participants: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Users' }], validate: v => v.length === 2 && String(v[0]) !== String(v[1]), required: true }
}, { timestamps: true, collection: 'Conversations' });
schema.index({ participants: 1, createdAt: -1 });
module.exports = mongoose.model('Conversation', schema);
