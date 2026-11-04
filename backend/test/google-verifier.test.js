const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
// Section 1 - Question 2 - Exercise the real Google cryptographic verifier with local keys
test('Google verifier rejects wrong audience, issuer, expiry, signature and malformed signed fixtures', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const client = new OAuth2Client('audit-client');
  // Only certificate discovery is stubbed; token verification is the official implementation.
  client.getFederatedSignonCertsAsync = async () => ({ certs: { audit: publicKey.export({ type: 'spki', format: 'pem' }) } });
  const sign = (overrides = {}, key = privateKey) => jwt.sign({ sub: 'audit-subject', email: 'audit@example.com', email_verified: true }, key, { algorithm: 'RS256', keyid: 'audit', audience: 'audit-client', issuer: 'https://accounts.google.com', expiresIn: 3600, ...overrides });
  const verify = idToken => client.verifyIdToken({ idToken, audience: 'audit-client' });
  assert.equal((await verify(sign())).getPayload().sub, 'audit-subject');
  for (const options of [{ audience: 'other' }, { issuer: 'other' }, { expiresIn: -600 }]) await assert.rejects(verify(sign(options)));
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(verify(sign({}, other.privateKey)));
  await assert.rejects(verify('not.a.token'));
});
