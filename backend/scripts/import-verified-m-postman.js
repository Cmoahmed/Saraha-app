// Import only this task's credential-free, observed collection into the user's open Postman app.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const file = path.resolve(__dirname, '../postman/Saraha_Verified_Password_Reset_Uploads.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(file));
assert.equal(collection.info.name, 'Saraha - Verified Password Reset and Avatar Uploads');
assert.equal(collection.item[0].item.length, 15);
assert.ok(collection.item[0].item.every(i => i.response.length === 1));
assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(JSON.stringify(collection)));

async function main() {
  const port = Number(fs.readFileSync('C:/Users/Mada/AppData/Roaming/Postman/DevToolsActivePort', 'utf8').split('\n')[0]);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
  const page = targets.find(target => target.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const waiting = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Local Postman operation timed out')); }, 5000);
    waiting.set(id, result => { clearTimeout(timer); resolve(result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  try {
    await evaluate(`(() => { document.querySelector('[data-testid="sidebar-import-button"]')?.click(); return true; })()`);
    await new Promise(resolve => setTimeout(resolve, 400));
    const marked = await evaluate(`(() => {
      const area = [...document.querySelectorAll('textarea')].find(e => e.getBoundingClientRect().width > 0 && e.getAttribute('placeholder')?.startsWith('Paste a cURL'));
      if (!area) return false;
      let parent = area;
      while (parent && !parent.querySelector('input[type="file"]:not([webkitdirectory])')) parent = parent.parentElement;
      const input = parent?.querySelector('input[type="file"]:not([webkitdirectory])');
      if (!input) return false;
      input.setAttribute('data-verified-m-import', 'true'); return true;
    })()`);
    assert.ok(marked, 'Postman import dialog unavailable');
    const document = await call('DOM.getDocument');
    const input = await call('DOM.querySelector', { nodeId: document.result.root.nodeId, selector: '[data-verified-m-import="true"]' });
    await call('DOM.setFileInputFiles', { nodeId: input.result.nodeId, files: [file] });
    await new Promise(resolve => setTimeout(resolve, 1800));
    const result = await evaluate(`(() => { const text = document.body.innerText; return {
      collectionVisible: text.includes('Saraha - Verified Password Reset and Avatar Uploads'),
      completedNotice: /Import Complete|Import completed|Import successful/i.test(text),
      requiresChoice: [...document.querySelectorAll('button')].some(e => e.getBoundingClientRect().width > 0 && /^(Replace|Import as Copy)$/.test(e.textContent.trim()))
    }; })()`);
    console.log(JSON.stringify(result));
    assert.ok(result.collectionVisible || result.completedNotice, 'Import did not complete');
    fs.writeFileSync(path.resolve(__dirname, '../test-results/postman-m-import.json'), JSON.stringify({ ...result, expectedRequests: 15, expectedExamples: 15, credentialValuesIncluded: false }, null, 2));
  } finally { socket.close(); }
}
main().catch(() => { console.error('Verified M import did not complete; no original collection was overwritten.'); process.exitCode = 1; });
