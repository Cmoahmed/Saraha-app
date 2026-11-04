const Users = require('../models/user.model');
const Messages = require('../models/message.model');
const { ApiError } = require('../middleware/error.middleware');
const { success } = require('../utils/response');
async function recipient(value) {
  const user = await Users.findOne(/^[a-f\d]{24}$/i.test(value) ? { _id: value } : { username: value.toLowerCase() });
  if (!user) throw new ApiError(404, 'Recipient not found');
  return user;
}
exports.publicProfile = async (req, res) => {
  const user = await recipient(req.params.recipient);
  success(res, { user: { name: user.name, publicId: user.username || user.id } });
};
// W15S2 - Question 11 - Resolve registered recipient and save the anonymous message
// W15S2 - Question 12 - Guests have no stored or invented sender identity
exports.send = async (req, res) => {
  const user = await recipient(req.params.recipient);
  await Messages.create({ recipientId: user._id, content: req.body.content });
  success(res, {}, 201);
};
// W15S2 - Question 15 - Return only the authenticated recipient's filtered, bounded inbox
exports.inbox = async (req, res) => {
  const { page, limit, isRead } = req.query;
  const filter = { recipientId: req.auth.user._id, ...(isRead === undefined ? {} : { isRead }) };
  const [messages, total] = await Promise.all([Messages.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Messages.countDocuments(filter)]);
  // Course Section A - Question 2 - Add metadata without removing legacy response fields
  success(res, { messages, total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total });
};
// W15S2 - Question 13 - Shared ownership lookup protects message reads and deletion
// W15S2 - Question 14 - The message cycle exercises inbox, read, marking and deletion
async function owned(req) {
  const message = await Messages.findOne({ _id: req.params.messageId, recipientId: req.auth.user._id });
  if (!message) throw new ApiError(404, 'Message not found');
  return message;
}
exports.get = async (req, res) => success(res, { message: await owned(req) });
exports.read = async (req, res) => { const message = await owned(req); message.isRead = req.body.isRead; success(res, { message: await message.save() }); };
exports.remove = async (req, res) => { await (await owned(req)).deleteOne(); success(res, {}); };
