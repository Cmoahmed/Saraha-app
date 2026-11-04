const nodemailer = require('nodemailer');
const { EventEmitter } = require('node:events');
const { ApiError } = require('../middleware/error.middleware');
const { bounded, milliseconds } = require('../utils/operation-timeout');
let testTransport;
// Section 2 - Question 13 - Mail delivery is asynchronous and awaited
// Section 2 - Question 14 - Nodemailer provides SMTP and local test transports
// Section 2 - Question 15 - Server-controlled mail templates
// Section 3 - Question 3 - One reusable transport boundary
async function sendChallenge(to, purpose, code, workflow) {
  const deliveryTimeout = milliseconds('MAIL_DELIVERY_TIMEOUT_MS', 12000);
  const transport = testTransport || (process.env.SMTP_HOST && nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // A per-message pool can cancel active sockets when the overall deadline expires.
    pool: true, maxConnections: 1, maxMessages: 1,
    connectionTimeout: Math.min(5000, deliveryTimeout),
    greetingTimeout: Math.min(3000, deliveryTimeout),
    dnsTimeout: Math.min(3000, deliveryTimeout),
    socketTimeout: Math.min(5000, deliveryTimeout),
    logger: false, debug: false
  }));
  if (!transport) throw new ApiError(503, 'Mail delivery is not configured');
  const message = { from: process.env.MAIL_FROM || 'Saraha <no-reply@localhost>', to,
    subject: purpose === 'enable2fa' ? 'Enable Saraha two-step verification' : purpose === 'login2fa' ? 'Saraha login verification' : purpose === 'verify' ? 'Confirm your Saraha email' : 'Recover your Saraha password',
    text: `Your ${purpose === 'verify' ? 'confirmation' : purpose === 'recover' ? 'recovery' : purpose} code is ${code}. It expires in ${Number(process.env.OTP_TTL_SECONDS || 300)} seconds.`,
    disableFileAccess: true, disableUrlAccess: true,
    // Section 3 - Question 2 - Trusted generated attachment; no user paths or URLs
    attachments: [{ filename: 'security.txt', content: Buffer.from('Never share your Saraha security codes.') }]
  };
  const cancel = () => transport.close?.();
  try {
    return workflow
      ? await workflow.run('mail.delivery', () => transport.sendMail(message), deliveryTimeout, cancel)
      : await bounded(() => transport.sendMail(message), deliveryTimeout, 'Mail delivery timed out; please try again', cancel);
  } catch (error) {
    if (error.status) throw error;
    throw new ApiError(503, 'Mail delivery is unavailable; check SMTP configuration');
  } finally {
    // Caller-owned test transports can be reused; close only the real per-message pool.
    if (transport !== testTransport) cancel();
  }
}
// Section 3 - Question 9 - One asynchronous event handler, with propagated errors
const events = new EventEmitter();
events.on('challenge', ({ to, purpose, code, workflow, resolve, reject }) => sendChallenge(to, purpose, code, workflow).then(resolve, reject));
function deliver(to, purpose, code, workflow) {
  return new Promise((resolve, reject) => events.emit('challenge', { to, purpose, code, workflow, resolve, reject }));
}
function useTestTransport(transport) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test transport is restricted to tests');
  testTransport = transport;
}
module.exports = { deliver, useTestTransport };
