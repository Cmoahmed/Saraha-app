const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator, MemoryStore } = require('express-rate-limit');
const redis = require('../services/redis.service');
const { ApiError } = require('./error.middleware');
// Course Section A - Question 11 - Hash verified IDs or normalized IPs; never trust raw forwarded headers
function key(req) { return crypto.createHash('sha256').update(req.auth?.user?.id || ipKeyGenerator(req.ip)).digest('hex'); }
// Course Section A - Question 13 - Shared Redis connection and atomic counter/expiry
class RedisStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  async command(script, name) {
    try {
      const client = await redis.connect();
      return await client.withAbortSignal(AbortSignal.timeout(3000)).eval(script, { keys: [`saraha:limits:${this.prefix}:${name}`], arguments: [String(this.windowMs)] });
    } catch { throw new ApiError(503, 'Abuse protection unavailable; retry later'); }
  }
  async increment(name) {
    const result = await this.command("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}", name);
    return { totalHits: Number(result[0]), resetTime: new Date(Date.now() + Number(result[1])) };
  }
  async decrement(name) { await this.command("local n=redis.call('GET',KEYS[1]); if n and tonumber(n)>0 then return redis.call('DECR',KEYS[1]) end; return 0", name); }
  async resetKey(name) { await this.command("return redis.call('DEL',KEYS[1])", name); }
}
// Course Section A - Question 10 - Explicit policy, modern headers, no contradictory duplicate counters
// Course Section A - Question 12 - Location interpreted as trustworthy client IP, not geography
// Course Section A - Question 14 - Memory for one process; configured Redis fails closed
function limiter(name, limit, windowMs = 60000) {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: key,
    store: process.env.REDIS_URL ? new RedisStore(name) : new MemoryStore(), passOnStoreError: false });
}
module.exports = { limiter, RedisStore, key };
