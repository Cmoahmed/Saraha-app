const Notes = require('../models/note.model');
const { ApiError } = require('../middleware/error.middleware');
const { id, user, body } = require('../middleware/validation');
async function owned(req) {
  const userId = await user(req);
  const document = await Notes.findById(id(req.params.noteId, 'noteId'));
  if (!document) throw new ApiError(404, 'Note not found');
  if (!document.userId.equals(userId)) throw new ApiError(403, 'You are not the owner');
  return document;
}
// Notes Question 1 - Create Note
exports.create = async (req, res) => {
  const userId = await user(req);
  const note = await Notes.create({ ...body(req, ['title', 'content']), userId });
  res.status(201).json({ message: 'Note created', note });
};
// Notes Question 2 - Update Note
exports.update = async (req, res) => {
  const note = await owned(req);
  Object.assign(note, body(req, ['title', 'content']));
  res.json(await note.save());
};
// Notes Question 3 - Replace Entire Note
exports.replace = async (req, res) => {
  const note = await owned(req);
  const data = body(req, ['title', 'content']);
  note.title = data.title;
  note.content = data.content;
  res.json(await note.save());
};
// Notes Question 4 - Update Title of All User Notes
exports.updateAll = async (req, res) => {
  const userId = await user(req);
  const data = body(req, ['title']);
  const result = await Notes.updateMany({ userId }, { $set: data }, { runValidators: true });
  if (!result.matchedCount) throw new ApiError(404, 'Note not found');
  res.json({ message: 'All notes updated' });
};
// Notes Question 5 - Delete One Note
// Assignment 8 Notes - Question 6 - Instructor numbering resumes after the stray URL-line number
exports.remove = async (req, res) => {
  const note = await owned(req);
  await note.deleteOne();
  res.json(note);
};
// Notes Question 6 - Paginated Notes
// Assignment 8 Notes - Question 7 - Owner-scoped stable pagination
exports.paginate = async (req, res) => {
  const userId = await user(req);
  const page = Number(req.query.page === undefined ? 1 : req.query.page);
  const limit = Number(req.query.limit === undefined ? 6 : req.query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger((page - 1) * limit)) throw new ApiError(400, 'page must be a positive integer; limit must be 1 to 100');
  const [notes, total] = await Promise.all([Notes.find({ userId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), Notes.countDocuments({ userId })]);
  res.json({ notes, page, limit, total, totalPages: Math.ceil(total / limit) });
};
// Notes Question 7 - Get One Note by ID
// Assignment 8 Notes - Question 8 - Retrieve only an owned note
exports.get = async (req, res) => res.json(await owned(req));
// Notes Question 8 - Search Note by Content
// Assignment 8 Notes - Question 9 - Exact bounded content lookup
exports.byContent = async (req, res) => {
  const userId = await user(req);
  if (typeof req.query.content !== 'string' || !req.query.content.trim()) throw new ApiError(400, 'content query is required');
  const note = await Notes.findOne({ userId, content: req.query.content }).sort({ createdAt: -1 });
  if (!note) throw new ApiError(404, 'No note found');
  res.json(note);
};
// Notes Question 9 - Notes with User Email
// Assignment 8 Notes - Question 10 - Safe selected population
exports.withUser = async (req, res) => {
  res.json(await Notes.find({ userId: await user(req) }).select('_id title userId createdAt').populate({ path: 'userId', select: 'email -_id' }));
};
// Notes Question 10 - Aggregation Search
// Assignment 8 Notes - Question 11 - Owner-scoped aggregation projection
exports.aggregate = async (req, res) => {
  const userId = await user(req);
  if (typeof req.query.title !== 'string' || !req.query.title.trim()) throw new ApiError(400, 'title query is required');
  res.json(await Notes.aggregate([
    { $match: { userId, title: req.query.title } },
    { $lookup: { from: 'Users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { title: 1, userId: 1, createdAt: 1, 'user.name': 1, 'user.email': 1 } }
  ]));
};
// Notes Question 11 - Delete All User Notes
// Assignment 8 Notes - Question 12 - Remove only the current owner's notes
exports.removeAll = async (req, res) => {
  await Notes.deleteMany({ userId: await user(req) });
  res.json({ message: 'Deleted' });
};
