const mongoose = require('mongoose');
const ref = name => ({ type: mongoose.Schema.Types.ObjectId, ref: name, required: true });
// Assignment A - Question 2 - One consent request per original message
const schema = new mongoose.Schema({
  messageId: ref('Messages'), requesterId: ref('Users'),
  senderId: { ...ref('Users'), select: false },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  respondedAt: Date
}, { timestamps: true, collection: 'IdentityRequests' });
schema.index({ messageId: 1 }, { unique: true });
schema.index({ senderId: 1, status: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('IdentityRequest', schema);
