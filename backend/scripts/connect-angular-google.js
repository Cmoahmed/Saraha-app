// Apply the reviewed integration to the user's selected existing Angular 20 demo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = 'C:/Users/Mada/OneDrive/Desktop/social-login/social-login';
const workspace = path.resolve(__dirname, '../..');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const clientId = env.GOOGLE_CLIENT_ID?.trim();
if (!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId || '')) throw new Error('Configure a valid GOOGLE_CLIENT_ID in backend/.env');
const angular = JSON.parse(fs.readFileSync(path.join(project, 'package.json')));
if (!angular.dependencies?.['@angular/core']?.includes('20.')) throw new Error('Expected the selected Angular 20 project');
const staged = path.join(workspace, '.frontend-google-staging');
const mappings = [['app.ts', 'src/app/app.ts'], ['app.spec.ts', 'src/app/app.spec.ts'], ['auth.ts', 'src/app/services/auth.ts'], ['auth.spec.ts', 'src/app/services/auth.spec.ts']];
for (const [file] of mappings) if (!fs.existsSync(path.join(staged, file))) throw new Error('Missing reviewed integration source');
const checkpoint = path.join(workspace, `frontend-google-checkpoint-${Date.now()}`);
fs.mkdirSync(checkpoint);
const preserved = ['src/app/app.html', 'src/app/app.scss', 'src/styles.scss', 'src/app/app.config.ts', 'package.json', 'package-lock.json'];
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(project, file))).digest('hex');
const hashes = Object.fromEntries(preserved.map(file => [file, digest(file)]));
for (const file of [...mappings.map(([, file]) => file), ...preserved, 'src/app/auth.config.ts']) {
  if (!fs.existsSync(path.join(project, file))) continue;
  const destination = path.join(checkpoint, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(project, file), destination);
}
for (const [file, destination] of mappings) fs.copyFileSync(path.join(staged, file), path.join(project, destination));
// The OAuth client ID is public configuration. Never copy an OAuth client secret.
fs.writeFileSync(path.join(project, 'src/app/auth.config.ts'), `// Public Google Web OAuth client ID; must match backend GOOGLE_CLIENT_ID.\nexport const GOOGLE_CLIENT_ID = ${JSON.stringify(clientId)};\nexport const SARAHA_API_URL = 'http://localhost:3001';\n`);
for (const file of preserved) if (digest(file) !== hashes[file]) throw new Error(`Unexpected change to preserved file: ${file}`);
fs.writeFileSync(path.join(checkpoint, 'preserved-hashes.json'), JSON.stringify(hashes, null, 2));
console.log('Connected selected Angular 20 demo. Client IDs match. Original HTML, SCSS, app providers and dependency files are unchanged.');
console.log(`Source checkpoint: ${path.basename(checkpoint)}`);
