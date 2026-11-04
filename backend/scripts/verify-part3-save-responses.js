const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const source = path.join(root, 'postman/Saraha_Course_Part3.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(source));
const original = structuredClone(collection);
const stamp = new Date().toISOString();
const report = { executedAt: stamp, baseUrl: 'http://127.0.0.1:3001', realBackend: true, realMailpit: true };
function redact(value, key = '') {
  if (/^(accessToken|refreshToken|resetToken|password|Password|tokenHash|verifier|code|otpCode)$/i.test(key)) return `<redacted-${key}>`;
  if (Array.isArray(value)) return value.map(v => redact(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  if (typeof value === 'string') return value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<redacted-token>').replace(/\b\d{6}\b/g, '<redacted-code>');
  return value;
}
async function main() {
  assert.equal((await fetch(`${report.baseUrl}/health`, { signal: AbortSignal.timeout(3000) })).status, 200);
  assert.equal((await fetch('http://127.0.0.1:8025/api/v1/info', { signal: AbortSignal.timeout(3000) })).status, 200);
  const summary = await new Promise((resolve, reject) => require('newman').run({ collection, environment: { values: [{ key: 'baseUrl', value: report.baseUrl, enabled: true }, { key: 'mailpitUrl', value: 'http://127.0.0.1:8025', enabled: true }] }, timeoutRequest: 25000, reporters: [] }, (error, result) => error ? reject(error) : resolve(result)));
  report.stats = summary.run.stats;
  report.failures = summary.run.failures.map(f => ({ request: f.source.name, message: f.error.message }));
  const executions = summary.run.executions;
  report.requests = executions.map(e => ({ name: e.item.name, status: e.response?.code, assertions: e.assertions?.length || 0 }));
  if (report.failures.length) throw new Error('Collection assertions failed; saved examples were not changed');
  const items = original.item.flatMap(f => f.item);
  assert.equal(executions.length, items.length);
  const emails = new Set(executions.filter(e => /^N0[2-5] Register/.test(e.item.name)).map(e => JSON.parse(e.response.stream.toString()).user.email));
  const secrets = executions.flatMap(e => {
    const b = JSON.parse(e.response.stream.toString());
    return [b.accessToken, b.refreshToken, b.resetToken].filter(Boolean);
  });
  for (let i = 0; i < items.length; i++) {
    const item = items[i], execution = executions[i];
    assert.equal(execution.item.name, item.name);
    let body = JSON.parse(execution.response.stream.toString());
    if (item.request.url.startsWith('{{mailpitUrl}}/api/v1/messages')) {
      // Mailpit may contain other existing mail. Never copy unrelated mailbox contents.
      body = { ...body, messages: body.messages.filter(m => m.To.some(t => emails.has(t.Address))) };
      body.total = body.messages.length; body.count = body.messages.length;
    }
    if (item.request.url.startsWith('{{mailpitUrl}}/api/v1/message/')) assert.ok(body.To.some(t => emails.has(t.Address)));
    const name = `Verified live ${execution.response.code} — ${stamp}`;
    const example = { name, originalRequest: structuredClone(item.request), status: execution.response.status,
      code: execution.response.code, _postman_previewlanguage: 'json',
      header: execution.response.headers.all().filter(h => !/^(set-cookie|authorization)$/i.test(h.key)).map(h => ({ key: h.key, value: h.value })),
      cookie: [], body: JSON.stringify(redact(body), null, 2) };
    item.response = [...(item.response || []).filter(r => !r.name.startsWith('Verified live ')), example];
  }
  original.info.description += `\nAll ${items.length} requests executed against localhost:3001 with real Mailpit at ${stamp}. Saved examples are observed responses; credentials and OTPs redacted. Mailpit listings exclude unrelated messages. Synthetic test records retained; no existing accounts were changed.`;
  const output = JSON.stringify(original, null, 2) + '\n';
  for (const secret of secrets) assert.ok(!output.includes(secret), 'Live credential found in export');
  assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(output), 'JWT found in export');
  const backup = path.join(root, `test-results/part3-before-responses-${Date.now()}.json`);
  fs.copyFileSync(source, backup);
  fs.writeFileSync(source, output);
  const verified = structuredClone(original);
  verified.info.name = 'Saraha Course Part 3 - Verified Responses';
  const verifiedFile = path.join(root, 'postman/Saraha_Course_Part3_Verified_Responses.postman_collection.json');
  verified.info._postman_id = fs.existsSync(verifiedFile) ? JSON.parse(fs.readFileSync(verifiedFile)).info._postman_id : require('node:crypto').randomUUID();
  fs.writeFileSync(verifiedFile, JSON.stringify(verified, null, 2) + '\n');
  report.savedExamples = items.filter(i => i.response?.length).length;
  report.success = true;
  console.log(JSON.stringify({ requests: items.length, assertions: report.stats.assertions, savedExamples: report.savedExamples, failures: 0 }));
}
main().catch(error => { report.success = false; report.error = error.message; console.error(error.message); process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(root, 'test-results/part3-live-saved-responses.json'), JSON.stringify(report, null, 2));
});
