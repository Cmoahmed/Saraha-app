const { createClient } = require('redis');
const { bounded, milliseconds } = require('../utils/operation-timeout');
let client, pending;
// Section 1 - Question 12 - Local Redis or Upstash TCP/TLS through REDIS_URL
// Section 2 - Question 2 - Lazy connection, bounded errors, explicit shutdown
async function connect() {
  if (client?.isReady) return client;
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not configured');
  if (!pending) pending = (async () => {
    const duration = milliseconds('REDIS_OPERATION_TIMEOUT_MS', 3000);
    const connection = createClient({ url: process.env.REDIS_URL, disableOfflineQueue: true, socket: { connectTimeout: duration, socketTimeout: duration, reconnectStrategy: false } });
    client = connection;
    connection.on('error', () => { /* Callers receive command failures; never log credentials. */ });
    await bounded(() => connection.connect(), duration, 'Redis connection timed out', () => { if (connection.isOpen) connection.destroy(); });
    return connection;
  })().finally(() => { pending = undefined; });
  return pending;
}
// Section 2 - Question 4 - Namespaced JSON values with explicit TTL seconds
function key(value) { return `saraha:course:${value}`; }
async function set(name, value, seconds) {
  if (!Number.isInteger(seconds) || seconds < 1) throw new Error('TTL must be positive seconds');
  return (await connect()).withAbortSignal(AbortSignal.timeout(milliseconds('REDIS_OPERATION_TIMEOUT_MS', 3000))).set(key(name), JSON.stringify(value), { EX: seconds });
}
async function get(name) { const value = await (await connect()).withAbortSignal(AbortSignal.timeout(milliseconds('REDIS_OPERATION_TIMEOUT_MS', 3000))).get(key(name)); return value === null ? null : JSON.parse(value); }
// Section 2 - Question 5 - Cleanup and lifecycle are shared with all clients
async function del(name) { return (await connect()).withAbortSignal(AbortSignal.timeout(milliseconds('REDIS_OPERATION_TIMEOUT_MS', 3000))).del(key(name)); }
async function close() {
  const connection = client;
  try { if (connection?.isOpen) await bounded(() => connection.close(), milliseconds('REDIS_OPERATION_TIMEOUT_MS', 3000), 'Redis shutdown timed out', () => { if (connection.isOpen) connection.destroy(); }); }
  finally { if (client === connection) client = undefined; }
}
module.exports = { connect, key, set, get, del, close };
