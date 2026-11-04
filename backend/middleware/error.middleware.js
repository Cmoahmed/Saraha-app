class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
// Authentication Question 6 - Exception Refactor
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  req.emailWorkflow?.trace('error-handler', String(error.status || 500));
  if (error.code === 11000) return res.status(409).json({ message: error.keyPattern?.email ? 'Email already exists.' : 'Unique field already exists.' });
  if (error.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors).map(item => item.message).join('; ') });
  if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid value or MongoDB ID' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  if (!error.status) console.error('Request failed:', error.name);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Unexpected server error' });
}
module.exports = { ApiError, asyncHandler, errorHandler };
