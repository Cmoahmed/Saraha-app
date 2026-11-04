const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { ApiError } = require('../middleware/error.middleware');
const Users = require('../models/user.model');
// Section 4 - Question 11 - Dedicated destination, generated names, safe cleanup
const directory = path.resolve(process.env.AVATAR_DIR || path.join(__dirname, '../uploads/avatars'));
const validName = value => /^[a-f\d-]{36}\.webp$/.test(value || '');
async function remove(name) { if (validName(name)) await fs.unlink(path.join(directory, name)).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
// Section 4 - Question 13 - Decode actual contents, bound pixels and re-encode without metadata
// W15S2 - Question 2 - Reuse the complete validated image processing workflow
// W15S2 - Question 3 - The upload cycle verifies decode, persistence, retrieval and replacement
async function save(userId, file) {
  if (!file) throw new ApiError(400, 'Avatar file required');
  let buffer;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || `image/${metadata.format}` !== file.mimetype || (metadata.pages || 1) > 1) throw new Error('Unsupported contents');
    buffer = await image.resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
  } catch { throw new ApiError(415, 'Malformed or mismatched image'); }
  // W15S2 - Question 7 - Create the dedicated attachment directory when needed
  await fs.mkdir(directory, { recursive: true });
  // W15S2 - Question 6 - Generate a final filename independent of client-controlled paths
  const name = `${crypto.randomUUID()}.webp`;
  // W15S2 - Question 5 - Persist re-encoded bytes from bounded memory storage
  await fs.writeFile(path.join(directory, name), buffer, { flag: 'wx' });
  let previous;
  try {
    // W15S2 - Question 9 - Store the generated avatar name on the authenticated user's record
    previous = await Users.findOneAndUpdate({ _id: userId }, { $set: { avatar: name } });
    if (!previous) throw new ApiError(404, 'User not found');
  } catch (error) { await remove(name); throw error; }
  await remove(previous.avatar);
  return `/avatars/${name}`;
}
module.exports = { directory, validName, save };
