const { z } = require('zod');
const { objectId } = require('./message.schema');
const title = z.string().trim().min(1).max(200).refine(v => !/[A-Z]/.test(v) || /[a-z]/.test(v), 'Title must not be uppercase only');
const create = z.strictObject({ title, content: z.string().trim().min(1).max(10000) });
const update = create.partial().refine(v => Object.keys(v).length > 0, 'At least one field is required');
const params = z.strictObject({ noteId: objectId });
const query = z.strictObject({ page: z.coerce.number().int().min(1).max(1000000).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), content: z.string().trim().min(1).max(10000).optional(), title: title.optional() });
module.exports = { create, update, params, query, all: z.strictObject({ title }) };
