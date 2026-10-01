import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --- env must be set before importing the app ---
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-test-'));
process.env.DB_DRIVER = 'json';
process.env.DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.PUBLIC_RATE_LIMIT_MAX = '20';
process.env.JWT_SECRET = 'test-secret-key';

const { startServer } = await import('../src/server.js');
const { hashPassword, verifyPassword } = await import('../src/utils/crypto.js');
const { signJwt, verifyJwt } = await import('../src/utils/jwt.js');
const { isEmail, isPhone, isDateStr } = await import('../src/validation/validate.js');

let server, app, base, adminCookie;

const json = async (res) => {
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
};

before(async () => {
  ({ server, app } = await startServer(0, '127.0.0.1'));
  base = `http://127.0.0.1:${server.address().port}`;
  app.store.createAdmin({ email: 'admin@test.dev', name: 'Test Admin', passwordHash: hashPassword('supersecret1') });
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const validEnquiry = {
  customer_name: 'Jane Customer',
  phone: '0801 234 5678',
  email: 'jane@example.com',
  enquiry_type: 'quote',
  preferred_date: '2026-12-01',
  preferred_time: '14:30',
  budget: '₦500,000 - ₦1,000,000',
  message: 'I would like a quote for your services please.',
  source: 'Google',
};

// ---------- unit: crypto ----------
test('scrypt password hashing round-trips and rejects wrong passwords', () => {
  const h = hashPassword('hunter22');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(verifyPassword('hunter22', h));
  assert.ok(!verifyPassword('hunter23', h));
  assert.ok(!verifyPassword('hunter22', 'garbage'));
});

// ---------- unit: jwt ----------
test('JWT sign/verify round-trip, tamper and expiry detection', () => {
  const token = signJwt({ email: 'a@b.c' }, 'secret', 60);
  assert.equal(verifyJwt(token, 'secret').email, 'a@b.c');
  assert.equal(verifyJwt(token + 'x', 'secret'), null);
  assert.equal(verifyJwt(token, 'wrong'), null);
  const expired = signJwt({ email: 'a@b.c' }, 'secret', -10);
  assert.equal(verifyJwt(expired, 'secret'), null);
});

// ---------- unit: validators ----------
test('validators accept/reject edge cases', () => {
  assert.ok(isEmail('a@b.co'));
  assert.ok(!isEmail('not-an-email'));
  assert.ok(isPhone('0801 234 5678'));
  assert.ok(isPhone('+234 801 234 5678'));
  assert.equal(isPhone('1234567'), false);
  assert.ok(!isPhone('abc'));
  assert.ok(isDateStr('2026-02-28'));
  assert.ok(!isDateStr('2026-02-30'));
  assert.ok(!isDateStr('28/02/2026'));
});

// ---------- health ----------
test('GET /api/health responds', async () => {
  const r = await json(await fetch(`${base}/api/health`));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'up');
});

// ---------- public enquiry types ----------
test('GET /api/enquiry-types returns configured types', async () => {
  const r = await json(await fetch(`${base}/api/enquiry-types`));
  assert.equal(r.status, 200);
  assert.ok(r.body.data.some((t) => t.key === 'quote'));
});

// ---------- customer flow ----------
test('customer submits enquiry → stored with ID + created activity', async () => {
  const r = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validEnquiry),
  }));
  assert.equal(r.status, 201);
  assert.match(r.body.data.id, /^ENQ-\d{4}-\d{6}$/);
  assert.equal(r.body.data.customer_name, 'Jane Customer');
  // internal fields never exposed publicly
  assert.equal(r.body.data.status, undefined);
  assert.equal(r.body.data.message, undefined);

  const stored = app.store.getEnquiry(r.body.data.id);
  assert.equal(stored.status, 'NEW');
  assert.equal(stored.message, validEnquiry.message);
  const acts = app.store.listActivities(r.body.data.id);
  assert.equal(acts[0].action, 'created');
  assert.equal(acts[0].created_by, 'customer');
});

test('invalid submissions are rejected with field-level errors (422)', async () => {
  const r = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_name: 'X', email: 'bad', phone: 'nope', enquiry_type: 'hacked', message: 'short' }),
  }));
  assert.equal(r.status, 422);
  assert.equal(r.body.ok, false);
  for (const f of ['customer_name', 'email', 'phone', 'enquiry_type', 'message']) {
    assert.ok(r.body.error.details[f], `expected error for ${f}`);
  }
});

test('malformed JSON body rejected (400)', async () => {
  const r = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
  }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'bad_request');
});

// ---------- auth ----------
test('unauthorized access to admin endpoints is blocked (401)', async () => {
  const r = await json(await fetch(`${base}/api/enquiries`));
  assert.equal(r.status, 401);
  const r2 = await json(await fetch(`${base}/api/enquiries/ENQ-2026-000001`));
  assert.equal(r2.status, 401);
});

test('login rejects wrong password with generic message', async () => {
  const r = await json(await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.dev', password: 'wrongpass' }),
  }));
  assert.equal(r.status, 401);
  assert.equal(r.body.error.message, 'Invalid email or password');
});


test('valid login sets httpOnly cookie; /me returns profile', async () => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.dev', password: 'supersecret1' }),
  });
  assert.equal(r.status, 200);
  const setCookie = r.headers.get('set-cookie');
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('SameSite=Lax'));
  adminCookie = setCookie.split(';')[0];

  const me = await json(await fetch(`${base}/api/auth/me`, { headers: { Cookie: adminCookie } }));
  assert.equal(me.status, 200);
  assert.equal(me.body.data.email, 'admin@test.dev');
});

test('login with invalid payload returns 422 field errors', async () => {
  const r = await json(await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nope' }),
  }));
  assert.equal(r.status, 422);
  assert.ok(r.body.error.details.email);
  assert.ok(r.body.error.details.password);
});

const authed = (path, opts = {}) => fetch(`${base}${path}`, {
  headers: { Cookie: adminCookie, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  ...opts,
});



test('business configuration can be read publicly and updated by admin', async () => {
  const publicConfig = await json(await fetch(`${base}/api/business-config`));
  assert.equal(publicConfig.status, 200);
  assert.equal(publicConfig.body.data.business_name, 'Enquiry Desk');

  const updated = await json(await authed('/api/business-config', {
    method: 'PATCH', body: JSON.stringify({ business_name: 'Test Business', form_title: 'Contact Test Business' }),
  }));
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.business_name, 'Test Business');
  assert.equal(updated.body.data.form_title, 'Contact Test Business');
});

test('admin can create, rename and delete an unused enquiry type', async () => {
  const created = await json(await authed('/api/enquiry-types', {
    method: 'POST', body: JSON.stringify({ key: 'wedding', label: 'Wedding booking' }),
  }));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.label, 'Wedding booking');

  const renamed = await json(await authed('/api/enquiry-types/wedding', {
    method: 'PATCH', body: JSON.stringify({ label: 'Wedding enquiry' }),
  }));
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.label, 'Wedding enquiry');

  const deleted = await json(await authed('/api/enquiry-types/wedding', { method: 'DELETE' }));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
});

// ---------- admin flow ----------
let enquiryId;

test('admin lists enquiries with stats-relevant data', async () => {
  const r = await json(await authed('/api/enquiries'));
  assert.equal(r.status, 200);
  assert.ok(r.body.data.total >= 1);
  enquiryId = r.body.data.items[0].id;
  assert.equal(r.body.data.items[0].status, 'NEW');
});

test('stats endpoint returns per-status counts', async () => {
  const r = await json(await authed('/api/stats'));
  assert.equal(r.status, 200);
  assert.ok(r.body.data.total >= 1);
  assert.ok(r.body.data.byStatus.NEW >= 1);
});

test('admin views enquiry detail with activity history', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}`));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.id, enquiryId);
  assert.ok(Array.isArray(r.body.data.activities));
  assert.ok(r.body.data.activities.some((a) => a.action === 'created'));
});

test('nonexistent enquiry returns 404', async () => {
  const r = await json(await authed('/api/enquiries/ENQ-2099-999999'));
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'not_found');
});

test('admin changes status → activity recorded with from/to', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'CONTACTED' }),
  }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'CONTACTED');

  const detail = await json(await authed(`/api/enquiries/${enquiryId}`));
  const sc = detail.body.data.activities.find((a) => a.action === 'status_changed');
  assert.ok(sc);
  assert.equal(sc.from_status, 'NEW');
  assert.equal(sc.to_status, 'CONTACTED');
  assert.equal(sc.created_by, 'admin@test.dev');
});

test('invalid status rejected (422)', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'HACKED' }),
  }));
  assert.equal(r.status, 422);
});

test('admin schedules follow-up → follow_up_scheduled activity; follow-up appears in due filter', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const r = await json(await authed(`/api/enquiries/${enquiryId}`, {
    method: 'PATCH', body: JSON.stringify({ follow_up_date: today }),
  }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.follow_up_date, today);

  const due = await json(await authed('/api/enquiries?follow_up_due=true'));
  assert.ok(due.body.data.items.some((e) => e.id === enquiryId));

  const detail = await json(await authed(`/api/enquiries/${enquiryId}`));
  assert.ok(detail.body.data.activities.some((a) => a.action === 'follow_up_scheduled'));
});

test('completing follow-up clears date and logs completion', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}/follow-up/complete`, { method: 'POST' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.follow_up_date, null);
  const detail = await json(await authed(`/api/enquiries/${enquiryId}`));
  assert.ok(detail.body.data.activities.some((a) => a.action === 'follow_up_completed'));
});

test('completing follow-up twice is a conflict (409)', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}/follow-up/complete`, { method: 'POST' }));
  assert.equal(r.status, 409);
});

test('admin adds internal note → note_added activity (not visible publicly)', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}/notes`, {
    method: 'POST', body: JSON.stringify({ note: 'Called the customer, wants a callback Friday.' }),
  }));
  assert.equal(r.status, 201);
  assert.equal(r.body.data.action, 'note_added');

  const pub = await json(await fetch(`${base}/api/enquiries/${enquiryId}`));
  assert.equal(pub.status, 401); // notes only reachable through authenticated endpoints
});

test('admin edits customer details → updated activity with changed fields', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}`, {
    method: 'PATCH', body: JSON.stringify({ customer_name: 'Jane M. Customer', budget: '₦1,000,000+' }),
  }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.customer_name, 'Jane M. Customer');
  const detail = await json(await authed(`/api/enquiries/${enquiryId}`));
  const upd = detail.body.data.activities.find((a) => a.action === 'updated');
  assert.ok(upd);
  assert.match(upd.note, /name/);
  assert.match(upd.note, /budget/);
});

test('search and status filters work', async () => {
  const s = await json(await authed('/api/enquiries?search=jane%20m.'));
  assert.ok(s.body.data.items.some((e) => e.id === enquiryId));
  const st = await json(await authed('/api/enquiries?status=CONTACTED'));
  assert.ok(st.body.data.items.every((e) => e.status === 'CONTACTED'));
  const none = await json(await authed('/api/enquiries?status=WON'));
  assert.equal(none.body.data.items.length, 0);
});

test('pagination shape is correct', async () => {
  const r = await json(await authed('/api/enquiries?page=1&page_size=1'));
  assert.equal(r.body.data.items.length, 1);
  assert.equal(r.body.data.pageSize, 1);
  assert.ok(r.body.data.total >= 1);
});

test('archiving removes from default list, blocks further edits, preserves history', async () => {
  const r = await json(await authed(`/api/enquiries/${enquiryId}/archive`, { method: 'POST' }));
  assert.equal(r.status, 200);

  const list = await json(await authed('/api/enquiries'));
  assert.ok(!list.body.data.items.some((e) => e.id === enquiryId));

  const detail = await json(await authed(`/api/enquiries/${enquiryId}`));
  assert.equal(detail.status, 404);

  const patch = await json(await authed(`/api/enquiries/${enquiryId}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'WON' }),
  }));
  assert.equal(patch.status, 404);

  // history preserved in store
  const acts = app.store.listActivities(enquiryId);
  assert.ok(acts.some((a) => a.action === 'archived'));
  assert.ok(acts.some((a) => a.action === 'created'));
});

test('custom fields persist (reusability extension point)', async () => {
  const r = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: 'Event Planner', phone: '0802 345 6789', email: 'ep@example.com',
      enquiry_type: 'booking', message: 'Looking to book your venue for 200 guests.',
      custom_fields: { guest_count: '200', event_type: 'wedding' },
    }),
  }));
  assert.equal(r.status, 201);
  const stored = app.store.getEnquiry(r.body.data.id);
  assert.equal(stored.custom_fields.guest_count, '200');
});

test('logout clears session; subsequent requests are unauthorized', async () => {
  const r = await json(await authed('/api/auth/logout', { method: 'POST' }));
  assert.equal(r.status, 200);
  const afterLogout = await json(await fetch(`${base}/api/enquiries`, {
    headers: { Cookie: adminCookie },
  }));
  assert.equal(afterLogout.status, 401);
});

test('CORS: disallowed origin gets no ACAO header; allowed origin does', async () => {
  const dis = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(dis.headers.get('access-control-allow-origin'), null);
  const allow = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allow.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('security headers present', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('public submission blocks honeypot and immediate duplicate submissions', async () => {
  const honeypot = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validEnquiry, email: 'bot@example.com', website: 'https://spam.example' }),
  }));
  assert.equal(honeypot.status, 422);

  const first = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validEnquiry, email: 'duplicate@example.com' }),
  }));
  assert.equal(first.status, 201);

  const duplicate = await json(await fetch(`${base}/api/enquiries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validEnquiry, email: 'duplicate@example.com' }),
  }));
  assert.equal(duplicate.status, 409);
});

test('public submission endpoint is rate limited (429 after limit)', async () => {
  let last;
  for (let i = 0; i < 21; i++) {
    last = await json(await fetch(`${base}/api/enquiries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validEnquiry, email: `spam${i}@example.com` }),
    }));
  }
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});
