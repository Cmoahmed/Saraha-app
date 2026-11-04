const crypto = require('node:crypto');
const { config } = require('../config/env');
function key() {
  if (!/^[a-f\d]{64}$/i.test(config().encryptionKey || '')) throw new Error('Invalid ENCRYPTION_KEY');
  return Buffer.from(config().encryptionKey, 'hex');
}
// Authentication Question 15 - Encrypt Phone
function encryptPhone(phone) {
  if (phone.startsWith('enc:v1:')) { decryptPhone(phone); return phone; }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from('saraha:phone:v1'));
  const data = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  return ['enc', 'v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}
function decryptPhone(phone) {
  if (!phone || !phone.startsWith('enc:v1:')) return phone;
  const parts = phone.split(':');
  if (parts.length !== 5 || !/^[a-f\d]{24}$/i.test(parts[2]) || !/^[a-f\d]{32}$/i.test(parts[3]) || !/^(?:[a-f\d]{2})+$/i.test(parts[4])) throw new Error('Invalid encrypted phone');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[2], 'hex'));
  decipher.setAAD(Buffer.from('saraha:phone:v1'));
  decipher.setAuthTag(Buffer.from(parts[3], 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], 'hex')), decipher.final()]).toString('utf8');
}
module.exports = { encryptPhone, decryptPhone };
