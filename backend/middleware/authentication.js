const Users = require('../models/user.model');
const Sessions = require('../models/refreshToken.model');
const { verify } = require('../services/token.service');
const { ApiError, asyncHandler } = require('./error.middleware');
// JWT Question 10 - Auth Middleware and Get Profile
// Authorization Question 4 - Check Token
// Authorization Question 7 - Bearer Token
// Section 2 - Question 12 - Central session check keeps all logout paths consistent
exports.authenticate = asyncHandler(async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
  if (!match) throw new ApiError(401, 'Bearer access token required');
  const p = verify(match[1], 'access');
  const load = duration => {
    const queries = [Users.findById(p.sub), Sessions.findOne({ _id: p.sid, userId: p.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).select('authVersion')];
    if (duration) for (const query of queries) query.setOptions({ maxTimeMS: duration, timeoutMS: duration });
    return Promise.all(queries.map((query, index) => req.emailWorkflow
      ? req.emailWorkflow.run(index === 0 ? 'authentication.user' : 'authentication.session', () => query, duration)
      : query));
  };
  const [user, session] = req.emailWorkflow ? await req.emailWorkflow.run('authentication.mongo', load) : await load();
  if (!user || !session || (user.authVersion || 0) !== (session.authVersion || 0)) throw new ApiError(401, 'Account or session no longer active');
  req.auth = { user, sessionId: p.sid };
  next();
});
