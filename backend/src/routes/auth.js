import { rateLimit } from '../middleware/rateLimit.js';
import { issueAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';
import { validateLogin } from '../validation/validate.js';
import { verifyPassword, hashPassword } from '../utils/crypto.js';
import { ok, unauthorized, unprocessable, conflict } from '../utils/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateProfile(input) {
  const b = input && typeof input === 'object' ? input : {};
  const errors = {};
  const out = {};
  if (typeof b.current_password !== 'string' || b.current_password.length < 1 || b.current_password.length > 200) {
    errors.current_password = 'Current password is required';
  }
  if (b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (name.length < 2 || name.length > 100) errors.name = 'Name must be 2–100 characters';
    else out.name = name;
  }
  if (b.email !== undefined) {
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'A valid email address is required';
    else out.email = email;
  }
  if (b.new_password !== undefined && b.new_password !== '') {
    if (typeof b.new_password !== 'string' || b.new_password.length < 8 || b.new_password.length > 200) {
      errors.new_password = 'New password must be 8–200 characters';
    } else out.passwordHash = hashPassword(b.new_password);
  }
  if (Object.keys(errors).length) throw unprocessable(errors);
  if (out.name === undefined && out.email === undefined && out.passwordHash === undefined) {
    throw unprocessable({ profile: 'No changes were provided' });
  }
  return out;
}

export function registerAuthRoutes(r) {
  r.post('/api/auth/login', rateLimit('login'), async (req) => {
    const { email, password } = validateLogin(req.body);
    const admin = req.store.findAdminByEmail(email);
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      throw unauthorized('Invalid email or password');
    }
    req.store.rotateAdminNonce(admin.email);
    const freshAdmin = req.store.findAdminByEmail(admin.email);
    issueAuthCookie(req.res, { ...freshAdmin, tokenNonce: freshAdmin.token_nonce });
    return ok(req.res, { email: freshAdmin.email, name: freshAdmin.name, role: freshAdmin.role });
  });

  r.post('/api/auth/logout', requireAuth, async (req) => {
    req.store.rotateAdminNonce(req.admin.email);
    clearAuthCookie(req.res);
    return ok(req.res, { loggedOut: true });
  });

  r.get('/api/auth/me', requireAuth, async (req) => {
    return ok(req.res, req.admin);
  });

  r.patch('/api/auth/profile', requireAuth, async (req) => {
    const patch = validateProfile(req.body);
    const current = req.store.findAdminByEmail(req.admin.email);
    if (!current || !verifyPassword(req.body.current_password, current.passwordHash)) {
      throw unauthorized('Current password is incorrect');
    }
    try {
      const updated = req.store.updateAdmin(req.admin.email, {
        ...patch,
        rotateNonce: true,
      });
      if (!updated) throw unauthorized('Admin account not found');
      // The old session is intentionally invalidated by rotateNonce; issue a fresh one.
      issueAuthCookie(req.res, { ...updated, tokenNonce: updated.token_nonce });
      return ok(req.res, { email: updated.email, name: updated.name, role: updated.role, created_at: updated.created_at });
    } catch (err) {
      if (String(err?.message || '').includes('already exists')) throw conflict('An admin with that email already exists');
      throw err;
    }
  });
}
