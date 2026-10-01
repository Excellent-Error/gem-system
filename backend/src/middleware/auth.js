import { config } from '../config.js';
import { verifyJwt, signJwt } from '../utils/jwt.js';
import { unauthorized } from '../utils/http.js';

export const COOKIE_NAME = 'gem_token';

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function authMiddleware(store) {
  return (req, res, next) => {
    const token = parseCookies(req)[COOKIE_NAME];
    const payload = token ? verifyJwt(token, config.jwtSecret) : null;
    if (payload) {
      const admin = store.findAdminByEmail(payload.email);
      if (admin && payload.nonce && payload.nonce === admin.token_nonce) {
        req.admin = { id: admin.id, email: admin.email, name: admin.name, role: admin.role, created_at: admin.created_at };
        return next();
      }
    }
    req.admin = null;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.admin) return next(unauthorized('Please log in to continue'));
  next();
}

export function issueAuthCookie(res, admin) {
  const token = signJwt({ sub: admin.id, email: admin.email, role: admin.role, nonce: admin.tokenNonce }, config.jwtSecret, config.jwtExpiresSeconds);
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${config.jwtExpiresSeconds}`];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
