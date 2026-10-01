import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const OPEN_FOR_DUE = "'NEW','CONTACTED','FOLLOW_UP','QUOTED'";
const SORT_COLS = { created_at: 'created_at', preferred_date: 'preferred_date', follow_up_date: 'follow_up_date', customer_name: 'customer_name', status: 'status' };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  token_nonce TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  enquiry_type TEXT NOT NULL,
  preferred_date TEXT,
  preferred_time TEXT,
  budget TEXT,
  message TEXT NOT NULL,
  source TEXT,
  custom_fields TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  assigned_to TEXT,
  follow_up_date TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_followup ON enquiries(follow_up_date);
CREATE TABLE IF NOT EXISTS enquiry_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_enquiry ON enquiry_activities(enquiry_id);
CREATE TABLE IF NOT EXISTS enquiry_types (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'Enquiry Desk',
  business_description TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  accent_color TEXT NOT NULL DEFAULT '#4f46e5',
  form_title TEXT NOT NULL DEFAULT 'Send an enquiry',
  form_description TEXT NOT NULL DEFAULT 'Fill in the details below and we will get back to you.',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
`;

const rowToEnquiry = (r) => ({
  ...r,
  archived: !!r.archived,
  custom_fields: r.custom_fields ? JSON.parse(r.custom_fields) : null,
});
const rowToActivity = (r) => ({ ...r });
const rowToType = (r) => ({ key: r.key, label: r.label });

export class SqliteStore {
  constructor(file) {
    this.file = file;
  }

  init() {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch {
      throw new Error(
        'DB_DRIVER=sqlite requires Node.js >= 22.5 (built-in node:sqlite). ' +
        'Upgrade Node, or set DB_DRIVER=json for development.'
      );
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    // lightweight migration: add token_nonce to pre-existing admins tables
    const cols = this.db.prepare('PRAGMA table_info(admins)').all().map((c) => c.name);
    if (!cols.includes('token_nonce')) {
      this.db.exec("ALTER TABLE admins ADD COLUMN token_nonce TEXT NOT NULL DEFAULT ''");
    }
    this.db.prepare(
      `INSERT INTO counters(name, value) VALUES('admin', 0)
       ON CONFLICT(name) DO NOTHING`
    ).run();
    this.db.prepare(`INSERT INTO business_settings(id, updated_at) VALUES(1, ?) ON CONFLICT(id) DO NOTHING`).run(this.now());
  }

  close() { if (this.db) this.db.close(); }
  now() { return new Date().toISOString(); }
  today() { return new Date().toISOString().slice(0, 10); }

  bumpCounter(name) {
    this.db.prepare('UPDATE counters SET value = value + 1 WHERE name = ?').run(name);
    return this.db.prepare('SELECT value FROM counters WHERE name = ?').get(name).value;
  }

  // ---- admins ----
  createAdmin({ email, name, passwordHash, role = 'admin' }) {
    if (this.findAdminByEmail(email)) throw new Error('Admin with this email already exists');
    const id = this.bumpCounter('admin');
    this.db.prepare('INSERT INTO admins(id, email, name, password_hash, role, token_nonce, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, String(email).trim(), name, passwordHash, role, randomBytes(16).toString('hex'), this.now());
    return this.findAdminByEmail(email);
  }
  findAdminByEmail(email) {
    const r = this.db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).toLowerCase());
    return r ? { id: r.id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash, token_nonce: r.token_nonce, created_at: r.created_at } : null;
  }
  rotateAdminNonce(email) {
    this.db.prepare('UPDATE admins SET token_nonce = ? WHERE email = ?')
      .run(randomBytes(16).toString('hex'), String(email).toLowerCase());
  }
  updateAdmin(email, patch) {
    const current = this.findAdminByEmail(email);
    if (!current) return null;
    const nextEmail = patch.email !== undefined ? String(patch.email).trim().toLowerCase() : current.email;
    const nextName = patch.name !== undefined ? String(patch.name).trim() : current.name;
    const nextPasswordHash = patch.passwordHash !== undefined ? patch.passwordHash : current.passwordHash;
    const nextNonce = patch.rotateNonce ? randomBytes(16).toString('hex') : current.token_nonce;
    try {
      this.db.prepare('UPDATE admins SET email=?, name=?, password_hash=?, token_nonce=? WHERE id=?')
        .run(nextEmail, nextName, nextPasswordHash, nextNonce, current.id);
    } catch (err) {
      if (String(err?.message || '').includes('UNIQUE')) throw new Error('Admin with this email already exists');
      throw err;
    }
    return this.findAdminByEmail(nextEmail);
  }
  countAdmins() { return this.db.prepare('SELECT COUNT(*) c FROM admins').get().c; }

  // ---- enquiry types ----
  getEnquiryTypes() { return this.db.prepare('SELECT * FROM enquiry_types ORDER BY rowid').all().map(rowToType); }
  seedEnquiryTypes(types) {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO enquiry_types(key, label) VALUES (?, ?)');
    for (const t of types) stmt.run(t.key, t.label);
  }
  upsertEnquiryType({ key, label }) {
    this.db.prepare('INSERT INTO enquiry_types(key, label) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET label=excluded.label').run(key, label);
    return this.db.prepare('SELECT * FROM enquiry_types WHERE key = ?').get(key);
  }
  deleteEnquiryType(key) {
    const used = this.db.prepare('SELECT COUNT(*) c FROM enquiries WHERE enquiry_type = ?').get(key).c;
    if (used > 0) return false;
    return this.db.prepare('DELETE FROM enquiry_types WHERE key = ?').run(key).changes > 0;
  }
  getBusinessConfig() {
    const r = this.db.prepare('SELECT * FROM business_settings WHERE id = 1').get();
    return r ? { ...r } : null;
  }
  updateBusinessConfig(patch) {
    const current = this.getBusinessConfig();
    const merged = { ...current, ...patch, id: 1, updated_at: this.now() };
    this.db.prepare(`UPDATE business_settings SET business_name=?, business_description=?, contact_phone=?, contact_email=?, logo_url=?, accent_color=?, form_title=?, form_description=?, updated_at=? WHERE id=1`).run(merged.business_name, merged.business_description, merged.contact_phone, merged.contact_email, merged.logo_url, merged.accent_color, merged.form_title, merged.form_description, merged.updated_at);
    return this.getBusinessConfig();
  }

  // ---- enquiries ----
  nextEnquiryId() {
    const year = new Date().getFullYear();
    const name = `enq_${year}`;
    this.db.prepare('INSERT INTO counters(name, value) VALUES(?, 0) ON CONFLICT(name) DO NOTHING').run(name);
    const seq = this.bumpCounter(name);
    return `ENQ-${year}-${String(seq).padStart(6, '0')}`;
  }

  createEnquiry(f) {
    const id = this.nextEnquiryId();
    const now = this.now();
    this.db.prepare(`INSERT INTO enquiries(
        id, customer_name, phone, email, enquiry_type, preferred_date, preferred_time,
        budget, message, source, custom_fields, status, assigned_to, follow_up_date,
        archived, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`).run(
      id, f.customer_name, f.phone, f.email, f.enquiry_type, f.preferred_date ?? null,
      f.preferred_time ?? null, f.budget ?? null, f.message, f.source ?? null,
      f.custom_fields ? JSON.stringify(f.custom_fields) : null, 'NEW', null, null, now, now);
    return this.getEnquiry(id);
  }

  getEnquiry(id) {
    const r = this.db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
    return r ? rowToEnquiry(r) : null;
  }

  listEnquiries(f = {}) {
    const where = [];
    const params = [];
    if (!f.includeArchived) { where.push('archived = 0'); }
    if (f.status && f.status !== 'all') { where.push('status = ?'); params.push(f.status); }
    if (f.dateFrom) { where.push("date(created_at) >= date(?)"); params.push(f.dateFrom); }
    if (f.dateTo) { where.push("date(created_at) <= date(?)"); params.push(f.dateTo); }
    if (f.followUpDue) {
      where.push(`follow_up_date IS NOT NULL AND follow_up_date <= date('now') AND status IN (${OPEN_FOR_DUE})`);
    }
    if (f.search) {
      where.push(`(customer_name LIKE ? OR phone LIKE ? OR email LIKE ? OR message LIKE ? OR id = ?)`);
      const q = `%${String(f.search).replace(/[%_]/g, '')}%`;
      params.push(q, q, q, q, String(f.search));
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) c FROM enquiries ${whereSql}`).get(...params).c;

    const sortCol = SORT_COLS[f.sort] || 'created_at';
    const dir = f.order === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, f.page || 1);
    const pageSize = Math.min(100, Math.max(1, f.pageSize || 20));
    const rows = this.db.prepare(
      `SELECT * FROM enquiries ${whereSql}
       ORDER BY ${sortCol} ${dir}, id ASC
       LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    return { items: rows.map(rowToEnquiry), total, page, pageSize };
  }

  updateEnquiry(id, patch) {
    const current = this.getEnquiry(id);
    if (!current) return null;
    const merged = { ...current, ...patch, custom_fields: patch.custom_fields !== undefined ? patch.custom_fields : current.custom_fields, updated_at: this.now() };
    this.db.prepare(`UPDATE enquiries SET
        customer_name=?, phone=?, email=?, enquiry_type=?, preferred_date=?, preferred_time=?,
        budget=?, message=?, source=?, custom_fields=?, status=?, assigned_to=?, follow_up_date=?,
        archived=?, updated_at=? WHERE id=?`).run(
      merged.customer_name, merged.phone, merged.email, merged.enquiry_type,
      merged.preferred_date, merged.preferred_time, merged.budget, merged.message,
      merged.source, merged.custom_fields ? JSON.stringify(merged.custom_fields) : null,
      merged.status, merged.assigned_to, merged.follow_up_date, merged.archived ? 1 : 0, merged.updated_at, id);
    return this.getEnquiry(id);
  }

  // ---- activities ----
  addActivity(a) {
    this.db.prepare(`INSERT INTO enquiry_activities(enquiry_id, action, from_status, to_status, note, created_by, created_at)
      VALUES (?,?,?,?,?,?,?)`).run(a.enquiry_id, a.action, a.from_status ?? null, a.to_status ?? null, a.note ?? null, a.created_by ?? 'system', this.now());
    const r = this.db.prepare('SELECT * FROM enquiry_activities ORDER BY id DESC LIMIT 1').get();
    return rowToActivity(r);
  }

  listActivities(enquiryId) {
    return this.db.prepare('SELECT * FROM enquiry_activities WHERE enquiry_id = ? ORDER BY created_at ASC, id ASC').all(enquiryId).map(rowToActivity);
  }

  // ---- stats ----
  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) c FROM enquiries WHERE archived = 0').get().c;
    const byStatusRows = this.db.prepare('SELECT status, COUNT(*) c FROM enquiries WHERE archived = 0 GROUP BY status').all();
    const byStatus = Object.fromEntries(byStatusRows.map((r) => [r.status, r.c]));
    const followUpsDue = this.db.prepare(
      `SELECT COUNT(*) c FROM enquiries WHERE archived = 0 AND follow_up_date IS NOT NULL
       AND follow_up_date <= date('now') AND status IN (${OPEN_FOR_DUE})`).get().c;
    return { total, byStatus, followUpsDue };
  }
}
