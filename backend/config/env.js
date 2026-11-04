// Authentication Question 16 - .env
function config() {
  const e = process.env;
  const value = {
    port: Number(e.PORT || 3001), mongoUri: e.MONGO_URI,
    accessSecret: e.JWT_ACCESS_SECRET, refreshSecret: e.JWT_REFRESH_SECRET,
    encryptionKey: e.ENCRYPTION_KEY, accessExpiry: e.ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshExpiry: e.REFRESH_TOKEN_EXPIRES_IN || '7d', issuer: e.JWT_ISSUER || 'saraha',
    audience: e.JWT_AUDIENCE || 'saraha-client', origin: e.CORS_ORIGIN || e.FRONTEND_ORIGIN || 'http://localhost:4200',
    googleClientId: e.GOOGLE_CLIENT_ID,
    legacy: e.NODE_ENV !== 'production' && e.LEGACY_ASSIGNMENT_MODE !== 'false',
    bcryptRounds: Number(e.BCRYPT_ROUNDS || 12)
  };
  return value;
}
function validateEnv() {
  const c = config();
  if (!c.mongoUri) throw new Error('MONGO_URI is required');
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error('Invalid PORT');
  for (const key of ['accessSecret', 'refreshSecret']) {
    if (!c[key] || Buffer.byteLength(c[key]) < 32) throw new Error(`${key} requires at least 32 bytes`);
  }
  if (c.accessSecret === c.refreshSecret) throw new Error('JWT secrets must differ');
  if (!/^[a-f\d]{64}$/i.test(c.encryptionKey || '')) throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters');
  if (!Number.isInteger(c.bcryptRounds) || c.bcryptRounds < 10 || c.bcryptRounds > 14) throw new Error('BCRYPT_ROUNDS must be 10 to 14');
  for (const key of ['accessExpiry', 'refreshExpiry']) if (!/^\d+[smhd]$/.test(c[key]) || parseInt(c[key], 10) < 1) throw new Error(`Invalid ${key}`);
  if (!c.origin.split(',').every(origin => { try { const u = new URL(origin.trim()); return ['http:', 'https:'].includes(u.protocol) && u.origin === origin.trim() && !origin.includes('*'); } catch { return false; } })) throw new Error('CORS_ORIGIN must be an explicit HTTP origin or comma-separated origins');
  return c;
}
module.exports = { config, validateEnv };
