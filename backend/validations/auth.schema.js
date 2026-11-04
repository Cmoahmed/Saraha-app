const { z } = require('zod');
// Authorization Question 12 - Zod Documentation (String)
// Advanced Validation Question 3 - Custom Validation
// Section 1 - Question 9 - Shared signup and recovery password policy
const password = z.string().min(8).max(128).refine(value => !/^\s+$/.test(value), 'Password cannot be blank');
// Section 1 - Question 10 - Normalize email and use Zod email validation
const email = z.string().trim().toLowerCase().email().max(254);
// Section 1 - Question 8 - Validate before phone encryption; preserve stored legacy values
const phone = z.string().trim().transform(v => v.replace(/[ ()-]/g, '')).refine(v => /^01[0125]\d{8}$/.test(v) || /^\+[1-9]\d{7,14}$/.test(v), 'Use an Egyptian mobile number or international + format');
// Section 1 - Question 6 - Bounded simple patterns avoid nested backtracking
// Section 1 - Question 7 - Normalize and reserve service usernames; unique Mongo index handles races
const username = z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z\d_]+$/).refine(v => !/^[a-f\d]{24}$/i.test(v) && !['admin', 'root', 'api', 'auth', 'support', 'system'].includes(v), 'Username is reserved').optional();
// Advanced Validation Question 2 - Literal vs Enum
const role = z.enum(['user', 'admin']);
// Advanced Validation Question 2 - Literal vs Enum
const tokenType = z.literal('Bearer');
// Advanced Validation Question 5 - Refactor
const fields = { name: z.string().trim().min(1).max(100), email, Phone: phone, age: z.number().int().min(18).max(60).optional(), username };
// Advanced Validation Question 7 - Signup Schema
// Advanced Validation Question 4 - Super Refine
// Authorization Question 15 - Object (Strict / Loose / Catchall)
const signup = z.strictObject({ ...fields, password: password.optional(), Password: password.optional(), confirmPassword: z.string().optional() }).superRefine((data, ctx) => {
  if ((!data.password && !data.Password) || (data.password && data.Password)) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Provide exactly one password field' });
  if (data.confirmPassword !== undefined && data.confirmPassword !== (data.password || data.Password)) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' });
});
const login = z.strictObject({ email, password: z.string().min(1).max(128).optional(), Password: z.string().min(1).max(128).optional() }).refine(d => Boolean(d.password) !== Boolean(d.Password), 'Provide exactly one password');
const profile = z.strictObject(fields).partial().refine(d => Object.keys(d).length > 0, 'Provide at least one field');
const refresh = z.strictObject({ refreshToken: z.string().min(1).max(4096) });
const google = z.strictObject({ idToken: z.string().min(1).max(8192) });
module.exports = { signup, login, profile, refresh, google, role, tokenType, password, email };
