// Read-only provider smoke check using a fresh headless browser, never a signed-in profile.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = 'C:/Users/Mada/OneDrive/Desktop/social-login/social-login/dist/social-login/browser';
const results = path.resolve(__dirname, '../test-results');
const profile = path.join(results, `google-browser-${crypto.randomUUID()}`);
fs.mkdirSync(results, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (file !== path.resolve(root) && !file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});
server.on('error', () => { console.error('Browser smoke check could not bind localhost:4200. No existing listener was changed.'); process.exitCode = 1; });
server.listen(4200, '127.0.0.1', () => {
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--dump-dom', '--timeout=15000', '--virtual-time-budget=12000',
    'http://localhost:4200'
  ], { windowsHide: true });
  let dom = '';
  browser.stdout.on('data', data => { dom += data; });
  browser.stderr.resume(); // Browser diagnostics can contain request details; do not print them.
  const timer = setTimeout(() => browser.kill(), 25000);
  browser.on('error', () => { console.error('Could not launch headless Chrome'); process.exitCode = 1; });
  browser.on('close', code => {
    clearTimeout(timer);
    const result = { browserExitedSuccessfully: code === 0,
      originalHeadlineRendered: dom.includes('A better way to connect.'),
      originalButtonContainerRendered: dom.includes('id="google-btn"'),
      providerButtonIframeRendered: /<iframe[^>]+accounts\.google\.com/.test(dom),
      providerUnavailableMessage: dom.includes('Google sign-in is unavailable'),
      realAccountLoginAttempted: false, databaseConnected: false };
    fs.writeFileSync(path.join(results, 'google-browser-smoke.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    server.close(() => {
      // Verify the generated absolute target before removing the isolated browser profile.
      assert.equal(path.dirname(path.resolve(profile)), results);
      assert.ok(path.basename(profile).startsWith('google-browser-'));
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* A closing Chrome process may briefly retain its profile lock. */ }
    });
  });
});
