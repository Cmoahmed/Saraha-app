const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Users = require('../models/user.model');
const { encryptPhone, decryptPhone } = require('../services/encryption.service');
// Authentication Question 15 - Encrypt Phone (explicit opt-in migration)
async function main() {
  require('../config/env').validateEnv();
  await require('../config/db')(process.env.MONGO_URI);
  let plain = 0, encrypted = 0;
  for await (const user of Users.find({ Phone: { $type: 'string' } }).cursor()) {
    if (user.Phone.startsWith('enc:v1:')) { decryptPhone(user.Phone); encrypted++; continue; }
    plain++;
    if (process.argv.includes('--apply')) await Users.updateOne({ _id: user._id, Phone: user.Phone }, { $set: { Phone: encryptPhone(user.Phone) } });
  }
  console.log({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', plaintextPhones: plain, validEncryptedPhones: encrypted });
}
main().catch(error => { console.error(error.name, 'Migration failed; review configuration and backup'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
