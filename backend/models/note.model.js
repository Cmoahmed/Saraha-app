const mongoose = require('mongoose');
// Assignment 8 Schema - Question 2 - Required note fields, User reference and timestamps
const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true,
    // Mongoose Validation Question - Prevent Uppercase Titles
    // Assignment 8 Validator - Question 1 - Reject uppercase-only English titles without rejecting non-letter titles
    validate: { validator: value => !/[A-Z]/.test(value) || /[a-z]/.test(value),
      message: 'Title must not contain uppercase English letters without any lowercase English letters.' } },
  content: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true }
}, { timestamps: true, collection: 'Notes' });
noteSchema.index({ userId: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('Notes', noteSchema);
