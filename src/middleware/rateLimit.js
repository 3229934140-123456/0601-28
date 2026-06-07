const db = require('../config/database');
const { error } = require('../utils/response');

const rateLimitMap = new Map();

function rateLimit(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 60,
    keyGenerator = (req) => req.anonymousId || req.ip,
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, []);
    }

    const timestamps = rateLimitMap.get(key);
    const recent = timestamps.filter(t => t > windowStart);

    if (recent.length >= max) {
      return res.status(429).json(error('请求过于频繁，请稍后再试', 429));
    }

    recent.push(now);
    rateLimitMap.set(key, recent);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - recent.length);

    next();
  };
}

function submitLimit(themeIdKey = 'theme_id', intervalSeconds = 10) {
  return (req, res, next) => {
    const anonymousId = req.anonymousId;
    const themeId = req.body?.[themeIdKey] || req.params[themeIdKey] || req.query[themeIdKey];

    if (!themeId) return next();

    const recent = db.prepare(`
      SELECT id FROM submit_log
      WHERE anonymous_id = ? AND theme_id = ?
      AND created_at > DATETIME('now', ? || ' seconds')
    `).get(anonymousId, themeId, -intervalSeconds);

    if (recent) {
      return res.status(429).json(error('操作过于频繁，请稍后再试', 429));
    }

    db.prepare(`
      INSERT INTO submit_log (anonymous_id, theme_id)
      VALUES (?, ?)
    `).run(anonymousId, themeId);

    next();
  };
}

module.exports = { rateLimit, submitLimit };
