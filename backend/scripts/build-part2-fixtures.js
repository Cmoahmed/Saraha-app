const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
async function main() {
  const directory = path.join(__dirname, '../postman/fixtures');
  await fs.mkdir(directory, { recursive: true });
  await sharp({ create: { width: 16, height: 16, channels: 3, background: '#55aa99' } }).png().toFile(path.join(directory, 'avatar.png'));
  await fs.writeFile(path.join(directory, 'fake.png'), 'This is text, not an image.');
  await fs.writeFile(path.join(directory, 'unsupported.txt'), 'Safe plain text fixture.');
  await fs.writeFile(path.join(directory, 'oversized.png'), Buffer.alloc(2 * 1024 * 1024 + 1));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
