const { z } = require('zod');
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
// Authorization Question 13 - Zod Documentation (Number / Boolean)
// Authorization Question 14 - Zod String / Bool
const pagination = z.strictObject({ page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), isRead: z.enum(['true', 'false']).transform(v => v === 'true').optional() });
const params = z.strictObject({ messageId: objectId });
const recipient = z.strictObject({ recipient: z.string().min(3).max(30).regex(/^[a-zA-Z\d_]+$/) });
const send = z.strictObject({ content: z.string().trim().min(1).max(2000) });
const read = z.strictObject({ isRead: z.boolean() });
module.exports = { pagination, params, recipient, send, read, objectId };
