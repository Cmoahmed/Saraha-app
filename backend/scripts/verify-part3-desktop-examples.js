const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { connect } = require('./postman-desktop');
const collection = JSON.parse(fs.readFileSync(path.join(__dirname, '../postman/Saraha_Course_Part3_Verified_Responses.postman_collection.json')));
const pause = () => new Promise(r => setTimeout(r, 90));
async function main() {
  const d = await connect();
  const checked = [];
  const action = async (name, expand) => d.evaluate(`(() => {
    const label = [...document.querySelectorAll('[data-testid="sidebar-row-name"]')].find(e=>e.textContent===${JSON.stringify(name)});
    if(!label) return false;
    const row=label.closest('[role="treeitem"]');
    const button=row.querySelector('button[aria-label="${expand ? 'Expand' : 'Collapse'}"]');
    button?.click();return true;
  })()`);
  try {
    await d.evaluate(`(() => {const e=document.querySelector('input[data-testid="aether-text-input"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(collection.info.name)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await new Promise(r=>setTimeout(r,500));
    assert.ok(await action(collection.info.name,true)); await pause();
    for(const folder of collection.item) {
      assert.ok(await action(folder.name,true), `Folder not visible: ${folder.name}`); await pause();
      for(const item of folder.item) {
        assert.ok(await action(item.name,true), `Request not visible: ${item.name}`); await pause();
        const visible = await d.evaluate(`(() => {
          const rows=[...document.querySelectorAll('[role="treeitem"][data-node-id]')];
          const index=rows.findIndex(r=>r.querySelector('[data-testid="sidebar-row-name"]')?.textContent===${JSON.stringify(item.name)});
          const next=rows[index+1];
          return {name:next?.querySelector('[data-testid="sidebar-row-name"]')?.textContent,level:next?.getAttribute('aria-level')};
        })()`);
        assert.equal(visible.level,'4', `Missing saved example under ${item.name}`);
        assert.equal(visible.name,item.response.at(-1).name);
        checked.push({request:item.name,savedExample:visible.name,status:item.response.at(-1).code});
        await action(item.name,false); await pause();
      }
      await action(folder.name,false); await pause();
    }
    assert.equal(checked.length,51);
    await action(collection.item[0].name,true); await pause();
    await action(collection.item[0].item[0].name,true); await pause();
    await d.evaluate(`(() => {const e=[...document.querySelectorAll('[data-testid="sidebar-row-name"]')].find(e=>e.textContent===${JSON.stringify(collection.item[0].item[0].response.at(-1).name)});e?.click();})()`);
    await new Promise(r=>setTimeout(r,600));
    fs.writeFileSync(path.join(__dirname,'../test-results/part3-desktop-examples.json'),JSON.stringify({collection:collection.info.name,verifiedAt:new Date().toISOString(),savedExamplesVerified:checked.length,checked},null,2));
    console.log(JSON.stringify({savedExamplesVerified:checked.length,collection:collection.info.name}));
  } finally { d.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
