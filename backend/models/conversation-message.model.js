const mongoose = require('mongoose');
// Assignment A - Question 6 - Separate participant messages preserve anonymous inbox behavior
const schema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 }
}, { timestamps: true, collection: 'ConversationMessages' });
schema.index({ conversationId: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('ConversationMessage', schema);
