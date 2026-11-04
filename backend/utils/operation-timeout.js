const { ApiError } = require('../middleware/error.middleware');

function milliseconds(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 100 || value > 60000) throw new ApiError(503, `${name} must be between 100 and 60000 milliseconds`);
  return value;
}

// A deadline bounds the caller even when a dependency never settles. Supply cancellation
// for network clients; database queries also receive their native driver/server timeout.
function bounded(operation, duration, message, cancel) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { cancel?.(); } catch { /* Preserve the controlled timeout error. */ }
      reject(new ApiError(503, message));
    }, duration);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); callback(value);
    };
    Promise.resolve().then(operation).then(value => finish(resolve, value), error => finish(reject, error));
  });
}
module.exports = { bounded, milliseconds };
