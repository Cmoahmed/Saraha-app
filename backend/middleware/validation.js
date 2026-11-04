const mongoose = require('mongoose');
const Users = require('../models/user.model');
const { ApiError } = require('./error.middleware');
function id(value, label = 'userId') {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) throw new ApiError(400, `Invalid or missing ${label}`);
  return new mongoose.Types.ObjectId(value);
}
async function user(req) {
  const userId = id(req.query.userId);
  if (!await Users.exists({ _id: userId })) throw new ApiError(404, 'User not found');
  return userId;
}
function body(req, allowed) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new ApiError(400, 'JSON object body required');
  const keys = Object.keys(req.body);
  if (!keys.length || keys.some(key => !allowed.includes(key))) throw new ApiError(400, `Allowed fields: ${allowed.join(', ')}`);
  const result = {};
  for (const key of keys) {
    const value = req.body[key];
    if (key === 'age') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ApiError(400, 'age must be a number');
    } else if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${key} must be a nonempty string`);
    result[key] = value;
  }
  return result;
}
module.exports = { id, user, body };
