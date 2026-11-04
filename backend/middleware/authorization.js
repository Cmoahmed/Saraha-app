const { ApiError } = require('./error.middleware');
// Authorization Question 5 - Handle Roles
// Authorization Question 8 - Authorization
exports.roles = (...allowed) => (req, res, next) => {
  if (!allowed.includes(req.auth.user.role || 'user')) return next(new ApiError(403, 'Insufficient role'));
  next();
};
