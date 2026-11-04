const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const collection = JSON.parse(read('postman/Saraha_Backend.postman_collection.json'));
const requests = new Set(collection.item.flatMap(f => f.item.map(i => i.name)));
const xml = read('test-results/automated.xml');
assert.ok(!/<failure[ >]/.test(xml), 'Automated suite has failures');
const tests = {
  google: 'Google verifier rejects wrong audience, issuer, expiry, signature and malformed signed fixtures',
  accounts: 'Google adapter handles verified claims and refuses automatic account linking (mocked verifier)',
  auth: 'auth signup, login, private profile, validation, role and legacy hash upgrade',
  validation: 'new input validation preserves existing login and normalizes valid inputs',
  cache: 'mail failure removes unusable challenge; public cache fails safely when Redis is absent',
  sessions: 'device logout isolates sessions; all-device logout rejects both token types',
  tokens: 'refresh rotation, race/reuse detection, expiry, logout and deleted accounts',
  confirm: 'confirmation cycle, trusted attachment, wrong code, purpose isolation, replay and email changes',
  otp: 'OTP cooldown, resend limit, old-code invalidation, atomic attempts, expiry and concurrent single use',
  reset: 'recovery resets password once, rejects expired authorization, preserves roles and owned data',
  upload: 'avatar decoding, retrieval, replacement cleanup, limits and authentication'
};
const entries = [];
function add(section, filename, question, status, source, test, postman, note) {
  entries.push({ section, filename, question, status, source, tests: test ? test.split(',').map(k => tests[k]) : [], postman: postman ? postman.split(',') : [], note });
}
const I = 'implemented', D = 'documented', P = 'partially verified';
// Entries follow the screenshots from top to bottom, preserving their spellings.
add(1, '17_Hash.mkv', '17', P, 'scripts/redis-demo.js', '', '', 'Executable HSET/HGET example; live Redis unavailable.');
add(1, '16_Sorted_Set.mkv', '16', P, 'scripts/redis-demo.js', '', '', 'Executable score ordering assertions; live Redis unavailable.');
add(1, '15_Set.mkv', '15', P, 'scripts/redis-demo.js', '', '', 'Executable uniqueness/membership assertions; live Redis unavailable.');
add(1, '14_List.mkv', '14', P, 'scripts/redis-demo.js', '', '', 'Executable bounded FIFO demonstration; live Redis unavailable.');
add(1, '13_String.mkv', '13', P, 'scripts/redis-demo.js', '', '', 'SET/GET/EXPIRE/DEL and timing assertions; live Redis unavailable.');
add(1, '12_Using_upstach.mkv', '12', P, 'services/redis.service.js', '', '', 'Interpreted as Upstash from the supplied course prompt; REDIS_URL supports TCP/TLS, not REST tokens. Cloud account not configured.');
add(1, '11_What_Is_Cashing.mkv', '11', P, 'services/cache.service.js', 'cache', '', 'Interpreted as caching. Cache-aside public sample helper and outage fallback tested; real cache hits/TTL remain external.');
add(1, '10_Example4(email).mkv', '10', I, 'validations/auth.schema.js', 'validation,confirm', 'SignupInvalidEmail,RequestEmailVerification,ConfirmEmailValidOTP', 'Zod normalization plus confirmation establishes ownership.');
add(1, '09_Example3(password).mkv', '9', I, 'validations/auth.schema.js', 'validation,reset', 'SignupInvalidPassword,ResetPassword', '8–128 characters, nonblank, shared reset/signup policy, existing hash verification preserved.');
add(1, '08_Example2(phone).mkv', '8', I, 'validations/auth.schema.js', 'validation,auth', 'SignupInvalidPhone', 'Egyptian mobile and international E.164-style input; formatted input normalized before encryption. Existing stored phones untouched.');
add(1, '07_Example1(username).mkv', '7', I, 'validations/auth.schema.js', 'validation,auth', 'SignupInvalidUsername,SignupDuplicateUsername', 'Lowercase ASCII, 3–30 characters, reserved names and ObjectId-like names excluded; unique existing index.');
add(1, '06_Regex.mkv', '6', I, 'validations/auth.schema.js', 'validation', 'SignupInvalidUsername,SignupInvalidPhone', 'Simple bounded validators and Zod built-ins.');
add(1, '05_What_is_Regex.mkv', '5', D, '', '', '', 'See numbered conceptual notes below: anchors, classes, quantifiers, escaping, validation limits.');
add(1, '04_Refactor.mkv', '4', I, 'services/auth.service.js', 'accounts,auth', 'Part2GoogleValidToken,LoginDeviceOne', 'Safe-profile and session services reused by Google and password login.');
add(1, '03_Signup_And_Login_With_Gmail[BE].mkv', '3', P, 'controllers/auth.controller.js', 'accounts', 'Part2GoogleValidToken', 'First/returning identities, no email-only linking and normal-user role tested with mocked provider. Real Google login pending. Screenshot spelling [BE] takes precedence over pasted [EB].');
add(1, '02_Verfiy_TokenID.mkv', '2', P, 'controllers/auth.controller.js', 'google,accounts', 'Part2GoogleInvalidToken,GoogleWrongAudience', 'Official cryptographic verifier tested with local RSA certificates for signature/audience/issuer/expiry; no live Google credential.');
add(1, '01_Intro.mkv', '1', D, '', '', '', 'Section goal: retain authentication while adding validation and optional temporary caching.');
add(2, '16_Summary.mkv', '16', D, '', '', '', 'Sessions remain authoritative in Mongo; local mail tests pass; live Redis/SMTP require setup.');
add(2, '15_Send_Mail_Implement.mkv', '15', I, 'services/email.service.js', 'confirm,cache', 'RequestEmailVerification,RequestForgotPassword', 'Awaited mail service, local Nodemailer JSON transport and failure cleanup tested. SMTP delivery remains manual.');
add(2, '14_Why_nodemailer.mkv', '14', D, '', '', '', 'Nodemailer separates message construction and delivery transport; use JSON in tests and SMTP in deployment.');
add(2, '13_Send_Mail_Concept.mkv', '13', D, '', '', '', 'Mail is an awaited external side effect; delivery errors must propagate and no arbitrary public send endpoint is provided.');
add(2, '12_Refactor_Part2.mkv', '12', I, 'middleware/authentication.js', 'sessions,tokens', 'VerifyDeviceOneRevoked,VerifyDeviceTwoStillActive,InvalidRefreshAfterLogout', 'Single authoritative session check; outages cannot bypass authentication.');
add(2, '11_Refactor_Part1.mkv', '11', I, 'services/token.service.js', 'auth,tokens', 'LoginDeviceOne,LoginDeviceTwo', 'Existing shared token creation/rotation retained.');
add(2, '10_Implement_Logout_From_All_Device_Implement.mkv', '10', I, 'controllers/auth.controller.js', 'sessions', 'LogoutAllDevices,VerifyAllSessionsRevoked', 'Revoke all account sessions without changing user data.');
add(2, '09_Logout_From_All_devices_Concept.mkv', '9', I, 'controllers/auth.controller.js', 'sessions', 'LogoutAllDevices', 'All devices share userId but have distinct session IDs.');
add(2, '08_Implement_Logout_From_One_Device__Concept.mkv', '8', I, 'controllers/auth.controller.js', 'sessions,tokens', 'LogoutCurrentDevice,InvalidRefreshAfterLogout', 'Revoke one session and reject its old credentials.');
add(2, '07_Logout_From_One_DeviceConcept_Part2.mkv', '7', I, 'controllers/auth.controller.js', 'sessions', 'VerifyDeviceTwoStillActive', 'Independent device session remains valid.');
add(2, '06_Logout_From_One_Device_Concept.mkv', '6', I, 'controllers/auth.controller.js', 'sessions', 'LogoutCurrentDevice,VerifyDeviceOneRevoked', 'Logout changes server-side session state rather than merely removing a client token.');
add(2, '05_Redis_Service_Part2.mkv', '5', P, 'services/redis.service.js', 'cache', '', 'Shared namespace, delete and shutdown; outage path tested, live service pending.');
add(2, '04_Redis_Service_Part1.mkv', '4', P, 'services/redis.service.js', '', '', 'Reusable JSON GET/SET with positive TTL seconds; live service pending.');
add(2, '03_Test_redis_Client.mkv', '3', P, 'scripts/redis-demo.js', '', '', 'Connectivity script fails honestly against unavailable localhost:6379.');
add(2, '02_Redis_Connection.mkv', '2', P, 'services/redis.service.js', 'cache', '', 'Lazy connection, bounded timeout, no offline queue/reconnect loops, shutdown; real connection pending.');
add(2, '01_Intro_And_Recap.mkv', '1', D, '', '', '', 'Mongo Users/RefreshTokens remain authoritative; Redis is optional public cache/demo storage.');
add(3, '15_Summary.mkv', '15', D, '', '', '', 'This summary exists in Section 3 and is preserved. Confirmation/recovery cycles covered with captured local mail.');
add(3, '14_Send_Forget_Password_Email.mkv', '14', I, 'controllers/recovery.controller.js', 'reset', 'RequestForgotPassword,RequestForgotPasswordUnknownEmail', 'Purpose-separated recovery challenge; uniform eligibility response.');
add(3, '13_Forget_Password_Concept.mkv', '13', D, '', '', '', 'Ownership proof precedes password changes; never reveal current password or account existence in response body.');
add(3, '12_Cycle_Test.mkv', '12', I, 'test/part2.test.js', 'confirm,otp', 'RequestEmailVerification,ConfirmEmailValidOTP,ConfirmEmailReusedOTP', 'Local capture verifies complete confirmation, replay, expiry, attempts and resend.');
add(3, '11_Apply_Trials_Concept.mkv', '11', I, 'services/otp.service.js', 'otp', 'ConfirmEmailWrongOTP', 'Atomic increment allows at most five verification attempts per challenge.');
add(3, '10_Resend_OTP.mkv', '10', I, 'services/otp.service.js', 'otp', 'RequestEmailVerification,ResendBeforeCooldown', 'Same request endpoint resends; 60-second cooldown, three sends per live challenge, route rate limits.');
add(3, '09_Email_Event.mkv', '9', I, 'services/email.service.js', 'confirm,cache', 'RequestEmailVerification', 'One event listener and awaited promise; errors propagate, no duplicate handler or durable queue.');
add(3, '08_Refactor.mkv', '8', I, 'services/otp.service.js', 'otp,reset', 'ConfirmEmailValidOTP,VerifyPasswordResetOTP', 'Shared purpose-aware consume helper.');
add(3, '07_Confirm_Email.mkv', '7', I, 'controllers/recovery.controller.js', 'confirm', 'ConfirmEmailValidOTP,ConfirmEmailReusedOTP,VerifyEmailStatus', 'Consume once and update verification flag.');
add(3, '06_Send_Mail_OTP.mkv', '6', I, 'services/otp.service.js', 'confirm', 'RequestEmailVerification', 'Crypto random six-digit codes with keyed HMAC and five-minute expiry; no API code disclosure.');
add(3, '05_Confirm_Email_Resend_OTP.mkv', '5', I, 'models/challenge.model.js', 'otp', 'RequestEmailVerification,ResendBeforeCooldown', 'Unique user/purpose records, no plaintext stored codes, superseded codes rejected.');
add(3, '04_Confirm_Email_Part1.mkv', '4', I, 'models/user.model.js', 'confirm,auth', 'Part2RegisterUser,VerifyEmailStatus', 'New status field; no forced verification gate or migration for old accounts.');
add(3, '03_Refactor_Send_Mail.mkv', '3', I, 'services/email.service.js', 'confirm', 'RequestEmailVerification,RequestForgotPassword', 'One transport/template boundary for both purposes.');
add(3, '02_Send_Attachment.mkv', '2', I, 'services/email.service.js', 'confirm', 'RequestEmailVerification', 'Trusted in-memory security.txt attachment; URL/filesystem loading disabled.');
add(3, '01_Intro_And_Recap.mkv', '1', D, '', '', '', 'Confirmation and recovery use Mongo challenges, existing auth and shared mail service.');
add(4, '13_Validate_File_Content.mkv', '13', I, 'services/upload.service.js', 'upload', 'UploadFakeImage,UploadWrongFileType,UploadValidAvatar', 'Sharp decodes, checks actual format against MIME, bounds pixels, rejects animation and re-encodes WebP.');
add(4, '12_Render_Static_Files_And_Limit_File_Size.mkv', '12B', I, 'middleware/upload.js', 'upload', 'UploadOversizedAvatar,GetPublicAvatar', '2 MiB, one file, zero fields, dedicated generated-name avatar retrieval only. app.js handles retrieval.');
add(4, '12_File_Filter.mkv', '12A', I, 'middleware/upload.js', 'upload', 'UploadWrongFileType', 'Separate MIME allowlist lesson; not conflated with 12B.');
add(4, '11_File_Destination.mkv', '11', I, 'services/upload.service.js', 'upload', 'ReplaceAvatar', 'Generated filenames, dedicated directory and failed/replaced-file cleanup.');
add(4, '10_Multer_Middlewares.mkv', '10', I, 'middleware/upload.js', 'upload', 'UploadWithoutToken,UploadWrongFileType', 'Reusable route-scoped parser and consistent errors.');
add(4, '09_Implement_Multer.mkv', '9', I, 'middleware/upload.js', 'upload', 'UploadValidAvatar', 'Authenticated profile avatar endpoint.');
add(4, '08_Uploading_File_Concept.mkv', '8', D, '', '', '', 'Multipart separates fields/file bytes; avatars are public by design; no anonymous message attachments.');
add(4, '07_Test_Reset_Password.mkv', '7', I, 'test/part2.test.js', 'reset', 'ResetPassword,RejectOldPassword,LoginWithNewPassword,RejectReusedResetAuthorization', 'End-to-end reset asserts old-password failure, new-password login, revoked sessions and unchanged owned records.');
add(4, '06_Reset_Password.mkv', '6', I, 'controllers/recovery.controller.js', 'reset', 'ResetPassword', 'Consume reset credential, hash password, revoke sessions, update existing user only.');
add(4, '05_Verify_OTP_Forget_Password.mkv', '5', I, 'services/otp.service.js', 'reset', 'VerifyPasswordResetOTP', 'Single-use 256-bit reset credential with five-minute expiry.');
add(4, '04_Cycle_Test.mkv', '4', I, 'test/part2.test.js', 'reset,otp', 'RequestForgotPassword,VerifyPasswordResetWrongOTP,VerifyPasswordResetOTP', 'Recovery preparation and shared challenge limits/expiry tested.');
add(4, '03_Refactor(check OTP).mkv', '3', I, 'services/otp.service.js', 'otp,reset', 'VerifyPasswordResetOTP,ConfirmEmailValidOTP', 'First visible occurrence; shared constant-time purpose-aware verifier.');
add(4, '03_Refactor(check OTP).mkv', '3', I, 'services/otp.service.js', 'otp,reset', 'VerifyPasswordResetOTP,ConfirmEmailValidOTP', 'Second visible occurrence; same technical implementation, excluded from unique-topic totals.');
add(4, '02_Fix_TTL_Problem.mkv', '2', I, 'models/challenge.model.js', 'otp,reset', 'ConfirmEmailWrongOTP,RejectReusedResetAuthorization', 'Explicit expiry in every consume/delete query; attempts do not extend expiry; Mongo TTL only performs cleanup.');
add(4, '01_Recap_And_Session_Flow.mkv', '1', D, '', '', '', 'Mongo refresh sessions outlive access tokens; OTP/reset credentials expire independently; Redis never authorizes login.');
assert.deepEqual([1, 2, 3, 4].map(s => entries.filter(e => e.section === s).length), [17, 16, 15, 15]);
const unique = [...new Map(entries.map(e => [`${e.section}:${e.filename}`, e])).values()];
assert.equal(entries.length, 63); assert.equal(unique.length, 62);
assert.equal(entries.filter(e => e.section === 4 && e.filename === '15_Summary.mkv').length, 0);
const counts = Object.fromEntries([I, D, P, 'incomplete'].map(s => [s, unique.filter(e => e.status === s).length]));
for (const e of unique) {
  for (const name of e.tests) assert.ok(xml.includes(name), `No executed test evidence for ${name}`);
  for (const name of e.postman) assert.ok(requests.has(name), `Missing Postman request ${name}`);
  if (e.source) {
    const source = read(e.source);
    assert.ok(source.includes(`Section ${e.section} - Question ${e.question} -`), `Missing implementation question comment: section ${e.section}, question ${e.question}`);
  }
  if (e.status === I) assert.ok(e.tests.length, 'Implemented topic requires executed evidence');
}
const summary = JSON.parse(read('test-results/postman-summary.json'));
assert.equal(summary.failures.length, 0);
assert.deepEqual(collection.item.slice(-4).map(f => f.name.slice(0, 1)), ['J', 'K', 'L', 'M']);
let md = '# Final four-section screenshot audit\n\nAudited 2 November 2026. Screenshot order is top to bottom, exactly as displayed. The newer correction overrides the pasted prompt. Section 4 has no 14 or 15; Section 3 retains 15_Summary.mkv. Both Section 4 number-12 lessons are separate.\n\n';
md += `**63 visible entries; 62 section-scoped unique lessons.** Repeated generic filenames across different sections remain separate lessons. The duplicated Section 4 Question 3 is listed twice and counted once in topic totals.\n\n| Status (mutually exclusive) | Unique topics |\n|---|---:|\n${Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n`;
md += 'Implemented means code plus passing local automated behavior evidence. Documented means a conceptual/intro/summary lesson with no artificial implementation. Partially verified means implemented code with an external integration still pending. All 62 topics are documented; documentation is not an additional mutually exclusive count. Local SMTP transport tests do not prove real delivery. No incomplete feasible implementation was identified; external verification is still outstanding.\n\n';
md += '| Section | Visible | Unique | Implemented | Documented | Partially verified | Incomplete |\n|---|---:|---:|---:|---:|---:|---:|\n';
for (const section of [1, 2, 3, 4]) {
  const topics = unique.filter(e => e.section === section);
  md += `| ${section} | ${entries.filter(e => e.section === section).length} | ${topics.length} | ${topics.filter(e => e.status === I).length} | ${topics.filter(e => e.status === D).length} | ${topics.filter(e => e.status === P).length} | 0 |\n`;
}
md += '\n';
md += `Automated evidence: [JUnit report](../test-results/automated.xml); [Newman summary](../test-results/postman-summary.json): ${summary.stats.requests.total} requests, ${summary.stats.assertions.total} assertions, zero failures. The collection contains ${collection.item.reduce((n, f) => n + f.item.length, 0)} requests; ${collection.item.reduce((n, f) => n + f.item.length, 0) - summary.stats.requests.total} require manual fixtures and were skipped. Original baseline: 16 tests, 68 HTTP requests, 160 assertions, all passed before changes.\n\n`;
for (const section of [1, 2, 3, 4]) {
  md += `## Section ${section}\n\n| Visible filename | Status | Implementation / executed evidence | Correct Postman requests |\n|---|---|---|---|\n`;
  for (const e of entries.filter(e => e.section === section)) {
    md += `| \`${e.filename}\` | ${e.status} | ${e.source ? `[${e.source}](../${e.source}) — ` : ''}${e.note} ${e.tests.length ? 'Passing tests: ' + e.tests.map(n => '`' + n + '`').join('; ') + '.' : ''} | ${e.postman.length ? e.postman.map(n => '`' + n + '`').join(', ') : 'No HTTP endpoint; conceptual notes or executable Redis script.'} |\n`;
  }
}
md += '\n## Numbered conceptual notes and external requirements\n\nSection 1 Question 1: Google uses verified identity claims and shared local sessions; new validation applies to writes without migrating stored users.\n\nSection 1 Question 5: Regex anchors `^`/`$` constrain the whole string; classes such as `[a-z]` constrain characters; quantifiers `{3,30}` bound length; escaping `\\.` matches a literal dot. Prefer Zod email validation. Regex does not prove email ownership or replace authorization, length limits or uniqueness indexes.\n\nSection 1 Question 11: A cache hit returns stored data; a miss loads authoritative data. Cache-aside writes a temporary copy after loading. TTL is in seconds. Expiration limits staleness but does not replace invalidation on changes. The sample helper handles public educational data only and is not attached to profiles/inboxes. The demo explicitly deletes its isolated keys.\n\nSection 1 Questions 12–17 and Section 2 Questions 2–5: See REDIS_SETUP.md. Lists preserve order and duplicates; sets deduplicate; sorted sets rank unique members by numeric score; hashes are field maps, unrelated to password hashing. Run `node scripts/redis-demo.js` with REDIS_URL configured to execute real assertions and cleanup. Live localhost:6379 connection failed in this audit; Upstash was not configured.\n\nSection 2 Question 1: Mongo Users and RefreshTokens are authoritative. Optional Redis caches cannot override revoked sessions. Section 2 Questions 13/14: SMTP delivery is asynchronous and external; Nodemailer separates transport from templates, attachments and message construction. Section 2 Question 16: local session tests passed, live Redis and provider SMTP checks remain pending.\n\nSection 3 Question 1: protected purpose-specific challenges integrate with shared authentication/mail services. Section 3 Question 13: recovery uses uniform response bodies for eligible and absent accounts, OTP ownership proof and a single-use reset credential. This reduces enumeration but does not promise identical timing. Section 3 Question 15: local confirmation/recovery cycles pass; SMTP acceptance/delivery is not yet proven.\n\nSection 4 Question 1: access/refresh sessions, OTP challenges and reset credentials have independent expiry; reset revokes existing Mongo sessions. Section 4 Question 8: multipart/form-data carries file bytes and metadata; MIME and filenames are untrusted. Avatars are public; authenticated users can upload one bounded image, which is decoded and re-encoded before retrieval. Disk storage can later be replaced with an object-store service using the same API boundary.\n\nPreservation: baseline tests remain passing; bonus.js and legacy APIs retained; no development database reads, migrations, drops or admin changes were performed. All destructive automated cleanup targets separate guarded *_test databases and generated temporary upload directories. Safety checkpoint is an ignored audit-checkpoint-* directory at the project root, excluding .env, uploads, caches and node_modules. See PART2_TEST_RESULTS.md for preservation evidence and practical limits.\n';
fs.writeFileSync(path.join(root, 'docs/COURSE_PART2_CHECKLIST.md'), md);
fs.writeFileSync(path.join(root, 'docs/course-part2-lessons.json'), JSON.stringify({ entries, uniqueTopics: unique.length, counts }, null, 2) + '\n');
console.log(JSON.stringify({ visibleEntries: entries.length, uniqueTopics: unique.length, counts }, null, 2));
