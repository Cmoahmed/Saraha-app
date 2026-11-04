const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/error.middleware');
const app = express();
// Course Section A - Question 10 - Only explicitly configured loopback proxy trust
app.set('trust proxy', process.env.TRUST_PROXY === 'loopback' ? 'loopback' : false);
// Course Section A - Question 5B - Helmet security headers; HSTS only in production HTTPS
app.use(require('helmet')({ strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false }));
// Course Section A - Question 6 - Exact origin allowlist; preflight handled by cors
app.use(cors({ origin: (origin, cb) => cb(null, !origin || require('./config/env').config().origin.split(',').map(v => v.trim()).includes(origin)) }));
app.use(express.json({ limit: '100kb' }));
app.get('/health', (req, res) => res.json({ message: 'API running' }));
// Course Section B - Question 2 - Database readiness is distinct from process health
app.get('/ready', (req, res) => res.status(require('mongoose').connection.readyState === 1 ? 200 : 503).json({ ready: require('mongoose').connection.readyState === 1 }));
app.use('/auth', require('./routes/two-factor.routes'));
app.use('/', require('./routes/identity.routes'));
if (require('./config/env').config().legacy) {
  app.use('/users', require('./routes/user.routes'));
  app.use('/notes', require('./routes/note.routes'));
}
app.use('/auth', require('./routes/auth.routes'));
app.use('/messages', require('./routes/message.routes'));
app.use('/api/notes', require('./routes/secure-note.routes'));
app.use('/auth', require('./routes/recovery.routes'));
app.use('/auth', require('./routes/upload.routes'));
// Section 4 - Question 12B - Serve only generated, re-encoded public avatars
app.get('/avatars/:name', (req, res, next) => {
  const uploads = require('./services/upload.service');
  if (!uploads.validName(req.params.name)) return res.status(404).json({ message: 'Avatar not found' });
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(req.params.name, { root: uploads.directory, dotfiles: 'deny' }, error => { if (error) next(error); });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);
module.exports = app;
