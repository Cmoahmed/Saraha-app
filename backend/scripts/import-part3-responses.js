const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { connect } = require('./postman-desktop');
const file = path.join(__dirname, '../postman/Saraha_Course_Part3_Verified_Responses.postman_collection.json');
async function main() {
  const collection = JSON.parse(fs.readFileSync(file));
  assert.equal(collection.info.name, 'Saraha Course Part 3 - Verified Responses');
  assert.equal(collection.item.flatMap(f => f.item).filter(i => i.response?.length).length, 51);
  const d = await connect();
  try {
    await d.evaluate(`document.querySelector('[data-testid="sidebar-import-button"]')?.click()`);
    await new Promise(resolve => setTimeout(resolve, 400));
    const marked = await d.evaluate(`(() => {
      const area = [...document.querySelectorAll('textarea')].find(e => e.getBoundingClientRect().width > 0 && e.getAttribute('placeholder')?.startsWith('Paste a cURL'));
      if (!area) return false;
      let parent = area;
      while (parent && !parent.querySelector('input[type="file"]:not([webkitdirectory])')) parent = parent.parentElement;
      const input = parent?.querySelector('input[type="file"]:not([webkitdirectory])');
      if (!input) return false;
      input.setAttribute('data-part3-responses-import', 'true'); return true;
    })()`);
    assert.ok(marked, 'Postman import dialog not available');
    const doc = await d.call('DOM.getDocument');
    const input = await d.call('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-part3-responses-import="true"]' });
    await d.call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
    await new Promise(resolve => setTimeout(resolve, 2000));
    const result = await d.evaluate(`(() => {
      const text = document.body.innerText;
      return { collectionVisible: text.includes('Saraha Course Part 3 - Verified Responses'),
        completedNotice: /Import Complete|Import completed|Import successful/i.test(text),
        choices: [...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width>0 && /^(Replace|Import as Copy|Import)$/.test(e.textContent.trim())).map(e=>e.textContent.trim()) };
    })()`);
    console.log(JSON.stringify(result));
    assert.ok(result.collectionVisible, 'Imported collection not visible yet');
    fs.writeFileSync(path.join(__dirname, '../test-results/part3-desktop-import.json'), JSON.stringify({ ...result, requests: 51, examples: 51, importedAt: new Date().toISOString() }, null, 2));
  } finally { d.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
