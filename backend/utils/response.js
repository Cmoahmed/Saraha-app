// Authentication Question 5 - Refactor Success Response
exports.success = (res, data, status = 200) => res.status(status).json({ message: 'Success', ...data });
