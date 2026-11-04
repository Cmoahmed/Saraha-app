const crypto = require('node:crypto');
const { bounded, milliseconds } = require('../utils/operation-timeout');
const { ApiError } = require('./error.middleware');

function emailWorkflow(req, res, next) {
  try {
    const started = Date.now();
    const deadline = started + milliseconds('EMAIL_REQUEST_TIMEOUT_MS', 20000);
    const databaseTimeout = milliseconds('EMAIL_DB_TIMEOUT_MS', 5000);
    const requestId = crypto.randomUUID();
    // Safe runtime marker: proves this listener loaded the bounded workflow implementation.
    res.set('X-Email-Workflow-Version', 'bounded-v3');
    res.set('X-Email-Request-Id', requestId);
    const trace = (stage, outcome) => {
      if (process.env.EMAIL_DIAGNOSTICS === 'true') console.info(JSON.stringify({ event: 'email-verification', requestId, stage, outcome, elapsedMs: Date.now() - started }));
    };
    req.emailWorkflow = {
      trace,
      async run(stage, operation, limit = databaseTimeout, cancel) {
        trace(stage, 'started');
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new ApiError(503, 'Email verification timed out; please try again');
        const duration = Math.min(limit, remaining);
        try {
          const result = await bounded(() => operation(duration), duration, 'Email verification dependency timed out; please try again', cancel);
          trace(stage, 'completed'); return result;
        } catch (error) {
          trace(stage, 'failed');
          // OTP's atomic resend reservation uses a duplicate-key collision to enforce
          // cooldown/send limits. Let the OTP service map that domain error to 429.
          if (error.status || error.code === 11000) throw error;
          throw new ApiError(503, 'Email verification dependency is unavailable; please try again');
        }
      }
    };
    trace('request', 'started');
    res.once('finish', () => trace('response', String(res.statusCode)));
    next();
  } catch (error) { next(error); }
}
module.exports = emailWorkflow;
