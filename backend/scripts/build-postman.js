// Generate reviewable Postman artifacts and a request-by-request beginner reference.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
// Keep observed examples across regeneration; do not discard verified responses.
const previousCollection = path.join(root, 'postman/Saraha_Backend.postman_collection.json');
const retainedResponses = new Map();
if (fs.existsSync(previousCollection)) {
  for (const previousFolder of JSON.parse(fs.readFileSync(previousCollection, 'utf8')).item || []) {
    for (const item of previousFolder.item || []) {
      if (item.response?.length) retainedResponses.set(`${previousFolder.name}\0${item.name}`, item.response);
    }
  }
}
const folders = [];
let folder;
function group(name) { folder = { name, item: [] }; folders.push(folder); }
const capture = (expression, key) => `pm.environment.set('${key}', ${expression});`;
function add(name, method, url, body, status = 200, bearer, extra = [], description = '') {
  const header = body === undefined ? [] : [{ key: 'Content-Type', value: 'application/json' }];
  if (bearer) header.push({ key: 'Authorization', value: `Bearer {{${bearer}}}` });
  const request = { method, header, url: '{{baseUrl}}' + url, description };
  if (body !== undefined) request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  const lines = [`pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`, 'const data = pm.response.json();', `pm.test('JSON response', () => pm.expect(data).to.not.eql(null));`, ...extra];
  const response = retainedResponses.get(`${folder.name}\0${name}`);
  folder.item.push({ name, request, ...(response ? { response } : {}), event: [{ listen: 'test', script: { type: 'text/javascript', exec: lines.map(line => line.replace(/\bdata\b/g, 'courseResponse')) } }] });
}
const legacyUser = { name: 'Assignment student', email: '{{legacyEmail}}', password: 'Course-password-123', Phone: '01012345678', age: 22 };
const secureUser = { name: 'Saraha student', email: '{{email}}', password: 'Course-password-123', confirmPassword: 'Course-password-123', Phone: '+201012345678', age: 22, username: '{{username}}' };
const login = { email: '{{email}}', password: 'Course-password-123' };
const saveTokens = [capture('data.accessToken', 'accessToken'), capture('data.refreshToken', 'refreshToken'), "pm.test('Separate credentials', () => pm.expect(data.accessToken).not.to.eql(data.refreshToken));"];
group('A - User APIs (local Assignment 8 only)');
add('AddUser', 'POST', '/users/signup', legacyUser, 201, null, [capture('data.user._id', 'userId'), "pm.test('Legacy success contract', () => pm.expect(data.message).to.eql('User added successfully.'));", "pm.test('Password omitted', () => pm.expect(data.user).not.to.have.property('Password'));"]);
add('LoginUser', 'POST', '/users/login', { email: '{{legacyEmail}}', password: 'Course-password-123' });
add('GetUserById', 'GET', '/users?userId={{userId}}');
add('UpdateUser', 'PATCH', '/users/{{userId}}?userId={{userId}}', { name: 'Updated student' });
group('B - Note APIs (Assignment 8)');
add('CreateNote', 'POST', '/notes?userId={{userId}}', { title: 'First note', content: 'Course notes' }, 201, null, [capture('data.note._id', 'noteId')]);
add('UpdateNote', 'PATCH', '/notes/{{noteId}}?userId={{userId}}', { title: 'Updated note' });
add('ReplaceNote', 'PUT', '/notes/replace/{{noteId}}?userId={{userId}}', { title: 'Replaced note', content: 'Course notes' });
add('UpdateAllNotesTitles', 'PATCH', '/notes/all?userId={{userId}}', { title: 'Shared title' });
add('GetPaginatedNotes', 'GET', '/notes/paginate-sort?userId={{userId}}&page=1&limit=3', undefined, 200, null, ["pm.test('One owned note', () => pm.expect(data.total).to.eql(1));"]);
add('GetNoteById', 'GET', '/notes/{{noteId}}?userId={{userId}}');
add('FindNoteByContent', 'GET', '/notes/note-by-content?userId={{userId}}&content=Course%20notes');
add('GetNotesWithUser', 'GET', '/notes/note-with-user?userId={{userId}}');
add('AggregateNotes', 'GET', '/notes/aggregate?userId={{userId}}&title=Shared%20title');
add('DeleteSingleNote', 'DELETE', '/notes/{{noteId}}?userId={{userId}}');
add('CreateNoteForBulkDelete', 'POST', '/notes?userId={{userId}}', { title: 'Temporary note', content: 'Delete me' }, 201);
add('DeleteAllNotes', 'DELETE', '/notes?userId={{userId}}');
add('DeleteUser', 'DELETE', '/users?userId={{userId}}');
group('C - Authentication');
add('RegisterUser', 'POST', '/auth/signup', secureUser, 201, null, [...saveTokens, capture('data.user._id', 'secureUserId'), "pm.test('Decrypted own phone', () => pm.expect(data.user.Phone).to.eql('+201012345678'));", "pm.test('No password hash', () => pm.expect(data.user).not.to.have.property('Password'));"]);
add('RegisterSecondUser', 'POST', '/auth/signup', { ...secureUser, email: '{{otherEmail}}', username: '{{otherUsername}}' }, 201, null, [capture('data.user._id', 'otherUserId'), capture('data.accessToken', 'otherAccessToken')]);
add('LoginWithPassword', 'POST', '/auth/login', login, 200, null, saveTokens);
add('GetProfile', 'GET', '/auth/profile', undefined, 200, 'accessToken', ["pm.test('Own identity', () => pm.expect(data.user._id).to.eql(pm.environment.get('secureUserId')));"]);
add('UpdateOwnProfile', 'PATCH', '/auth/profile', { name: 'Saraha recipient' }, 200, 'accessToken');
group('D - JWT and Authorization');
add('NoAccessToken', 'GET', '/auth/profile', undefined, 401);
add('InvalidAccessToken', 'GET', '/auth/profile', undefined, 401, 'invalidAccessToken');
add('WrongTokenType', 'GET', '/auth/profile', undefined, 401, 'refreshToken');
add('InsufficientRole', 'GET', '/auth/admin/status', undefined, 403, 'accessToken');
add('ValidAccessToken', 'GET', '/auth/profile', undefined, 200, 'accessToken');
add('ExpiredAccessToken (manual fixture)', 'GET', '/auth/profile', undefined, 401, 'expiredAccessToken', [], 'Manual: retain a genuine access token until its expiry, paste it into expiredAccessToken, then run. Automatically skipped if no fixture is supplied.');
folder.item.at(-1).event.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: ["if (!pm.environment.get('expiredAccessToken')) pm.execution.skipRequest();"] } });
add('CreateSecureNote', 'POST', '/api/notes', { title: 'Private note', content: 'Owned resource' }, 201, 'accessToken', [capture('data.note._id', 'secureNoteId')]);
add('AuthorizedResourceAccess', 'GET', '/api/notes/{{secureNoteId}}', undefined, 200, 'accessToken');
add('UnauthorizedResourceAccess', 'GET', '/api/notes/{{secureNoteId}}', undefined, 403, 'otherAccessToken');
add('UnauthorizedResourceEdit', 'PATCH', '/api/notes/{{secureNoteId}}', { title: 'Stolen' }, 403, 'otherAccessToken');
add('OwnershipQuerySpoofRejected', 'GET', '/api/notes/{{secureNoteId}}?userId={{secureUserId}}', undefined, 400, 'otherAccessToken');
group('E - Validation');
for (const [name, patch] of [ ['InvalidEmail', { email: 'bad' }], ['MissingPassword', { password: undefined, confirmPassword: undefined }], ['InvalidAge', { age: 17 }], ['UnexpectedFields', { role: 'admin' }], ['InvalidDataTypes', { age: '22' }], ['PasswordConfirmationMismatch', { confirmPassword: 'different' }] ]) add(name, 'POST', '/auth/signup', { ...secureUser, ...patch }, 400, null, ["pm.test('Field error list', () => pm.expect(data.errors).to.be.an('array'));"]);
add('DuplicateEmail', 'POST', '/auth/signup', secureUser, 409);
add('MalformedObjectId', 'GET', '/messages/not-an-id', undefined, 400, 'accessToken');
add('InvalidPagination', 'GET', '/messages?page=0', undefined, 400, 'accessToken');
add('InvalidEnumValue', 'GET', '/messages?isRead=maybe', undefined, 400, 'accessToken');
add('RejectAdminProfileUpdate', 'PATCH', '/auth/profile', { role: 'admin' }, 400, 'accessToken');
add('ArabicValidation', 'POST', '/auth/signup', {}, 400);
folder.item.at(-1).request.header.push({ key: 'Accept-Language', value: 'ar' });
group('F - Refresh Token Rotation');
add('LoginForRotation', 'POST', '/auth/login', login, 200, null, saveTokens);
add('RefreshAccessToken', 'POST', '/auth/refresh', { refreshToken: '{{refreshToken}}' }, 200, null, [capture("pm.environment.get('refreshToken')", 'oldRefreshToken'), "pm.test('Rotation changes credential', () => pm.expect(data.refreshToken).not.to.eql(pm.environment.get('oldRefreshToken')));", ...saveTokens]);
add('ReuseOldRefreshToken', 'POST', '/auth/refresh', { refreshToken: '{{oldRefreshToken}}' }, 401);
add('SessionRevokedAfterReuse', 'GET', '/auth/profile', undefined, 401, 'accessToken');
add('LoginBeforeLogout', 'POST', '/auth/login', login, 200, null, saveTokens);
add('LogoutUser', 'POST', '/auth/logout', {}, 200, 'accessToken');
add('RevokedAccessAfterLogout', 'GET', '/auth/profile', undefined, 401, 'accessToken');
add('RevokedRefreshAfterLogout', 'POST', '/auth/refresh', { refreshToken: '{{refreshToken}}' }, 401);
add('LoginBeforeApplicationTests', 'POST', '/auth/login', login, 200, null, saveTokens);
group('G - Google Login');
add('GoogleLogin (real credential required)', 'POST', '/auth/google', { idToken: '{{googleIdToken}}' }, 200, null, ["pm.test('Local credentials issued', () => pm.expect(data.accessToken).to.be.a('string'));"], 'Manual: configure GOOGLE_CLIENT_ID and supply a real ID token obtained from the original Google frontend. Skipped by the automated runner unless explicitly enabled. Does not replace the main test identity.');
folder.item.at(-1).event.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: ["if (!pm.environment.get('googleIdToken')) pm.execution.skipRequest();"] } });
group('H - Saraha Messages');
add('GetPublicReceivingProfile', 'GET', '/messages/public/{{username}}', undefined, 200, null, ["pm.test('Public data excludes private fields', () => { pm.expect(data.user).not.to.have.property('email'); pm.expect(data.user).not.to.have.property('Phone'); });"]);
add('SendAnonymousMessage', 'POST', '/messages/public/{{username}}', { content: 'Anonymous encouragement' }, 201);
add('InvalidRecipient', 'POST', '/messages/public/missing_recipient', { content: 'Hello' }, 404);
add('GetMyInbox', 'GET', '/messages', undefined, 200, 'accessToken', [capture('data.messages[0]._id', 'messageId'), "pm.test('Recipient inbox', () => pm.expect(data.messages).to.have.lengthOf(1));"]);
add('GetMessageById', 'GET', '/messages/{{messageId}}', undefined, 200, 'accessToken');
add('OtherUserCannotReadInboxMessage', 'GET', '/messages/{{messageId}}', undefined, 404, 'otherAccessToken');
add('OtherUserCannotDeleteMessage', 'DELETE', '/messages/{{messageId}}', undefined, 404, 'otherAccessToken');
add('MarkMessageAsRead', 'PATCH', '/messages/{{messageId}}', { isRead: true }, 200, 'accessToken', ["pm.test('Read state changed', () => pm.expect(data.message.isRead).to.eql(true));"]);
add('GetMessagesPaginated', 'GET', '/messages?page=1&limit=2&isRead=true', undefined, 200, 'accessToken', ["pm.test('Boolean query filter', () => pm.expect(data.total).to.eql(1));"]);
add('DeleteMyMessage', 'DELETE', '/messages/{{messageId}}', undefined, 200, 'accessToken');
group('I - Cleanup (only generated test accounts)');
add('DeleteSecureNote', 'DELETE', '/api/notes/{{secureNoteId}}', undefined, 200, 'accessToken');
add('LogoutAllSessions', 'POST', '/auth/logout-all', {}, 200, 'accessToken');
add('LoginForAccountCleanup', 'POST', '/auth/login', login, 200, null, saveTokens);
add('DeleteOwnAccount', 'DELETE', '/auth/account', undefined, 200, 'accessToken');
add('DeleteSecondAccount', 'DELETE', '/auth/account', undefined, 200, 'otherAccessToken');
require('./postman-part2')({ group, add, current: () => folder, capture });
const collection = { info: { name: 'Saraha Backend - course and Assignment 8', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Run all folders in order on localhost with LEGACY_ASSIGNMENT_MODE=true. Creates unique test users, exercises legacy and secure APIs, then cleans up generated accounts. Manual expiry and Google requests skip without real fixtures.' }, event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: ["if (pm.info.requestName === 'AddUser') { const tag = Date.now().toString(36); pm.environment.set('legacyEmail', 'legacy-' + tag + '@example.com'); pm.environment.set('email', 'saraha-' + tag + '@example.com'); pm.environment.set('otherEmail', 'other-' + tag + '@example.com'); pm.environment.set('username', 'student_' + tag); pm.environment.set('otherUsername', 'other_' + tag); }"] } }], item: folders };
const keys = ['part2Email','part2Username','part2Token','part2Refresh','deviceTwoToken','deviceTwoRefresh','mailConfigured','googleConfigured','googleWrongAudienceToken','emailOtp','recoveryOtp','resetToken','avatarUrl','baseUrl','userId','otherUserId','noteId','messageId','accessToken','refreshToken','username','secureUserId','secureNoteId','otherAccessToken','oldRefreshToken','expiredAccessToken','googleIdToken','legacyEmail','email','otherEmail','otherUsername','invalidAccessToken'];
const environment = { name: 'Saraha Local', values: keys.map(key => ({ key, value: key === 'baseUrl' ? 'http://localhost:3001' : key === 'invalidAccessToken' ? 'invalid.signature.token' : '', type: /Token/.test(key) ? 'secret' : 'default', enabled: true })), _postman_variable_scope: 'environment' };
fs.mkdirSync(path.join(root, 'postman'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'postman/Saraha_Backend.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'postman/Saraha_Local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
let guide = '# Request-by-request Postman reference\n\nGenerated from the actual collection. These responses are examples; executed results are in TEST_RESULTS.md. Run folders A through M in order. Variables use the selected Saraha Local environment. Each request asserts its expected HTTP status; avatar retrieval checks binary WebP. Local server port is currently 3001.\n\n';
const samplePath = path.join(root, 'docs/postman-response-examples.json');
const samples = fs.existsSync(samplePath) ? JSON.parse(fs.readFileSync(samplePath, 'utf8')) : {};
for (const f of folders) {
  guide += `## ${f.name}\n\n`;
  for (const item of f.item) {
    const r = item.request;
    const expected = item.event.find(e => e.listen === 'test').script.exec[0].match(/HTTP (\d+)/)[1];
    const savedLive = item.response?.find(response => /real (?:backend and )?Mailpit/.test(response.name));
    const example = savedLive ? (savedLive.stream ? savedLive.body : JSON.parse(savedLive.body)) : samples[item.name]?.body || { message: 'Response not captured. See expected status, endpoint guide and manual fixture instructions.' };
    const mongo = r.url.includes('/password') ? 'Challenges: request/verify consumes or creates purpose-specific temporary records. Successful reset changes only the password/authVersion and revokes account sessions.' : r.url.includes('/email/') ? 'Challenges: issue/resend writes temporary records; successful confirmation consumes the challenge and marks Users.isEmailVerified.' : r.url.includes('/avatar') ? 'Users.avatar and the dedicated avatar directory: upload re-encodes the image; replacement cleans up the previous generated file. Retrieval is binary WebP.' : r.url.includes('/notes') ? 'Notes: changes belong only to the generated owner; delete removes matching notes.' : r.url.includes('/messages') ? 'Messages: public sends insert recipientId/content/isRead; owned updates change isRead; delete removes the message.' : r.url.includes('/signup') ? 'Users: one record on success; password hash and phone storage depend on legacy/secure route. Secure signup also creates RefreshTokens.' : r.url.includes('/refresh') || r.url.includes('/logout') || r.url.includes('/login') ? 'RefreshTokens: secure login creates a session, refresh changes its hash, logout/reuse sets revokedAt. Legacy login does not create a session.' : 'Users: read does not alter records; update changes allowed fields; delete removes the selected account.';
    guide += `### ${item.name}\n\n- Method: \`${r.method}\`\n- Exact URL: \`${r.url}\`\n- Headers: ${r.header.length ? r.header.map(h => '`' + h.key + ': ' + h.value + '`').join(', ') : 'none'}\n- Query parameters: ${r.url.includes('?') ? '`' + r.url.split('?')[1] + '`' : 'none'}\n- Expected status: ${expected}\n- MongoDB: ${Number(expected) >= 400 ? 'No requested resource mutation; reuse rejection can revoke the session.' : mongo}\n\nBody:\n\n\`\`\`json\n${r.body ? (r.body.mode === 'formdata' ? JSON.stringify(r.body.formdata, null, 2) : r.body.raw) : '(none)'}\n\`\`\`\n\n${savedLive ? (savedLive.stream ? 'Observed live WebP response (shown as an escaped byte string; original bytes are preserved in the saved example and fixtures/observed-avatar.webp)' : 'Observed live-backend response from the real Mailpit workflow (credentials redacted)') : samples[item.name] ? 'Observed response example from the isolated Newman run (credentials redacted; IDs/timestamps are disposable examples)' : 'Illustrative expected response; this manual request was NOT executed'}:\n\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\`\n\n${r.description || ''}\n\n`;
  }
}
fs.writeFileSync(path.join(root, 'docs/POSTMAN_REQUESTS.md'), guide);
console.log(`Generated ${folders.reduce((sum, f) => sum + f.item.length, 0)} requests`);
