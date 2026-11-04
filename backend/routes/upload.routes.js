const router = require('express').Router();
const { authenticate } = require('../middleware/authentication');
const { asyncHandler: wrap } = require('../middleware/error.middleware');
router.post('/avatar', authenticate, require('../middleware/upload'), wrap(async (req, res) => {
  res.json({ avatar: await require('../services/upload.service').save(req.auth.user.id, req.file) });
}));
module.exports = router;
