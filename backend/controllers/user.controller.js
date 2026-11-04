const passwords = require('../utils/password');
const Users = require('../models/user.model');
const Notes = require('../models/note.model');
const { ApiError } = require('../middleware/error.middleware');
const { id, body } = require('../middleware/validation');
const userId = req => id(req.query.userId || req.query.id);
const safe = document => { const result = document.toObject(); delete result.Password; delete result.googleId; delete result.failedLoginAttempts; delete result.lockUntil; if (result.Phone?.startsWith('enc:v1:')) delete result.Phone; return result; };
// Question 1 - Signup User
// Authentication Question 4 - Signup
exports.signup = async (req, res) => {
  const data = body(req, ['name', 'email', 'Password', 'password', 'Phone', 'age']);
  if (data.Password && data.password) throw new ApiError(400, 'Provide Password or password, not both');
  const password = data.Password || data.password;
  if (!password) throw new ApiError(400, 'Password is required');
  delete data.password;
  data.Password = password;
  const document = new Users(data);
  await document.validate();
  if (await Users.exists({ email: document.email })) throw new ApiError(409, 'Email already exists.');
  document.Password = await passwords.hashLegacy(password);
  await document.save();
  res.status(201).json({ message: 'User added successfully.', user: safe(document) });
};
// Question 2 - Login User
exports.login = async (req, res) => {
  const data = body(req, ['email', 'Password', 'password']);
  // Assignment B - Question 1 - The legacy password endpoint shares the account counter
  const document = await require('../services/auth.service').login({ ...data, password: data.password || data.Password || '' });
  if (document.isTwoFactorEnabled) return require('./two-factor.controller').beginLogin(document, res);
  // Assignment 8 - Question 2 - Add bearer credentials while retaining the original message/userId fields
  const session = process.env.LEGACY_REQUIRE_AUTH === 'true' ? await require('../services/token.service').createSession(document.id, document.authVersion || 0) : {};
  res.json({ message: 'Logged in', userId: document.id, user: safe(document), ...session });
};
// Question 3 - Update Logged-in User
exports.update = async (req, res) => {
  const queryId = userId(req);
  if (String(queryId) !== req.params.id) throw new ApiError(400, 'Path id and query userId must match');
  const data = body(req, ['name', 'email', 'Phone', 'age']);
  // Assignment 8 - Question 3 - A changed email must prove ownership again before receiving second-factor mail
  const previous = await Users.findById(queryId);
  if (!previous) throw new ApiError(404, 'User not found');
  if (data.email && data.email.trim().toLowerCase() !== previous.email) data.isEmailVerified = false;
  const document = await Users.findByIdAndUpdate(queryId, data, { new: true, runValidators: true });
  if (!document) throw new ApiError(404, 'User not found');
  res.json({ message: 'User updated', user: safe(document) });
};
// Question 4 - Delete User
exports.remove = async (req, res) => {
  const queryId = userId(req);
  const document = await Users.findByIdAndDelete(queryId);
  if (!document) throw new ApiError(404, 'User not found');
  await Notes.deleteMany({ userId: queryId });
  res.json({ message: 'User deleted' });
};
// Question 5 - Get User by ID
exports.get = async (req, res) => {
  const document = await Users.findById(userId(req));
  if (!document) throw new ApiError(404, 'User not found');
  res.json(safe(document));
};
