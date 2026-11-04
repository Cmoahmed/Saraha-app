const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const collection = { info: { name: 'Saraha Course Part 3', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Standalone N-Q. Creates synthetic users. Local Mailpit required for Q. P locks only its generated account. Never run against production.' },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:3001' }, { key: 'mailpitUrl', value: 'http://127.0.0.1:8025' }],
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    "if (!pm.collectionVariables.get('runId')) { pm.collectionVariables.set('runId', pm.variables.replaceIn('{{$guid}}').replace(/-/g,'')); pm.collectionVariables.set('part3Password', pm.variables.replaceIn('{{$guid}}')); }"
  ] } }], item: [] };
let folder;
function group(name) { folder = { name, item: [] }; collection.item.push(folder); }
function req(name, method, url, user, body, status, extra = [], description = '') {
  folder.item.push({ name, request: { method, url: url.startsWith('http') || url.startsWith('{{mailpitUrl}}') ? url : '{{baseUrl}}' + url,
    header: [{ key: 'Content-Type', value: 'application/json' }],
    auth: user ? { type: 'bearer', bearer: [{ key: 'token', value: `{{${user}Token}}`, type: 'string' }] } : { type: 'noauth' },
    ...(body === undefined ? {} : { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } }), description },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: [`pm.test('HTTP ${status}',()=>pm.response.to.have.status(${status}));`, 'var p3Data=pm.response.json();', ...extra.map(s => s.replace(/\bdata\b/g, 'p3Data'))] } }] });
}
group('N - Security, validation and synthetic account setup');
req('N01 Health and Helmet', 'GET', '/health', null, undefined, 200, ["pm.test('nosniff',()=>pm.expect(pm.response.headers.get('X-Content-Type-Options')).to.eql('nosniff'));"]);
for (const [i, u] of ['sender', 'recipient', 'third', 'lock'].entries()) req(`N0${i + 2} Register ${u}`, 'POST', '/auth/signup', null,
  { name: `Part3 ${u}`, email: `${u}-{{runId}}@example.test`, password: '{{part3Password}}', Phone: '01012345678' }, 201,
  [`pm.collectionVariables.set('${u}Id',data.user._id); pm.collectionVariables.set('${u}Token',data.accessToken); pm.collectionVariables.set('${u}Email',data.user.email);`]);
req('N06 Invalid pagination', 'GET', '/identity-requests?limit=101', 'sender', undefined, 400);
req('N07 Invalid filter', 'GET', '/identity-requests?status=invalid', 'sender', undefined, 400);
req('N08 Inbox read filter and pagination', 'GET', '/messages?isRead=false&page=1&limit=20', 'recipient', undefined, 200);
req('N09 Ready', 'GET', '/ready', null, undefined, 200);
group('O - Anonymous identity consent and private conversations');
req('O01 Send hidden message', 'POST', '/messages/hidden/{{recipientId}}', 'sender', { content: 'Consent before disclosure' }, 201, ["pm.collectionVariables.set('messageId',data.message._id); pm.test('sender private',()=>pm.expect(data.message.senderId).to.eql(undefined));"]);
req('O02 Recipient requests identity', 'POST', '/messages/{{messageId}}/identity-request', 'recipient', {}, 201, ["pm.collectionVariables.set('requestId',data.request._id); pm.test('pending and private',()=>{pm.expect(data.request.status).to.eql('pending');pm.expect(data.request.senderId).to.eql(undefined)});"]);
req('O03 Conversation before acceptance rejected', 'POST', '/identity-requests/{{requestId}}/conversation', 'recipient', {}, 404);
req('O04 Sender views incoming requests', 'GET', '/identity-requests?status=pending&limit=20', 'sender', undefined, 200);
req('O05 Sender rejects', 'PATCH', '/identity-requests/{{requestId}}', 'sender', { status: 'rejected' }, 200);
req('O06 Rejection keeps sender private', 'GET', '/identity-requests/{{requestId}}', 'recipient', undefined, 200, ["pm.test('no identity disclosed',()=>pm.expect(data.sender).to.eql(undefined));"]);
req('O07 Send separate message', 'POST', '/messages/hidden/{{recipientId}}', 'sender', { content: 'Separate consent' }, 201, ["pm.collectionVariables.set('messageId',data.message._id);"]);
req('O08 Separate identity request', 'POST', '/messages/{{messageId}}/identity-request', 'recipient', {}, 201, ["pm.collectionVariables.set('requestId',data.request._id);"]);
req('O09 Third user cannot decide', 'PATCH', '/identity-requests/{{requestId}}', 'third', { status: 'accepted' }, 404);
req('O10 Sender accepts', 'PATCH', '/identity-requests/{{requestId}}', 'sender', { status: 'accepted' }, 200);
req('O11 Recipient sees limited identity', 'GET', '/identity-requests/{{requestId}}', 'recipient', undefined, 200, ["pm.test('limited consented identity',()=>{pm.expect(data.sender._id).to.eql(pm.collectionVariables.get('senderId'));pm.expect(data.sender.email).to.eql(undefined);});"]);
req('O12 Create conversation', 'POST', '/identity-requests/{{requestId}}/conversation', 'recipient', {}, 201, ["pm.collectionVariables.set('conversationId',data.conversation._id);"]);
req('O13 Sender sends', 'POST', '/conversations/{{conversationId}}/messages', 'sender', { content: 'Hello' }, 201);
req('O14 Recipient replies', 'POST', '/conversations/{{conversationId}}/messages', 'recipient', { content: 'Reply' }, 201);
for (const u of ['sender', 'recipient']) req(`O15 Read as ${u}`, 'GET', '/conversations/{{conversationId}}/messages?limit=1&page=1', u, undefined, 200);
req('O16 Third user cannot read', 'GET', '/conversations/{{conversationId}}/messages', 'third', undefined, 404);
req('O17 Third user cannot send', 'POST', '/conversations/{{conversationId}}/messages', 'third', { content: 'Unauthorized' }, 404);
req('O18 Forged sender rejected', 'POST', '/messages/hidden/{{recipientId}}', 'sender', { content: 'x', senderId: '{{thirdId}}' }, 400);
group('P - Five failures and five-minute account lockout');
for (let n = 1; n <= 5; n++) req(`P0${n} Incorrect password ${n}`, 'POST', '/auth/login', null, { email: '{{lockEmail}}', password: 'deliberately-incorrect' }, n === 5 ? 429 : 401);
req('P06 Correct password remains locked', 'POST', '/auth/login', null, { email: '{{lockEmail}}', password: '{{part3Password}}' }, 429, [], 'No extension of lock; wait five minutes then manually repeat with expected 200. Automated API suite simulates stored expiry.');
req('P07 Another account still logs in', 'POST', '/auth/login', null, { email: '{{senderEmail}}', password: '{{part3Password}}' }, 200);
group('Q - Verified email, enable 2FA and confirm login with Mailpit');
function inbox(label) {
  req(`${label} Find captured Mailpit message`, 'GET', '{{mailpitUrl}}/api/v1/messages', null, undefined, 200, ["const m=data.messages.find(m=>m.To.some(t=>t.Address===pm.collectionVariables.get('recipientEmail'))); pm.test('actual captured mail',()=>pm.expect(m).to.exist); if(m)pm.collectionVariables.set('mailId',m.ID);"]);
  req(`${label} Read OTP privately from Mailpit`, 'GET', '{{mailpitUrl}}/api/v1/message/{{mailId}}', null, undefined, 200, ["const m=data.Text.match(/\\b\\d{6}\\b/); pm.test('OTP captured',()=>pm.expect(m).to.exist); if(m)pm.collectionVariables.set('otpCode',m[0]);"], 'Local Mailpit only. Do not export populated runtime variables or captured mail.');
}
req('Q01 Request email verification', 'POST', '/auth/email/request', 'recipient', {}, 200); inbox('Q02');
req('Q03 Confirm email', 'POST', '/auth/email/confirm', 'recipient', { code: '{{otpCode}}' }, 200);
req('Q04 Request enabling 2FA', 'POST', '/auth/2fa/request', 'recipient', {}, 200); inbox('Q05');
req('Q06 Enable wrong OTP rejected', 'POST', '/auth/2fa/enable', 'recipient', { code: '000000' }, 400);
req('Q07 Enable correct OTP', 'POST', '/auth/2fa/enable', 'recipient', { code: '{{otpCode}}' }, 200);
req('Q08 Password login has no tokens', 'POST', '/auth/login', null, { email: '{{recipientEmail}}', password: '{{part3Password}}' }, 200, ["pm.test('no tokens before second factor',()=>{pm.expect(data.requiresTwoFactor).to.eql(true);pm.expect(data.accessToken).to.eql(undefined);pm.expect(data.refreshToken).to.eql(undefined);});"]); inbox('Q09');
req('Q10 Wrong login OTP rejected', 'POST', '/auth/2fa/login', null, { userId: '{{recipientId}}', code: '000000' }, 400);
req('Q11 Confirm login OTP', 'POST', '/auth/2fa/login', null, { userId: '{{recipientId}}', code: '{{otpCode}}' }, 200, ["pm.collectionVariables.set('recipientToken',data.accessToken);pm.test('tokens after OTP',()=>{pm.expect(data.accessToken).to.be.a('string');pm.expect(data.refreshToken).to.be.a('string');});"]);
req('Q12 Reused OTP rejected', 'POST', '/auth/2fa/login', null, { userId: '{{recipientId}}', code: '{{otpCode}}' }, 400);
req('Q13 Protected profile after 2FA', 'GET', '/auth/profile', 'recipient', undefined, 200);
const out = path.join(root, 'postman/Saraha_Course_Part3.postman_collection.json');
// Retain observed examples when rebuilding request definitions after live verification.
if (fs.existsSync(out)) {
  const saved = JSON.parse(fs.readFileSync(out));
  for (const folder of collection.item) for (const item of folder.item) {
    const previous = saved.item.find(f => f.name === folder.name)?.item.find(i => i.name === item.name);
    if (previous?.response) item.response = previous.response;
  }
}
fs.writeFileSync(out, JSON.stringify(collection, null, 2) + '\n');
const environment = { name: 'Saraha Part3 Local', _postman_variable_scope: 'environment', values: [{ key: 'baseUrl', value: 'http://127.0.0.1:3001', enabled: true }, { key: 'mailpitUrl', value: 'http://127.0.0.1:8025', enabled: true }] };
fs.writeFileSync(path.join(root, 'postman/Saraha_Part3_Local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
const combined = JSON.parse(fs.readFileSync(path.join(root, 'postman/Saraha_Backend.postman_collection.json')));
combined.info.name += ' with Part 3'; combined.item.push(...collection.item);
combined.event = [...(combined.event || []), ...collection.event];
fs.writeFileSync(path.join(root, 'postman/Saraha_Backend_With_Part3.postman_collection.json'), JSON.stringify(combined, null, 2) + '\n');
let guide = '# Postman Part 3 walkthrough\n\nExpected responses below are examples, not executed evidence. See PART3_TEST_RESULTS.md for actual runs.\n\n';
guide += 'Start MongoDB, then Mailpit (`& "$env:USERPROFILE\\Downloads\\mailpit.exe" --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025`), then in backend run `npm.cmd start`. Confirm /health at port 3001. Redis is optional without REDIS_URL; configured Redis must be running. Import Saraha_Course_Part3.postman_collection.json and Saraha_Part3_Local.postman_environment.json in Postman, select the environment, confirm baseUrl and save with Ctrl+S. Run N, O, P, Q once in order. N creates unique sender, recipient, third and lock accounts, saving tokens and IDs automatically in collection variables. Q reads only local Mailpit mail. Never export populated variables, OTPs or tokens. Clear runId and all runtime variables before a new run.\n\n';
guide += 'P locks the generated lock account. At five minutes repeat P06 expecting 200 (its saved assertion remains 429 for the initial run). Test clock/expiry behavior is automated separately. Expired OTP: wait OTP_TTL_SECONDS then submit an unused code expecting 400; use fresh challenges for each test. For individual browser CORS tests set Origin; disallowed origins receive no allow-origin header. Export a clean original collection for submission, rather than exporting secrets.\n\n';
for (const f of collection.item) {
  guide += `## ${f.name}\n\n`;
  for (const item of f.item) {
    const r = item.request, expected = item.event[0].script.exec[0].match(/HTTP (\d+)/)[1];
    guide += `### ${item.name}\n\n${r.method} \`${r.url}\`\n\nAuthorization: ${r.auth.type === 'bearer' ? r.auth.bearer[0].value : 'none'}. Query: ${r.url.includes('?') ? r.url.split('?')[1] : 'none'}. Expected status: ${expected}.\n\nBody:\n\n\`\`\`json\n${r.body?.raw || '(none)'}\n\`\`\`\n\nExpected response shape: ${r.url.includes('mailpitUrl') ? 'Mailpit messages or message Text' : Number(expected) >= 400 ? '{ "message": "reason" }' : '{ "message": "Success", ...resource fields }'}. Database: ${r.method === 'GET' ? 'read only' : Number(expected) >= 400 ? 'requested mutation rejected; failed-password/OTP attempts may increment' : r.url.includes('/login') ? 'session only after all required factors; password stage issues challenge when enabled' : 'creates or updates the named resource; see MONGODB_PART3_GUIDE.md'}.\n\n${r.description || ''}\n\nTroubleshooting: 401 means missing/stale token; 403 means verify email; 404 means wrong ownership or ID; 409 means duplicate/state conflict; 429 means cooldown, HTTP limit or account lock; 503 means unavailable mail, Redis or configuration. Rerun prerequisites with a fresh synthetic account.\n\n`;
  }
}
fs.writeFileSync(path.join(root, 'docs/POSTMAN_PART3_GUIDE.md'), guide);
console.log(JSON.stringify({ folders: collection.item.map(f => f.name), requests: collection.item.flatMap(f => f.item).length }));
