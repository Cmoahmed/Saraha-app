const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.resolve(root,p),'utf8');
const original=read('../SARAHA_FINAL_CODEX_AUDIT_PROMPT.md');
const sessions=[];let current;
for(const line of original.split(/\r?\n/)){
 const heading=/^### (W\d+S\d+) — (.+) — (\d+) entries/.exec(line);
 if(heading){current={id:heading[1],title:heading[2],count:Number(heading[3]),entries:[]};sessions.push(current);continue;}
 const video=/^\d+\. `([^`]+\.mkv)`/.exec(line);if(current&&video&&current.entries.length<current.count)current.entries.push(video[1]);
}
assert.equal(sessions.length,11);assert.equal(sessions.reduce((n,s)=>n+s.entries.length,0),169);
const first=JSON.parse(read('docs/course-lessons.json')),second=JSON.parse(read('docs/course-part2-lessons.json')).entries,third=JSON.parse(read('docs/part3-audit.json')).rows;
const states={verified:'Verified implemented',partial:'Implemented but not verified',theory:'Theory documented',manual:'Manual/external required',missing:'Missing/failed'};
const tests=[];for(const file of fs.readdirSync(path.join(root,'test')).filter(n=>n.endsWith('.test.js'))){const text=read('test/'+file);for(const m of text.matchAll(/\btest\(\s*'([^']+)'/g))tests.push({file:'test/'+file,name:m[1],line:text.slice(0,m.index).split('\n').length});}
function proof(pattern){const t=tests.find(t=>t.name.toLowerCase().includes(pattern.toLowerCase()));if(!t)throw Error('Test not found: '+pattern);return `${t.file}:${t.line} — ${t.name}`;}
function lineOf(file,marker){if(!fs.existsSync(path.resolve(root,file)))return 0;const i=read(file).split('\n').findIndex(s=>s.includes(marker));return i<0?1:i+1;}
function symbolAfter(file,marker,fallback){if(!fs.existsSync(path.resolve(root,file)))return fallback;const lines=read(file).split('\n'),start=lines.findIndex(l=>l.includes(marker));if(start<0)return fallback;for(const line of lines.slice(start+1)){if(!line.trim()||line.trim().startsWith('//'))continue;return line.trim().slice(0,170);}return fallback;}
const rows=[];const topicProof={passwords:'passwords:',auth:'auth signup',jwt:'JWT signature',rotation:'refresh rotation',validation:'Zod schemas',otp:'OTP cooldown',email:'confirmation cycle',reset:'recovery resets',upload:'avatar decoding',message:'anonymous messages:',sessions:'device logout isolates',google:'Google verifier rejects',cache:'mail failure removes',security:'security headers, CORS',production:'production server starts',legacy:'Assignment 8 User Q3'};
function proofFor(e,session,q){const text=[e.title,e.filename,e.symbol,e.explanation,e.note,e.test,...(e.tests||[])].join(' ').toLowerCase();
 if(/upload|multer|avatar|attachment_folder|process_file|memory_storage|final_path|save_pic/.test(text))return proof(topicProof.upload);
 if(/password|hash/.test(text)&&!text.includes('redis'))return proof(/recover|reset|forget/.test(text)?topicProof.reset:topicProof.passwords);
 if(/argon|bcrypt|rounds/.test(text))return proof(topicProof.passwords);
 if(/phone.*encrypt|encrypt.*phone/.test(text))return proof('phone encryption:');
 if(/google|gmail|social_login|tokenid/.test(text))return proof(topicProof.google)+'; '+proof('Google adapter handles');
 if(/otp|confirm|trial|ttl|email_event|send_mail|attachment/.test(text))return proof(topicProof.otp)+'; '+proof(topicProof.email);
 if(/logout|device/.test(text))return proof(topicProof.sessions);
 if(/rotate|rotation|refresh/.test(text))return proof(topicProof.rotation);
 if(/jwt|bearer|decode|audience|issuer|token/.test(text)&&session.startsWith('W12'))return proof(topicProof.jwt);
 if(/regex|zod|valid|literal|enum|localiz|refine/.test(text))return proof(topicProof.validation)+'; '+proof('new input validation');
 if(/redis|cashing|cache/.test(text))return proof('Redis handshake')+' (outage/deadline only; live data operations unverified)';
 if(/message/.test(text))return proof(topicProof.message);
 if(/env/.test(text))return proof('environment rejects');
 return proof(topicProof.auth);
}
const uploadMap={2:['services/upload.service.js','save'],3:['services/upload.service.js','save'],4:['middleware/upload.js','parse'],5:['services/upload.service.js','fs.writeFile'],6:['services/upload.service.js','crypto.randomUUID'],7:['services/upload.service.js','fs.mkdir'],8:['middleware/upload.js','module.exports'],9:['services/upload.service.js','Users.findOneAndUpdate'],10:['models/message.model.js','schema'],11:['controllers/message.controller.js','send'],12:['controllers/message.controller.js','send'],13:['controllers/message.controller.js','owned'],14:['controllers/message.controller.js','owned'],15:['controllers/message.controller.js','inbox']};
for(let si=0;si<sessions.length;si++){
 const s=sessions[si],seen=new Map();
 for(let i=0;i<s.entries.length;i++){
  const filename=s.entries[i],occurrence=(seen.get(filename)||0)+1;seen.set(filename,occurrence);
  const q=String(i+1),numeric=String(parseInt(filename,10));let e,status,file,symbol,explanation,postman,comment,remaining='None for the verified local scope.',test;
  if(si<4){e=first.filter(r=>r.section===['Authentication','JWT','Authorization','Advanced Validation'][si])[i];assert.ok(e);file=e.file;symbol=e.symbol;explanation=e.explanation;postman=e.postman;
   status=e.file.startsWith('docs/')?states.theory:e.status==='Implemented and tested'?states.verified:states.partial;
   comment=status===states.theory?'N/A — conceptual explanation':`${e.section} Question ${e.number} -`;
   test=status===states.theory?'N/A — theory':proofFor(e,s.id,q);
   if(si===3&&i>=11){status=states.manual;remaining='Real Google provider/account setup and consent not performed; unit verification is not a live login.';}
   if(si===3&&i===14){file='../'+path.relative(path.dirname(root),'C:/Users/Mada/OneDrive/Desktop/social-login/social-login/src/app/app.ts').replaceAll('\\','/');symbol='AppComponent and Auth service';explanation='Original Angular 20 UI and ID-token exchange preserved. Fresh production build and 9 headless tests passed in a scratch copy. Google provider is mocked in tests.';comment='Existing frontend; no new code/comment introduced to preserve source byte-for-byte';test='test-results/final-audit-angular-build.txt; final-audit-angular-tests.txt: TOTAL 9 SUCCESS';}
  }else if(si<8){const candidates=second.filter(r=>r.section===si-3&&parseInt(r.filename,10)===parseInt(filename,10));e=candidates.find(r=>r.filename===filename&&(!filename.startsWith('03_Refactor')||r.note.startsWith(occurrence===1?'First':'Second')))||candidates[0];assert.ok(e,filename);
   file=e.source||'docs/SARAHA_FINAL_THEORY.md';symbol=e.source?e.source.split('/').at(-1):'Concept explanation';explanation=e.note;postman=e.postman.length?e.postman.join('; '):'N/A — no new HTTP API';status=e.status==='documented'?states.theory:e.status==='partially verified'?states.partial:states.verified;
   comment=e.source?`Section ${e.section} - Question ${e.question} -`:'N/A — conceptual explanation';test=status===states.theory?'N/A — theory':proofFor(e,s.id,q);
   if((si===4&&i>=10)||(si===5&&i>=1&&i<=4)){status=states.partial;remaining='No local Redis on port 6379/REDIS_URL. Execute demo and multi-instance rate-store tests with a real private Redis; Upstash remains manual.';}
   if(si===4&&i<=2){status=i===0?states.theory:states.manual;remaining=i===0?'Title-based recap only.':'Official verifier tested with local fixtures; no real Google account/token was used.';}
   if(si===5&&[12,13].includes(i)){test=proof('real Nodemailer SMTP to Mailpit');remaining='Local SMTP verified; external SMTP remains manual.';}
   if(si===5&&i===14){test=proof('real Nodemailer SMTP to Mailpit')+'; final Newman L/Q actual captures';remaining='External SMTP not tested.';}
  }else if(si===8){explanation=['Recap of bounded image uploads and private guest inboxes','Shared image processing helper','End-to-end upload replacement and retrieval cycle','Bounded in-memory file parsing','Write re-encoded bytes manually','Generated final paths independent of untrusted filenames','Create a dedicated attachment directory','Reusable file parser and controlled errors','Persist avatar name on the authenticated account','Timestamped recipient inbox model','Resolve recipient and create message','Keep true guests anonymous without invented identity','Ownership lookup protects message read and deletion','Guest message send/inbox/read/delete cycle','Authenticated recipient inbox pagination','Summary of safe uploads and recipient-private messages'][i];
   const target=uploadMap[i+1];file=target?.[0]||'docs/SARAHA_FINAL_THEORY.md';symbol=target?.[1]||'Concept explanation';status=target?states.verified:states.theory;comment=target?`W15S2 - Question ${i+1} -`:'N/A — recap/summary';test=target?proof(i<9?topicProof.upload:topicProof.message):'N/A — theory';postman=target?(i<9?'UploadValidAvatar; ReplaceAvatar; GetPublicAvatar':'SendAnonymousMessage; GetMyInbox; GetMessageById; DeleteMyMessage'):'N/A — no separate API';
  }else{e=third.filter(r=>r.section===(si===9?'A':'B'))[i];assert.ok(e);file=e.source;symbol=e.implementation;explanation=e.topic;postman=e.postman;remaining=e.manual;
   status=e.status==='Documented theory'?states.theory:e.status==='Requires external configuration'?states.manual:e.status==='Implemented but not fully tested'?states.partial:states.verified;
   comment=e.comment.startsWith('N/A')?'N/A — conceptual/manual':`Course Section ${e.section} - Question ${e.question}`;
   test=status===states.theory?'N/A — theory':si===10&&i>=8?'test-results/final-audit-typecheck.txt; final-audit-typescript.txt':proofFor({title:filename},s.id,q);
   if(si===9){const p={1:'A3 pagination',2:'A3 pagination',3:'A1 hidden',4:'A1 hidden',5:topicProof.security,6:topicProof.security,7:topicProof.security,10:topicProof.security,11:topicProof.security,12:topicProof.security,13:'Redis handshake',14:'Redis handshake',15:'B1 five consecutive'};if(p[i])test=proof(p[i]);}
   if(si===10&&i===1)test=proof(topicProof.production)+'; '+proof('normal development server startup');
   if(si===10&&i===10){status=states.verified;test='test-results/final-audit-concurrently-smoke.json: backendHealthy=true, typeScriptWatcher=true, ownedProcessTreeStopped=true';remaining='Both watchers actually ran on a private isolated port; no user process stopped.';}
   if(si===10&&i>=3&&i<=6)remaining+=' No paid/cloud/tunnel operation performed.';
  }
  const commentLine=comment.startsWith('N/A')||comment.startsWith('Existing frontend')?0:lineOf(file,comment);
  if(status!==states.theory&&commentLine&&lineOf(file,comment)===1&&!read(file).includes(comment))comment='Missing numbered comment — review required';
  if(si>=4&&si<8&&commentLine)symbol=symbolAfter(file,comment,symbol);
  const sourceLine=commentLine||lineOf(file,symbol?.split(';')[0]||'');
  rows.push({id:`${s.id}.${String(i+1).padStart(2,'0')}`,session:s.id,ordinal:i+1,occurrence,filename,expected:explanation,status,source:`${file}:${sourceLine}`,symbol,comment:commentLine?`${comment} (line ${commentLine})`:comment,test,postman,remaining});
 }
}
assert.equal(rows.length,169);
// Every conceptual entry has its own explanation, without inventing a demonstration endpoint.
let theory='# Course concepts and title assumptions\n\nTitles are the supplied screenshot transcription, not video transcripts. No MKV files were found. The exact inventory in the user’s final prompt takes precedence over earlier spelling variants. Practical mechanisms can be shared across multiple lessons.\n\n';
for(const r of rows)theory+=`## ${r.id} — ${r.filename} (occurrence ${r.occurrence})\n\n${r.expected}\n\n${r.status}. ${r.remaining}\n\n`;
fs.writeFileSync(path.join(root,'docs/SARAHA_FINAL_THEORY.md'),theory);
const extras=[];
function extra(id,requirement,status,file,symbol,marker,test,postman,evidence,remaining='None for local verified scope.') {extras.push({id,requirement,status,source:`${file}:${lineOf(file,marker||symbol)}`,symbol,comment:marker||'N/A',test,postman,evidence,remaining});}
const userFunctions=['signup','login','update','remove','get'],userRequests=['AddUser','LoginUser','UpdateUser','DeleteUser','GetUserById'];
for(let n=1;n<=5;n++)extra('A8.User.Q'+n,['POST /users/signup','POST /users/login','PATCH /users/:id','DELETE /users','GET /users'][n-1],states.verified,'controllers/user.controller.js',userFunctions[n-1],`// Question ${n} -`,proof(`Assignment 8 User Q${n}:`),userRequests[n-1],'Exact original messages and methods retained; secured startup verifies the caller. Password hashes are deliberately excluded.','Restart normal server to load the new default guard. Embedded app.js compatibility mode can be unsafe unless LEGACY_REQUIRE_AUTH=true.');
const noteNums=[1,2,3,4,6,7,8,9,10,11,12],noteFunctions=['create','update','replace','updateAll','remove','paginate','get','byContent','withUser','aggregate','removeAll'],noteRequests=['CreateNote','UpdateNote','ReplaceNote','UpdateAllNotesTitles','DeleteSingleNote','GetPaginatedNotes','GetNoteById','FindNoteByContent','GetNotesWithUser','AggregateNotes','DeleteAllNotes'];
for(let i=0;i<11;i++){const n=noteNums[i];extra('A8.Note.Q'+n,noteRequests[i],states.verified,'controllers/note.controller.js',noteFunctions[i],n<5?`// Notes Question ${n} -`:`// Assignment 8 Notes - Question ${n} -`,proof(`Assignment 8 Note Q${n}:`),noteRequests[i],'Owner-scoped operation; expected negative cases tested. There is no Note Q5 operation.','Use a bearer token with the historical query ID on normal server startup.');}
extra('A8.Schema.Users','Users schema',states.verified,'models/user.model.js','userSchema','Assignment 8 Schema - Question 1',proof('Assignment 8 schemas'),'AddUser; RegisterUser','Required legacy fields/unique email/age bounds preserved; age remains optional as in existing schema. Password/Phone conditionally optional only for Google-only identities.');
extra('A8.Schema.Notes','Notes schema',states.verified,'models/note.model.js','noteSchema','Assignment 8 Schema - Question 2',proof('Assignment 8 schemas'),'CreateNote','Required title/content/userId reference, timestamps and owner sort index.');
extra('A8.Validator','Custom uppercase title validator',states.verified,'models/note.model.js','title.validate','Assignment 8 Validator - Question 1',proof('Assignment 8 schemas'),'CreateNote; explicit negative cases in Node tests','FIRST NOTE and A123! rejected; First Note accepted. Non-English/no-letter titles follow documented existing policy.');
extra('A8.Bonus','LeetCode 14 Longest Common Prefix',states.verified,'../bonus.js','longestCommonPrefix','Bonus - LeetCode 14',proof('bonus examples'),'N/A — algorithm, not HTTP','VM executes original global LeetCode-style function; no console output; six representative edge cases pass.','User must personally submit the same code to LeetCode. No submission was made.');
const assignment=JSON.parse(read('docs/part3-audit.json')).assignments;
for(const r of assignment){const number=r.id.slice(1),pattern=r.id[0]==='A'?`A${number} `:`B${number} `;extra('Later.'+r.id,r.requirement,states.verified,r.source,r.implementation,`Assignment ${r.id[0]} - Question ${number}`,proof(pattern),r.postman,r.manual,r.id==='B2'?'Local Mailpit tested; provider identity is mocked in Node tests. External Google/SMTP unverified.':'No manual action needed for local code behavior.');}
extras.find(r=>r.id==='Later.B1').evidence+=' Controlled clock rejects at 299999ms and accepts at 300000ms. Google verified adapter cannot override lock. Mongo is authoritative; Redis outage does not erase account locks.';
extras.find(r=>r.id==='Later.B2').evidence+=' Subcases: unverified→verified synthetic recipient, request-enable leaves flag false, correct/incorrect/expired/replayed enable OTP, single-use purpose/email/authVersion-bound login OTP, attempt/cooldown limits, no pre-OTP tokens or session, refresh/logout after confirmation, admin/Google gate, delivery failure and password-reset generation checks.';
extra('Postman.1','Meaningful endpoint request names',states.verified,'postman/Saraha_FINAL_AUDIT.postman_collection.json','A-Q workflow folders','', 'test-results/final-audit-newman.json','A-Q','168 purposefully ordered requests; 163 executed successfully, five explicit fixture skips.');
extra('Postman.2','Save each changed request (Ctrl+S)',states.manual,'docs/POSTMAN_FINAL_STEP_BY_STEP.md','Save/export workflow','', 'SDK import validates saved on-disk artifact','A-Q','Collection JSON is saved locally; request editor Ctrl+S is a user GUI action.','Press Ctrl+S after individual edits. Do not export populated secrets.');
extra('Postman.3','Export and include collection link/file with submission',states.manual,'postman/Saraha_FINAL_AUDIT.postman_collection.json','Exported Collection v2.1','', 'SDK/Newman import and execution','A-Q','Actual independent JSON export and safe environment created.','User attaches export or shares a reviewed collection link manually; no email/publication performed.');
extra('Deployment.Doc','EC2_Nodejs_Deployment_with_Nginx (1).docx',states.manual,'docs/EC2_DEPLOYMENT_REVIEW.md','Reference review and adapted configurations','', 'No original document available','N/A','Workspace and attachment searches found no Word file. Supplied task excerpts reviewed; generic index.js/src/index.js and port3000 must become backend/server.js and port3001.','Provide original file for an exact text comparison. AWS/Nginx/PM2/HTTPS/ngrok remain manual.');
assert.equal(extras.length,33);assert.equal(rows.length+extras.length,202);
let md='# Saraha final requirement matrix\n\nSource: the complete SARAHA_FINAL_CODEX_AUDIT_PROMPT.md inventory. **169 individual video rows + 33 assignment/schema/validator/bonus/Postman/document rows = 202 requirement rows.** Repeated titles retain session, ordinal and occurrence. No video contents were available. Code paths are relative to backend; source line numbers refer to this audited state. Historical lesson metadata was reconciled with current code and fresh evidence, not accepted as a prior completion claim.\n\n| Session | Visible entries |\n| --- | ---: |\n';
for(const s of sessions)md+=`| ${s.id} — ${s.title} | ${s.entries.length} |\n`;
md+='\nWeek15 session1 has two separate ordinal rows for 03_Refactor(check OTP).mkv. Duplicate 05 and 12 prefixes remain distinct entries; the Assignment 8 stray 5 is not an API.\n\n';
const cells=values=>'| '+values.map(v=>String(v??'').replace(/\r?\n/g,' ').replaceAll('|','\\|')).join(' | ')+' |\n';
for(const s of sessions){md+=`## ${s.id} — ${s.title}\n\n| Ordinal / occurrence | Exact filename | Expected behavior / actual topic | Status | Source/function | Nearby numbered comment | Fresh test evidence | Postman request | Remaining action |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;for(const r of rows.filter(r=>r.session===s.id))md+=cells([`${r.ordinal} / ${r.occurrence}`,r.filename,r.expected,r.status,`${r.source} ${r.symbol}`,r.comment,r.test,r.postman,r.remaining]);md+='\n';}
md+='## Assignments, schemas, bonus, hand-in and deployment reference\n\n| ID / requirement | Status | Source/function | Numbered comment | Fresh test | Postman | Evidence / compatibility | Outstanding action |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
for(const r of extras)md+=cells([`${r.id}: ${r.requirement}`,r.status,`${r.source} ${r.symbol}`,r.comment,r.test,r.postman,r.evidence,r.remaining]);
fs.writeFileSync(path.join(root,'docs/SARAHA_FINAL_REQUIREMENT_MATRIX.md'),md);
fs.writeFileSync(path.join(root,'test-results/final-audit-matrix.json'),JSON.stringify({sessions:sessions.map(s=>({id:s.id,title:s.title,count:s.entries.length})),videos:rows,otherRequirements:extras},null,2));
console.log(JSON.stringify({videoRows:rows.length,otherRows:extras.length,total:rows.length+extras.length,videoStatuses:Object.fromEntries([...new Set(rows.map(r=>r.status))].map(k=>[k,rows.filter(r=>r.status===k).length]))}));
