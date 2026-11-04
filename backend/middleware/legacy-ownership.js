const { authenticate } = require('./authentication');
const { ApiError } = require('./error.middleware');
// Assignment 8 - Question 3 - Bind historical query IDs to the verified caller in secured mode
module.exports = (req, res, next) => {
  if (process.env.LEGACY_REQUIRE_AUTH !== 'true') return next();
  authenticate(req, res, error => {
    if (error) return next(error);
    const caller = req.auth.user.id;
    const supplied = [req.query.userId, req.query.id].filter(v => v !== undefined);
    if (supplied.some(v => typeof v !== 'string' || v.toLowerCase() !== caller)) return next(new ApiError(403, 'You are not the owner'));
    req.query.userId = caller;
    next();
  });
};
