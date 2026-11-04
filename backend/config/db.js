const mongoose = require('mongoose');
module.exports = function connectDatabase(uri) {
  if (!uri) throw new Error('MONGO_URI is required. Copy .env.example to .env.');
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
};
