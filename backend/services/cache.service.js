const redis = require('./redis.service');
// Section 1 - Question 11 - Cache-aside public educational data, never private inboxes
async function remember(name, ttl, load) {
  try { const cached = await redis.get(name); if (cached !== null) return cached; } catch { /* Optional public cache only. */ }
  const value = await load();
  try { await redis.set(name, value, ttl); } catch { /* Mongo/session authorization never depends on this cache. */ }
  return value;
}
module.exports = { remember };
