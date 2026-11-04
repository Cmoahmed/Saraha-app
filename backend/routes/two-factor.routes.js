const router = require('express').Router();
const { z } = require('zod');
const { validate: v } = require('../middleware/validate');
const { authenticate } = require('../middleware/authentication');
const { asyncHandler: w } = require('../middleware/error.middleware');
const { rateLimit } = require('express-rate-limit');
const c = require('../controllers/two-factor.controller');
const code = z.string().regex(/^\d{6}$/);
const limit = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
// Assignment B - Question 2 - Strict request validation and bounded OTP traffic
router.post('/2fa/request', limit, authenticate, v(z.strictObject({})), w(c.requestEnable));
router.post('/2fa/enable', limit, authenticate, v(z.strictObject({ code })), w(c.confirmEnable));
router.post('/2fa/login', limit, v(z.strictObject({ userId: require('../validations/message.schema').objectId, code })), w(c.confirmLogin));
router.otpLimiter = limit;
module.exports = router;
