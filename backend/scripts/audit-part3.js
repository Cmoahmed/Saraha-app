const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const rows = [];
function row(section, question, filename, topic, status, source, implementation, test, postman, manual, conceptual = false) {
  const marker = `Course Section ${section} - Question ${question}`;
  const comment = conceptual ? 'N/A: theory or external manual exercise; no artificial implementation' : fs.readFileSync(path.join(root, source), 'utf8').includes(marker) ? `${marker} verified` : 'MISSING';
  rows.push({ section, question, filename, topic, status, source, implementation, comment, test, postman, manual });
}
const tested = 'Implemented and tested', theory = 'Documented theory', external = 'Requires external configuration', partial = 'Implemented but not fully tested';
const api = 'test/part3.test.js', security = 'test/security.test.js';
row('A','1','01_Intro_Recap_Session_Flow.mkv','Request lifecycle: middleware, validation/authentication, controller, Mongoose and errors',theory,'app.js','Express app; EC2_DEPLOYMENT_REVIEW.md lifecycle',security,'N01 / N09','No transcript supplied; interpretation based on title.',true);
row('A','2','02_Pagination.mkv','Bounded, stable database pagination and metadata',tested,'controllers/identity.controller.js','page; existing inbox metadata and legacy Notes preserved',`${api}: A3/A7; ${security}: anonymous messages; test/api.test.js: pagination`,'N08, O04, O15','None for tested local endpoints.');
row('A','3','03_Filter_Type.mkv','Allowlisted read/status filters retain ownership',tested,'controllers/identity.controller.js','list; message inbox isRead',`${api}: A3; ${security}: anonymous messages`,'N07, N08, O04','No invented type taxonomy.');
row('A','4','04_Send_Message_Validation.mkv','Strict content/recipient validation; no forged sender identities',tested,'routes/identity.routes.js','s.send, s.recipient, authenticate',`${api}: A1/A6; ${security}: anonymous messages`,'O01, O18','None.');
row('A','5A','05_All_APIs_Validation.mkv','Body/params/query validation across auth, Notes, messages, identity, OTP and uploads',tested,'routes/identity.routes.js','New strict Zod schemas reuse existing validators; retained legacy contracts','test/api.test.js; test/security.test.js; test/part2.test.js; test/part3.test.js','N06/N07, O18, Q06/Q10','No claim of a formal exhaustive proof; route inventory saved.');
row('A','5B','05_Helmet.mkv','HTTP security headers, frame/content restrictions and environment HSTS',tested,'app.js','helmet; public avatar CORP override retained',`${api}: security headers; test/part2.test.js: avatars`,'N01','Validate final HTTPS/CSP against deployed browser and Google UI.');
row('A','6','06_Cors.mkv','Exact configured origin allowlist and preflight',tested,'app.js','cors origin callback; config/env.js validates origins',`${api}: security headers/CORS`,'Manual Origin header on N01; browser preflight tested by API suite','Set actual production frontend origins.');
row('A','7','07_Router_Options.mkv','Default case-insensitive/non-strict routing; mergeParams false for flat routes',tested,'routes/identity.routes.js','Router({mergeParams:false})',`${api}: uppercase/trailing-slash identity request route`,'O04','No parent route params to merge; defaults preserve compatibility.');
row('A','8','08_What_Is_RateLimiter.mkv','HTTP counters, windows, 429, rate headers and Retry-After',theory,'middleware/course-rate-limit.js','limiter; security explanation below',`${api}: threshold test; ${security}: login threshold`,'N/O/Q traffic policies','Theory covered; no video transcript supplied.',true);
row('A','9','09_Why_RateLimiter.mkv','Brute-force, OTP/spam/query cost controls; independent account lockout',theory,'middleware/course-rate-limit.js','limiter and Mongo account counter',`${api}: B1/security; ${security}: threshold`,'P01-P07','Layered mitigation does not guarantee protection against distributed denial of service.',true);
row('A','10','10_RateLimiter_Options.mkv','Endpoint windows, limits, modern headers, explicit proxy trust',tested,'middleware/course-rate-limit.js','limiter; app.set trust proxy',`${api}: threshold, Retry-After and proxy; ${security}: threshold`,'P01-P07; manual repeated requests for generic HTTP 429','Production loopback trust needs matching proxy configuration.');
row('A','11','11_Key_Generator.mkv','SHA-256 keys of verified account IDs or normalized IPv6-aware client IP',tested,'middleware/course-rate-limit.js','key; ipKeyGenerator',`${api}: key isolation and spoofed forwarded header`,'Protected hidden-send traffic; no raw email in Redis keys','Auth HTTP throttle is IP-based; account-specific Mongo lockout is separate.');
row('A','12','12_Limit_User_Location.mkv','Interpreted as trustworthy IP-based limiting, not geographic tracking',tested,'middleware/course-rate-limit.js','key and limiter; app trust proxy',`${api}: proxy/key tests`,'N/O/Q policies','Title ambiguous; no geographic restriction introduced.');
row('A','13','13_Use_Redis.mkv','Atomic Redis EVAL counter with expiry, namespace and fail-closed outages',partial,'middleware/course-rate-limit.js','RedisStore uses existing redis.service.connect',`${api}: missing-Redis rejection; test/email-timeout.test.js: Redis deadlines`,'Auth/hidden sends when REDIS_URL is configured','Live Redis server and multi-process Lua enforcement not tested: local 6379 unavailable.');
row('A','14','14_Another_Options.mkv','One-process MemoryStore versus shared Redis; no outage bypass',partial,'middleware/course-rate-limit.js','limiter selects memory only when REDIS_URL absent',`${api}: memory threshold and Redis missing rejection`,'N/O/Q','Configure and verify real Redis before multi-instance deployment.');
row('A','15','15_Refactor_And_Apply_Login_Attemps.mkv','Shared password login service and exact account lockout independent of HTTP throttle',tested,'services/auth.service.js','login; legacy user login delegates',`${api}: B1 including concurrent requests and exact clock boundary`,'P01-P07','None for local behavior.');
row('A','16','16_Summery.mkv','Security lesson evidence summary',theory,'docs/COURSE_PART3_CHECKLIST.md','This checklist and PART3_TEST_RESULTS.md','Audit script verifies 17 distinct Section A rows','N-Q','Screenshot spelling Summery retained, despite Summary in the pasted prose.',true);
row('B','1','01_Recap_Session_Flow.mkv','Startup/environment/database flow; development versus production',theory,'server.js','start; lifecycle in EC2_DEPLOYMENT_REVIEW.md',`${api}: production startup smoke`,'N01/N09','Linux process lifecycle still requires host testing.',true);
row('B','2','02_Prepare_Code.mkv','Private binding, readiness, request deadlines, shutdown and deployment preparation',tested,'server.js','start; app /ready; config validation',`${api}: production startup smoke; ${security}: production legacy routes`,'N01/N09','Linux graceful drain/reboot and persistent services still require validation.');
row('B','3','03_Github.mkv','Git exclusions and safe private remote/SSH workflow',theory,'../.gitignore','Secret/dependency/backup exclusions; manual Git commands','Audit preservation hashes; git reported no repository','N/A','Initialize/review/commit manually; no remote or push performed.');
row('B','4','04_Launch_Instance.mkv','Ubuntu EC2 selection, billing, keys, private services and security groups',external,'docs/EC2_DEPLOYMENT_REVIEW.md','Manual EC2 runbook','Not executed','N/A','User account, billing choices, instance, key and trusted-IP rules required.',true);
row('B','5','05_Setup_Server.mkv','Ubuntu runtime/dependencies/env, actual entry point and PM2 restart configuration',external,'deploy/ecosystem.config.cjs','PM2 config and manual setup runbook','node --check deploy/ecosystem.config.cjs; production startup smoke','N01/N09 after deployment','Install/validate PM2, production services and reboot on Ubuntu.');
row('B','6','06_NginX.mkv','Private upstream reverse proxy and explicit trusted headers',external,'deploy/saraha.nginx.conf','HTTP bootstrap server configuration','Nginx executable unavailable; syntax/runtime not tested','N01/N09 after deployment','Set domain, install/test Nginx, configure certificate and HTTPS.');
row('B','7','07_ngrok.mkv','Temporary authorized HTTPS tunnel and private token setup',external,'docs/EC2_DEPLOYMENT_REVIEW.md','Manual ngrok runbook with official source','No tunnel started','N/A','User must authorize exposure and configure ngrok; use sanitized data.',true);
row('B','8','08_What_TS.mkv','Static type checking versus runtime JavaScript and Zod',theory,'docs/TYPESCRIPT_PART3_GUIDE.md','TypeScript conceptual explanation','typecheck and compiled example executed','N/A','Existing backend remains JavaScript.',true);
row('B','9','09_How_to_Use_TS.mkv','Isolated incremental TypeScript learning module',tested,'learning/src/messages.ts','PublicUser/Message/summarize','npm.cmd run typecheck; npm.cmd run demo:learning','N/A','None.');
row('B','10','10_How_To_Run_TS_And_TS_Types.mkv','Compilation, functions, primitive/optional/union types',tested,'learning/src/messages.ts','summarize and primitive fields','typecheck and executed compiled output','N/A','None.');
row('B','11','11_Concurrently.mkv','Concurrent backend watcher and TypeScript watcher',partial,'scripts/dev-course.js','concurrently; npm.cmd run dev:course','node scripts/dev-course.js --check','N/A','Interactive watcher co-execution/termination not tested; stop other backend first.');
row('B','12','12_Ts_Config.mkv','Strict compiler settings with input/output separation',tested,'learning/tsconfig.json','compilerOptions rootDir/outDir/noEmitOnError','TypeScript typecheck/build and output inspection','N/A','Generated dist excluded by Git.');
row('B','13','13_Object_And_Array.mkv','Typed user/message objects and arrays',tested,'learning/src/messages.ts','sender and messages','typecheck and compiled example output','N/A','None.');
row('B','14','14_TS_Data_AnnotationType.mkv','Explicit/inferred types, interfaces, aliases and functions',tested,'learning/src/messages.ts','RequestStatus, PublicUser, Message, summarize','typecheck and compiled example output','N/A','Compile-time types do not replace API input validation.');
row('B','15','15_Summary.mkv','Deployment limitations and TypeScript learning summary',theory,'docs/TYPESCRIPT_PART3_GUIDE.md','Guide plus checklist','Audit verifies 15 distinct Section B rows','N/A','Deployment remains manual; no full backend migration.',true);

const assignments = [
  ['A1','Send Anonymous Message','controllers/identity.controller.js','send; models/message.model.js private senderId','A1 hidden sender','O01/O07/O18','Registered hidden identity implemented; guest route retained.'],
  ['A2','Request Sender Identity','controllers/identity.controller.js','request; models/identity-request.model.js unique messageId','A2 ownership/pending/guest','O02/O08','Only recipient may request; one request per message.'],
  ['A3','Get Requests','controllers/identity.controller.js','list and page; sender-scoped status filter','A3 pagination/filter/ownership','O04','Only original sender lists incoming requests.'],
  ['A4','Accept or Reject Request','controllers/identity.controller.js','decide and disclosure; atomic pending transition','A4 rejection/concurrent acceptance/disclosure','O05/O06/O09/O10/O11','Only requester receives limited public identity after acceptance.'],
  ['A5','Create Conversation','controllers/identity.controller.js','create; unique requestId; participant filter','A5 concurrency/relationships; A4 preacceptance rejection','O03/O12','Explicit creation after acceptance; idempotent retries.'],
  ['A6','Send Messages','controllers/identity.controller.js','sendChat and member; ConversationMessage','A6 both participants/admin outsider/forged sender','O13/O14/O17','No admin membership exception.'],
  ['A7','Get Conversation Messages','controllers/identity.controller.js','getChat/member/page; deterministic createdAt/_id','A7 both participants/pagination/admin outsider','O15/O16','Newest first; ownership before query.'],
  ['B1','Login (Account Ban on Failed Attempts)','services/auth.service.js','login; Users.failedLoginAttempts/lockUntil; legacy delegation','B1 sequential/concurrent/isolation/legacy; exact fake-clock 299999/300000 boundary','P01-P07','Five consecutive failures lock for 300000ms; no extension; success resets; expiry resets sequence. No five-minute wall-clock wait.'],
  ['B2','2-step-verification','controllers/two-factor.controller.js','requestEnable/confirmEnable/beginLogin/confirmLogin; OTP service; auth/Google/legacy gates','B2 verified email/expiry/replay/attempts/no tokens/SMTP failure/Mailpit/version/Google admin','Q01-Q13','Actual Nodemailer and Mailpit capture tested. Live Google provider and external SMTP not tested; Google adapter is mocked.']
].map(([id, requirement, source, implementation, test, postman, manual]) => {
  const marker = `Assignment ${id[0]} - Question ${id.slice(1)}`;
  return { id, requirement, status: tested, source, implementation, comment: fs.readFileSync(path.join(root, source),'utf8').includes(marker) ? `${marker} verified` : 'MISSING', test: `${api}: ${test}`, postman, manual };
});
if (rows.length !== 32 || rows.filter(r=>r.section==='A').length !== 17 || rows.filter(r=>r.section==='B').length !== 15 || assignments.length !== 9) throw new Error('Audit row counts mismatch');
if ([...rows,...assignments].some(r=>r.comment==='MISSING')) throw new Error('Missing required numbered implementation comment');
for (const r of rows) if (!fs.existsSync(path.join(root,r.source)) && r.source !== 'docs/COURSE_PART3_CHECKLIST.md') throw new Error(`Missing source: ${r.source}`);
let checklist = '# Course Part 3 independent final audit\n\nAudit date: 4 November 2026 (Africa/Cairo). All four supplied screenshots were reviewed. Filenames below follow the screenshots, including duplicate 05 entries and 16_Summery.mkv. Titles establish topics, not access to video contents. The original EC2 Word document was not supplied locally; document-content verification remains blocked.\n\nPaths are relative to backend unless prefixed ../. A numbered comment is verified by reading its source file; theory/external-only work has an explicit N/A instead of an empty function. Test names refer to executed suites in PART3_TEST_RESULTS.md, not hypothetical examples.\n\n';
checklist += '| Section/question | Exact original filename | Actual topic | Status | Source / implementation | Numbered question comment | Automated evidence | Postman | Remaining action / limitation |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
for (const r of rows) checklist += `| ${r.section}${r.question} | ${r.filename} | ${r.topic} | ${r.status} | ${r.source}: ${r.implementation} | ${r.comment} | ${r.test} | ${r.postman} | ${r.manual} |\n`;
checklist += '\nThe assignment screenshot repeats 4/5 for its last two entries. The seven distinct functional topics are consistently numbered A1-A7 in code.\n\n| Requirement | Status | Working code | Numbered comment | Positive/negative test evidence | Postman | Scope / remaining action |\n| --- | --- | --- | --- | --- | --- | --- |\n';
for (const r of assignments) checklist += `| ${r.id}: ${r.requirement} | ${r.status} | ${r.source}: ${r.implementation} | ${r.comment} | ${r.test} | ${r.postman} | ${r.manual} |\n`;
checklist += '\nRate limiting uses counters within fixed time windows; limits produce HTTP 429, RateLimit and Retry-After headers. Password login needs both IP traffic limiting and persistent per-account lockout. OTP generation/verification and hidden messaging have separate policies. These controls bound abuse and database cost but do not replace authentication, participant authorization or upstream denial-of-service protection. Health checks are outside the limiters. With no REDIS_URL, HTTP counters are process-local and reset on restart; account lockout remains persistent in MongoDB. Configured Redis failures are errors, never a silent protection bypass. No geographic information is collected.\n\nEC2 Word document status: Blocked (file unavailable). Safe deployment guidance/configuration was prepared from the supplied task topics and official sources; no claim is made about the missing document’s actual wording.\n';
fs.writeFileSync(path.join(root,'docs/COURSE_PART3_CHECKLIST.md'),checklist);
fs.writeFileSync(path.join(root,'docs/part3-audit.json'),JSON.stringify({ rows, assignments },null,2)+'\n');

// Preserve old tests, exports and comments: compare with the source checkpoint made before edits.
const workspace = path.dirname(root);
const checkpoint = path.join(workspace,'part3-source-checkpoint-20261104-155155');
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const changed = [], added = [], preserved = [];
function walk(dir, relative='') {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const rel=path.join(relative,entry.name);
    if (entry.isDirectory()) { if(!['node_modules','.npm-cache','uploads','test-results','dist'].includes(entry.name)) walk(path.join(dir,entry.name),rel); }
    else if(entry.name!=='.env') {
      const old=path.join(checkpoint,rel), current=path.join(root,rel);
      if(!fs.existsSync(old)) added.push(rel); else if(digest(old)!==digest(current)) changed.push(rel); else preserved.push(rel);
    }
  }
}
walk(root);
const originalTests = preserved.filter(p=>p.startsWith('test'+path.sep));
const originalCollections = preserved.filter(p=>p.startsWith('postman'+path.sep) && /\.json$/.test(p));
const preservation={ checkpoint, changed, added, originalTestsUnchanged: originalTests, originalPostmanJsonUnchanged: originalCollections };
fs.writeFileSync(path.join(root,'test-results/part3-preservation.json'),JSON.stringify(preservation,null,2));
console.log(JSON.stringify({videoRows:rows.length,assignmentRows:assignments.length,comments:'verified',originalTestsUnchanged:originalTests.length,originalPostmanJsonUnchanged:originalCollections.length}));
