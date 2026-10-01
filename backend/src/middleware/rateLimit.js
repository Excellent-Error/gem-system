import { config } from '../config.js';
import { tooMany } from '../utils/http.js';

const buckets = new Map(); // key -> { count, resetAt }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60 * 1000).unref();

export function rateLimit(kind) {
  const max = kind === 'login' ? config.loginRateLimitMax : config.publicRateLimitMax;
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const key = `${kind}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + config.rateLimitWindowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retry = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return next(tooMany(retry));
    }
    next();
  };
}
