import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const emptyData = () => ({
  meta: {},
  admins: [],
  enquiries: [],
  activities: [],
  enquiryTypes: [],
  businessSettings: {
    business_name: 'Enquiry Desk', business_description: '', contact_phone: '', contact_email: '',
    logo_url: '', accent_color: '#4f46e5', form_title: 'Send an enquiry',
    form_description: "Fill in the details below and we'll get back to you.", updated_at: null,
  },
});

const SORT_KEYS = {
  created_at: (e) => e.created_at,
  preferred_date: (e) => e.preferred_date || '9999-12-31',
  follow_up_date: (e) => e.follow_up_date || '9999-12-31',
  customer_name: (e) => (e.customer_name || '').toLowerCase(),
  status: (e) => e.status,
};
const OPEN_FOR_DUE = new Set(['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUOTED']);

export class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = emptyData();
  }

  init() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        this.data = { ...emptyData(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
      this.data.businessSettings = { ...emptyData().businessSettings, ...(this.data.businessSettings || {}) };
      if (!this.data.businessSettings.updated_at) this.data.businessSettings.updated_at = this.now();
      } catch {
        throw new Error(`Corrupt data file: ${this.file}`);
      }
    } else {
      this.data.businessSettings.updated_at = this.now();
      this._save();
    }
  }

  close() {}
  _save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file); // atomic replace
  }
  now() { return new Date().toISOString(); }
  today() { return new Date().toISOString().slice(0, 10); }

  // ---- admins ----
  createAdmin({ email, name, passwordHash, role = 'admin' }) {
    if (this.findAdminByEmail(email)) throw new Error('Admin with this email already exists');
    const admin = {
      id: (this.data.meta.nextAdminId = (this.data.meta.nextAdminId || 0) + 1),
      email: String(email).trim(), name, passwordHash, role,
      token_nonce: randomBytes(16).toString('hex'),
      created_at: this.now(),
    };
    this.data.admins.push(admin);
    this._save();
    return admin;
  }
  findAdminByEmail(email) {
    return this.data.admins.find((a) => a.email.toLowerCase() === String(email).toLowerCase()) || null;
  }
  rotateAdminNonce(email) {
    const a = this.data.admins.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
    if (!a) return;
    a.token_nonce = randomBytes(16).toString('hex');
    this._save();
  }
  updateAdmin(email, patch) {
    const a = this.data.admins.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
    if (!a) return null;
    const nextEmail = patch.email !== undefined ? String(patch.email).trim().toLowerCase() : a.email;
    const duplicate = this.data.admins.find((x) => x.email.toLowerCase() === nextEmail && x.id !== a.id);
    if (duplicate) throw new Error('Admin with this email already exists');
    if (patch.name !== undefined) a.name = String(patch.name).trim();
    if (patch.email !== undefined) a.email = nextEmail;
    if (patch.passwordHash !== undefined) a.passwordHash = patch.passwordHash;
    if (patch.rotateNonce) a.token_nonce = randomBytes(16).toString('hex');
    this._save();
    return { ...a };
  }
  countAdmins() { return this.data.admins.length; }

  // ---- enquiry types ----
  getEnquiryTypes() { return this.data.enquiryTypes.map((t) => ({ ...t })); }
  seedEnquiryTypes(types) {
    for (const t of types) {
      if (!this.data.enquiryTypes.some((x) => x.key === t.key)) this.data.enquiryTypes.push({ ...t });
    }
    this._save();
  }
  upsertEnquiryType({ key, label }) {
    const existing = this.data.enquiryTypes.find((t) => t.key === key);
    if (existing) existing.label = label; else this.data.enquiryTypes.push({ key, label });
    this._save();
    return { key, label };
  }
  deleteEnquiryType(key) {
    if (this.data.enquiries.some((e) => e.enquiry_type === key)) return false;
    const before = this.data.enquiryTypes.length;
    this.data.enquiryTypes = this.data.enquiryTypes.filter((t) => t.key !== key);
    if (this.data.enquiryTypes.length !== before) this._save();
    return this.data.enquiryTypes.length !== before;
  }
  getBusinessConfig() { return { ...this.data.businessSettings }; }
  updateBusinessConfig(patch) {
    this.data.businessSettings = { ...this.data.businessSettings, ...patch, updated_at: this.now() };
    this._save();
    return { ...this.data.businessSettings };
  }

  // ---- enquiries ----
  nextEnquiryId() {
    const year = new Date().getFullYear();
    const key = `seq_${year}`;
    this.data.meta[key] = (this.data.meta[key] || 0) + 1;
    return `ENQ-${year}-${String(this.data.meta[key]).padStart(6, '0')}`;
  }

  createEnquiry(fields) {
    const enquiry = {
      id: this.nextEnquiryId(),
      customer_name: fields.customer_name,
      phone: fields.phone,
      email: fields.email,
      enquiry_type: fields.enquiry_type,
      preferred_date: fields.preferred_date ?? null,
      preferred_time: fields.preferred_time ?? null,
      budget: fields.budget ?? null,
      message: fields.message,
      source: fields.source ?? null,
      custom_fields: fields.custom_fields ?? null,
      status: 'NEW',
      assigned_to: null,
      follow_up_date: null,
      archived: 0,
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.data.enquiries.push(enquiry);
    this._save();
    return { ...enquiry };
  }

  getEnquiry(id) {
    const e = this.data.enquiries.find((x) => x.id === id);
    return e ? { ...e } : null;
  }

  listEnquiries(f = {}) {
    let rows = this.data.enquiries.slice();
    if (!f.includeArchived) rows = rows.filter((e) => !e.archived);
    if (f.status && f.status !== 'all') rows = rows.filter((e) => e.status === f.status);
    if (f.dateFrom) rows = rows.filter((e) => e.created_at.slice(0, 10) >= f.dateFrom);
    if (f.dateTo) rows = rows.filter((e) => e.created_at.slice(0, 10) <= f.dateTo);
    if (f.followUpDue) {
      const today = this.today();
      rows = rows.filter((e) => e.follow_up_date && e.follow_up_date <= today && OPEN_FOR_DUE.has(e.status));
    }
    if (f.search) {
      const q = String(f.search).toLowerCase();
      rows = rows.filter((e) =>
        [e.customer_name, e.phone, e.email, e.message, e.id].some((v) => v && String(v).toLowerCase().includes(q)));
    }
    const keyFn = SORT_KEYS[f.sort] || SORT_KEYS.created_at;
    const dir = f.order === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = keyFn(a), vb = keyFn(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.id < b.id ? -1 : 1;
    });
    const total = rows.length;
    const page = Math.max(1, f.page || 1);
    const pageSize = Math.min(100, Math.max(1, f.pageSize || 20));
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map((e) => ({ ...e }));
    return { items, total, page, pageSize };
  }

  updateEnquiry(id, patch) {
    const e = this.data.enquiries.find((x) => x.id === id);
    if (!e) return null;
    Object.assign(e, patch, { updated_at: this.now() });
    this._save();
    return { ...e };
  }

  // ---- activities ----
  addActivity(a) {
    const row = {
      id: (this.data.meta.nextActivityId = (this.data.meta.nextActivityId || 0) + 1),
      enquiry_id: a.enquiry_id,
      action: a.action,
      from_status: a.from_status ?? null,
      to_status: a.to_status ?? null,
      note: a.note ?? null,
      created_by: a.created_by ?? 'system',
      created_at: this.now(),
    };
    this.data.activities.push(row);
    this._save();
    return { ...row };
  }

  listActivities(enquiryId) {
    return this.data.activities.filter((a) => a.enquiry_id === enquiryId).map((a) => ({ ...a }));
  }

  // ---- stats ----
  getStats() {
    const active = this.data.enquiries.filter((e) => !e.archived);
    const byStatus = {};
    for (const e of active) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    const today = this.today();
    const followUpsDue = active.filter((e) => e.follow_up_date && e.follow_up_date <= today && OPEN_FOR_DUE.has(e.status)).length;
    return { total: active.length, byStatus, followUpsDue };
  }
}
