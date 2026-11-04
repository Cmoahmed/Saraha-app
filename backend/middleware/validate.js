// Authorization Question 11 - Handle Validation Error
// Advanced Validation Question 9 - Validation Fields
function formatIssues(issues, arabic) {
  return issues.map(i => ({ field: [i.source, ...i.path].join('.'), code: i.code, message: arabic ? 'تحقق من قيمة هذا الحقل' : i.message }));
}
// Advanced Validation Question 10 - Localization (Translate)
const isArabic = req => /^ar\b/i.test(req.headers['accept-language'] || '');
// Authorization Question 10 - How to Use Zod
// Advanced Validation Question 6 - Validate Body, Params, Query
exports.validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const arabic = isArabic(req);
    return res.status(400).json({ message: arabic ? 'بيانات غير صالحة' : 'Validation failed', errors: formatIssues(parsed.error.issues.map(i => ({ ...i, source })), arabic) });
  }
  req[source] = parsed.data;
  next();
};
