// Course Section A - Question 7 - Default case-insensitive, non-strict routing preserves existing contracts
const router = require('express').Router({ mergeParams: false });
const { z } = require('zod');
const s = require('../validations/message.schema');
const { validate: v } = require('../middleware/validate');
const { authenticate } = require('../middleware/authentication');
const { asyncHandler: w } = require('../middleware/error.middleware');
const c = require('../controllers/identity.controller');
const paging = { page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const id = field => v(z.strictObject({ [field]: s.objectId }), 'params');
// Course Section A - Question 4 - Reject forged sender IDs and empty or oversized content
// Course Section A - Question 5A - Strict body, parameter and query schemas on new APIs

router.post('/messages/hidden/:recipient', authenticate, require('../middleware/course-rate-limit').limiter('hidden', 10), v(s.recipient, 'params'), v(s.send), w(c.send));
router.post('/messages/:messageId/identity-request', authenticate, id('messageId'), v(z.strictObject({})), w(c.request));
router.get('/identity-requests', authenticate, v(z.strictObject({ ...paging, status: z.enum(['pending', 'accepted', 'rejected']).optional() }), 'query'), w(c.list));
router.get('/identity-requests/:requestId', authenticate, id('requestId'), w(c.disclosure));
router.patch('/identity-requests/:requestId', authenticate, id('requestId'), v(z.strictObject({ status: z.enum(['accepted', 'rejected']) })), w(c.decide));
router.post('/identity-requests/:requestId/conversation', authenticate, id('requestId'), v(z.strictObject({})), w(c.create));
router.post('/conversations/:conversationId/messages', authenticate, id('conversationId'), v(s.send), w(c.sendChat));
router.get('/conversations/:conversationId/messages', authenticate, id('conversationId'), v(z.strictObject(paging), 'query'), w(c.getChat));
module.exports = router;
