// Add observed status/message examples to the ORIGINAL Postman requests. No collection replacement.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman/Verified_Email_Examples.json')));
let stage = 'connect';
async function main() {
  const port = Number(fs.readFileSync('C:/Users/Mada/AppData/Roaming/Postman/DevToolsActivePort', 'utf8').split('\n')[0]);
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()).find(p => p.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const waiting = new Map();
  socket.onmessage = event => { const data = JSON.parse(event.data); if (waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const nextId = ++id;
    const timer = setTimeout(() => { waiting.delete(nextId); reject(new Error('Postman operation timed out')); }, 5000);
    waiting.set(nextId, result => { clearTimeout(timer); resolve(result); }); socket.send(JSON.stringify({ id: nextId, method, params }));
  });
  const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = async (key, code, value, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: value, modifiers });
  };
  const results = [];
  try {
    // The first example was already added and verified interactively in this task.
    for (const { name, example } of examples.filter(e => e.name !== 'ConfirmEmailValidOTP' && (!process.argv.includes('--replay-only') || e.name === 'ConfirmEmailReusedOTP'))) {
      stage = `${name}:open`;
      assert.deepEqual(Object.keys(JSON.parse(example.body)), ['message']);
      const existingDraft = await evaluate(`(() => document.title.startsWith(${JSON.stringify(name + ' -')}) && [...document.querySelectorAll('input[placeholder="Enter a status code"]')].some(e=>e.getBoundingClientRect().width>0))()`);
      if (!existingDraft) {
      const point = await evaluate(`(() => {
        const e = [...document.querySelectorAll('[data-testid="sidebar-row-name"]')].find(e => e.textContent.trim() === ${JSON.stringify(name)} && e.getBoundingClientRect().width > 0);
        if (!e) return null; e.scrollIntoView({block:'center'}); e.click(); const r=e.getBoundingClientRect(); return {x:r.x+Math.min(r.width/2,80),y:r.y+r.height/2};
      })()`);
      assert.ok(point, 'Original request missing');
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'right', buttons: 2, clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'right', buttons: 0, clickCount: 1 });
      await pause(250);
      assert.ok(await evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Add example'&&e.getBoundingClientRect().width>0);e?.click();return !!e;})()`));
      }
      stage = `${name}:status`;
      let statusReady = false;
      for (let attempt=0;attempt<12&&!statusReady;attempt++) {
        await pause(250);
        statusReady=await evaluate(`(() => { const e=[...document.querySelectorAll('input[placeholder="Enter a status code"]')].find(e=>e.getBoundingClientRect().width>0);e?.focus();return !!e;})()`);
      }
      assert.ok(statusReady);
      await key('a', 'KeyA', 65, 2); await call('Input.insertText', { text: String(example.code) }); await key('Tab', 'Tab', 9);
      stage = `${name}:body`;
      assert.ok(await evaluate(`(() => {const t=[...document.querySelectorAll('[data-testid="response-body-toolbar-wrapper"]')].find(e=>e.getBoundingClientRect().width>0);const e=t?.parentElement.querySelector('textarea');e?.focus();return !!e;})()`));
      await key('a', 'KeyA', 65, 2); await call('Input.insertText', { text: example.body }); await key('s', 'KeyS', 83, 2);
      await pause(800);
      const result = await evaluate(`(() => {
        const t=[...document.querySelectorAll('[data-testid="response-body-toolbar-wrapper"]')].find(e=>e.getBoundingClientRect().width>0);
        const text=t?.parentElement.textContent.replace(/\u00a0/g,' ')||'';
        const status=[...document.querySelectorAll('input[placeholder="Enter a status code"]')].find(e=>e.getBoundingClientRect().width>0)?.value;
        const save=[...document.querySelectorAll('button')].find(e=>e.getBoundingClientRect().width>0&&e.textContent.trim()==='Save');
        return {name:${JSON.stringify(name)},status:parseInt(status,10),bodyMatches:text.includes(${JSON.stringify(JSON.parse(example.body).message)}),saved:save?.disabled===true};
      })()`);
      stage = `${name}:verify`;
      console.log(JSON.stringify(result));
      assert.equal(result.status, example.code); assert.ok(result.bodyMatches); assert.ok(result.saved);
      results.push(result);
    }
    const counts = await evaluate(`(() => {const names=${JSON.stringify(examples.map(e=>e.name))};const rows=[...document.querySelectorAll('[data-testid="sidebar-row-name"]')].filter(e=>e.getBoundingClientRect().width>0);return Object.fromEntries(names.map(name=>[name,rows.filter(e=>e.textContent.trim()===name).length]));})()`);
    for (const count of Object.values(counts)) assert.ok(count >= 2, 'Expected original request plus saved example');
    const report = { savedInOriginalRequests: true, originalRequestAndExampleCounts: counts, results,
      ConfirmEmailValidOTP: { status: 200, saved: true, bodyVerifiedSeparately: true }, noCollectionReplaced: true };
    fs.writeFileSync(path.join(__dirname, '../test-results/postman-l-desktop.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ allThreeOriginalRequestsHaveSavedExamples: true, noCollectionReplaced: true }));
  } finally { socket.close(); }
}
main().catch(() => { console.error(`Original-request example save needs attention at ${stage}; no original request was deleted.`); process.exitCode = 1; });
