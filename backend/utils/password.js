const bcrypt = require('bcryptjs');
const argon2 = require('argon2');
const { config } = require('../config/env');
// Authentication Question 8 - Hash Rounds
const hashLegacy = value => bcrypt.hash(value, config().bcryptRounds);
// Authentication Question 9 - Hashing Tools
// Authentication Question 12 - Using Argon2
const hash = value => argon2.hash(value, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
async function verify(stored, value) {
  if (/^\$2[aby]\$/.test(stored || '')) return bcrypt.compare(value, stored);
  if ((stored || '').startsWith('$argon2id$')) return argon2.verify(stored, value);
  return false;
}
module.exports = { hash, verify, hashLegacy };
