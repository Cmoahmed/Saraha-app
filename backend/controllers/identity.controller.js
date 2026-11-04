const Messages = require('../models/message.model');
const Requests = require('../models/identity-request.model');
const Conversations = require('../models/conversation.model');
const Chat = require('../models/conversation-message.model');
const Users = require('../models/user.model');
const { ApiError } = require('../middleware/error.middleware');
const { success } = require('../utils/response');
const same = (a, b) => String(a) === String(b);
const safeRequest = r => ({ _id: r._id, messageId: r.messageId, requesterId: r.requesterId, status: r.status, createdAt: r.createdAt, respondedAt: r.respondedAt });
// Assignment A - Question 1 - Sender comes only from a verified session
exports.send = async (req, res) => {
  const recipient = await Users.findOne(/^[a-f\d]{24}$/i.test(req.params.recipient) ? { _id: req.params.recipient } : { username: req.params.recipient.toLowerCase() });
  if (!recipient) throw new ApiError(404, 'Recipient not found');
  if (same(recipient._id, req.auth.user._id)) throw new ApiError(400, 'Cannot send to yourself');
  const message = await Messages.create({ recipientId: recipient._id, senderId: req.auth.user._id, content: req.body.content });
  success(res, { message: { _id: message._id, content: message.content, createdAt: message.createdAt } }, 201);
};
// Assignment A - Question 2 - Ownership precedes private sender access
exports.request = async (req, res) => {
  const message = await Messages.findOne({ _id: req.params.messageId, recipientId: req.auth.user._id }).select('+senderId');
  if (!message) throw new ApiError(404, 'Message not found');
  if (!message.senderId) throw new ApiError(409, 'Guest messages have no revealable identity');
  try {
    const item = await Requests.create({ messageId: message._id, requesterId: req.auth.user._id, senderId: message.senderId });
    success(res, { request: safeRequest(item) }, 201);
  } catch (error) { if (error.code === 11000) throw new ApiError(409, 'Identity request already exists'); throw error; }
};
// Course Section A - Question 2 - Database pagination with stable ordering and metadata
async function page(Model, filter, query) {
  const { page, limit } = query;
  const [items, total] = await Promise.all([Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Model.countDocuments(filter)]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total };
}
// Assignment A - Question 3 - Only original senders list incoming identity requests
// Course Section A - Question 3 - Allowlisted status filters never replace ownership
exports.list = async (req, res) => success(res, await page(Requests, { senderId: req.auth.user._id, ...(req.query.status ? { status: req.query.status } : {}) }, req.query));
// Assignment A - Question 4 - Atomic pending transition prevents conflicting decisions
exports.decide = async (req, res) => {
  const item = await Requests.findOneAndUpdate({ _id: req.params.requestId, senderId: req.auth.user._id, status: 'pending' }, { $set: { status: req.body.status, respondedAt: new Date() } }, { new: true });
  if (!item) throw new ApiError(404, 'Pending request not found');
  success(res, { request: safeRequest(item) });
};
// Assignment A - Question 4 - Only the requester sees a consenting sender's limited public identity
exports.disclosure = async (req, res) => {
  const item = await Requests.findOne({ _id: req.params.requestId, requesterId: req.auth.user._id }).select('+senderId');
  if (!item) throw new ApiError(404, 'Request not found');
  let sender;
  if (item.status === 'accepted') {
    const user = await Users.findById(item.senderId).select('name username');
    if (user) sender = { _id: user._id, name: user.name, publicId: user.username || user.id };
  }
  success(res, { request: safeRequest(item), ...(sender ? { sender } : {}) });
};
// Assignment A - Question 5 - Explicit creation after acceptance; both participants may retry
exports.create = async (req, res) => {
  const item = await Requests.findOne({ _id: req.params.requestId, status: 'accepted', $or: [{ requesterId: req.auth.user._id }, { senderId: req.auth.user._id }] }).select('+senderId');
  if (!item) throw new ApiError(404, 'Accepted request not found');
  const values = { requestId: item._id, messageId: item.messageId, participants: [item.requesterId, item.senderId] };
  let conversation;
  try { conversation = await Conversations.findOneAndUpdate({ requestId: item._id }, { $setOnInsert: values }, { upsert: true, new: true, runValidators: true }); }
  catch (error) { if (error.code !== 11000) throw error; conversation = await Conversations.findOne({ requestId: item._id }); }
  success(res, { conversation }, 201);
};
async function member(req) {
  const item = await Conversations.findOne({ _id: req.params.conversationId, participants: req.auth.user._id });
  if (!item) throw new ApiError(404, 'Conversation not found');
  return item;
}
// Assignment A - Question 6 - Membership is required regardless of administrative role
exports.sendChat = async (req, res) => {
  const conversation = await member(req);
  const message = await Chat.create({ conversationId: conversation._id, senderId: req.auth.user._id, content: req.body.content });
  success(res, { message }, 201);
};
// Assignment A - Question 7 - Membership checked before deterministic paginated retrieval
exports.getChat = async (req, res) => { await member(req); success(res, await page(Chat, { conversationId: req.params.conversationId }, req.query)); };
