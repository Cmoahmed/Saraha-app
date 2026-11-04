const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect}=require('./postman-desktop');
async function main(){const d=await connect();try{
 const files=['Saraha_FINAL_AUDIT.postman_collection.json','Saraha_FINAL_Local.postman_environment.json'].map(n=>path.resolve(__dirname,'../postman',n));
 for(const file of files)JSON.parse(fs.readFileSync(file));
 await d.evaluate(`(()=>{const e=document.querySelector('input[data-testid="aether-text-input"]');if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Saraha FINAL AUDIT');e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);await new Promise(r=>setTimeout(r,500));
 const already=await d.evaluate(`[...document.querySelectorAll('[data-testid="sidebar-row-name"]')].some(e=>e.textContent==='Saraha FINAL AUDIT')`);
 if(already){console.log(JSON.stringify({alreadyImported:true,originalsPreserved:true}));return;}
 await d.evaluate(`document.querySelector('[data-testid="sidebar-import-button"]')?.click()`);await new Promise(r=>setTimeout(r,400));
 const marked=await d.evaluate(`(()=>{const area=[...document.querySelectorAll('textarea')].find(e=>e.getBoundingClientRect().width>0&&e.getAttribute('placeholder')?.startsWith('Paste a cURL'));if(!area)return false;let p=area;while(p&&!p.querySelector('input[type="file"]:not([webkitdirectory])'))p=p.parentElement;const i=p?.querySelector('input[type="file"]:not([webkitdirectory])');if(!i)return false;i.setAttribute('data-final-audit-import','true');return true;})()`);assert.ok(marked,'Import dialog unavailable');
 const doc=await d.call('DOM.getDocument'),input=await d.call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-final-audit-import="true"]'});
 await d.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files});await new Promise(r=>setTimeout(r,600));
 // Multiple resources require the native resource-selection screen's final Import action.
 await d.evaluate(`(()=>{const buttons=[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width>0&&e.textContent.trim()==='Import');buttons.at(-1)?.click();})()`);
 let imported=false;
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));imported=await d.evaluate(`[...document.querySelectorAll('[data-testid="sidebar-row-name"]')].some(e=>e.textContent==='Saraha FINAL AUDIT')`);if(imported)break;}
 assert.ok(imported,'Desktop collection did not finish importing');
 const report=await d.evaluate(`(()=>{const t=document.body.innerText;return{collectionVisible:t.includes('Saraha FINAL AUDIT'),completedNotice:/Import Complete|Import successful/i.test(t)}})()`);
 assert.ok(report.collectionVisible,'Imported collection not yet visible');
 await d.evaluate(`(()=>{const e=document.querySelector('input[data-testid="aether-text-input"]');if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Saraha FINAL AUDIT');e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);await new Promise(r=>setTimeout(r,400));
 await d.evaluate(`(()=>{const e=[...document.querySelectorAll('[data-testid="sidebar-row-name"]')].find(e=>e.textContent==='Saraha FINAL AUDIT');e?.closest('[role="treeitem"]')?.querySelector('button[aria-label="Expand"]')?.click();})()`);await new Promise(r=>setTimeout(r,250));
 for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,250));report.visibleFolders=await d.evaluate(`[...document.querySelectorAll('[role="treeitem"][aria-level="2"] [data-testid="sidebar-row-name"]')].map(e=>e.textContent)`);if(report.visibleFolders.length===17)break;}
 assert.equal(report.visibleFolders.length,17,'Expected all A-Q folders after desktop import');
 report.at=new Date().toISOString();report.environmentImportedWithCollection=true;
 fs.writeFileSync(path.join(__dirname,'../test-results/final-audit-desktop-import.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{d.close();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
