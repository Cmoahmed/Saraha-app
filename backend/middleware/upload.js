const multer = require('multer');
const { ApiError } = require('./error.middleware');
// Section 4 - Question 9 - Route-scoped authenticated Multer upload
// Section 4 - Question 10 - One avatar field, consistent error translation
// Section 4 - Question 12B - Bound bytes, files, fields and multipart parts
// W15S2 - Question 4 - Bounded Multer memory storage precedes decoding and disk persistence
const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  // Section 4 - Question 12A - Initial MIME allowlist, followed by decoding
  fileFilter(req, file, cb) { cb(['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype) ? null : new ApiError(415, 'Unsupported image type'), true); }
}).single('avatar');
// W15S2 - Question 8 - Route-scoped file middleware translates bounded parser errors
module.exports = (req, res, next) => parse(req, res, error => next(error instanceof multer.MulterError ? new ApiError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code) : error));
