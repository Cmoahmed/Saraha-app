const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const redis = require('../services/redis.service');
// Section 2 - Question 3 - Isolated connectivity test and temporary keys
async function demo() {
  const client = await redis.connect();
  const prefix = redis.key(`demo:${crypto.randomUUID()}`);
  const keys = ['string', 'list', 'set', 'scores', 'hash'].map(n => `${prefix}:${n}`);
  try {
    assert.equal(await client.ping(), 'PONG');
    // Section 1 - Question 13 - String SET/GET/EXPIRE/DEL
    await client.set(keys[0], 'hello', { EX: 30 });
    assert.equal(await client.get(keys[0]), 'hello');
    await client.expire(keys[0], 1);
    assert.ok(await client.ttl(keys[0]) <= 1);
    // Section 1 - Question 14 - Bounded FIFO list, newest samples at the right
    await client.rPush(keys[1], ['first', 'second']); await client.expire(keys[1], 30);
    await client.lTrim(keys[1], -10, -1);
    assert.equal(await client.lPop(keys[1]), 'first');
    // Section 1 - Question 15 - Sets deduplicate and support membership
    await client.sAdd(keys[2], ['sample', 'sample']); await client.expire(keys[2], 30);
    assert.equal(await client.sCard(keys[2]), 1); assert.ok(await client.sIsMember(keys[2], 'sample'));
    // Section 1 - Question 16 - Sorted sets order unique members by score
    await client.zAdd(keys[3], [{ score: 2, value: 'beta' }, { score: 1, value: 'alpha' }]); await client.expire(keys[3], 30);
    assert.deepEqual(await client.zRange(keys[3], 0, -1), ['alpha', 'beta']);
    // Section 1 - Question 17 - A Redis hash is a field map, not a password hash
    await client.hSet(keys[4], { title: 'sample' }); await client.expire(keys[4], 30);
    assert.equal(await client.hGet(keys[4], 'title'), 'sample');
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(await client.get(keys[0]), null);
    console.log('Redis ping, strings, expiry, list, set, sorted set, hash: passed');
  } finally { await client.del(keys); await redis.close(); }
}
if (require.main === module) demo().catch(() => { console.error('Redis demo failed; check REDIS_URL and server availability.'); process.exitCode = 1; });
module.exports = demo;
