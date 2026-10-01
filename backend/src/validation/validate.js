import { unprocessable } from '../utils/http.js';
import { STATUSES } from '../utils/constants.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NG_PHONE_RE = /^(?:0[789]\d{9}|234[789]\d{9}|\+234[789]\d{9})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isEmail(v) { return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v); }
export function normalizeNigerianPhone(v) {
  if (typeof v !== 'string') return '';
  const raw = v.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(raw)) return '';
  if (raw.startsWith('+234')) return raw.slice(1);
  return raw;
}

export function isPhone(v) {
  const normalized = normalizeNigerianPhone(v);
  return Boolean(normalized && NG_PHONE_RE.test(normalized));
}
export function isDateStr(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function isTimeStr(v) { return typeof v === 'string' && TIME_RE.test(v); }
export function str(v, min, max) {
  return typeof v === 'string' && v.trim().length >= min && v.length <= max;
}

// Validates + sanitizes a customer enquiry submission.
// `validTypes` = array of enquiry type keys configured for this business.
export function validateEnquirySubmission(input, validTypes) {
  const errors = {};
  const out = {};
  const b = input && typeof input === 'object' ? input : {};

  // Honeypot field: real users never see or fill this field. Bots commonly do.
  if (typeof b.website === 'string' && b.website.trim() !== '') {
    throw unprocessable({ form: 'Invalid submission' });
  }

  const name = typeof b.customer_name === 'string' ? b.customer_name.trim() : '';
  if (!str(name, 2, 100)) errors.customer_name = 'Full name is required (2–100 characters)';
  else out.customer_name = name;

  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  if (!isPhone(phone)) errors.phone = 'A valid phone number is required';
  else out.phone = phone;

  const email = typeof b.email === 'string' ? b.email.trim() : '';
  if (!isEmail(email)) errors.email = 'A valid email address is required';
  else out.email = email;

  const type = typeof b.enquiry_type === 'string' ? b.enquiry_type.trim() : '';
  if (!validTypes.includes(type)) errors.enquiry_type = 'Please choose a valid enquiry type';
  else out.enquiry_type = type;

  if (b.preferred_date === undefined || b.preferred_date === null || b.preferred_date === '') {
    // optional
  } else if (!isDateStr(b.preferred_date)) {
    errors.preferred_date = 'Preferred date must be a valid date (YYYY-MM-DD)';
  } else out.preferred_date = b.preferred_date;

  if (b.preferred_time === undefined || b.preferred_time === null || b.preferred_time === '') {
    // optional
  } else if (!isTimeStr(b.preferred_time)) {
    errors.preferred_time = 'Preferred time must be in HH:MM format';
  } else out.preferred_time = b.preferred_time;

  if (b.budget !== undefined && b.budget !== null && String(b.budget).trim() !== '') {
    const budget = String(b.budget).trim();
    if (budget.length > 100) errors.budget = 'Budget must be under 100 characters';
    else out.budget = budget;
  }

  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!str(message, 10, 5000)) errors.message = 'Please tell us a little more (10–5000 characters)';
  else out.message = message;

  if (b.source !== undefined && b.source !== null && String(b.source).trim() !== '') {
    const source = String(b.source).trim();
    if (source.length > 100) errors.source = 'Source must be under 100 characters';
    else out.source = source;
  }

  // Extension point: per-business custom fields (e.g. guest_count, preferred_stylist)
  if (b.custom_fields !== undefined && b.custom_fields !== null) {
    if (typeof b.custom_fields !== 'object' || Array.isArray(b.custom_fields)) {
      errors.custom_fields = 'Custom fields must be an object';
    } else {
      const keys = Object.keys(b.custom_fields);
      if (keys.length > 20) errors.custom_fields = 'Too many custom fields';
      else {
        const cf = {};
        let bad = false;
        for (const k of keys) {
          const v = b.custom_fields[k];
          if (typeof v !== 'string' || v.length > 500 || !/^[a-z0-9_]{1,50}$/.test(k)) { bad = true; break; }
          cf[k] = v;
        }
        if (bad) errors.custom_fields = 'Custom fields must be short string values';
        else if (keys.length) out.custom_fields = cf;
      }
    }
  }

  if (Object.keys(errors).length) throw unprocessable(errors);
  return out;
}

export function validateLogin(input) {
  const errors = {};
  const b = input && typeof input === 'object' ? input : {};
  if (!isEmail(b.email)) errors.email = 'A valid email address is required';
  if (typeof b.password !== 'string' || b.password.length < 1 || b.password.length > 200) errors.password = 'Password is required';
  if (Object.keys(errors).length) throw unprocessable(errors);
  return { email: String(b.email).trim(), password: b.password };
}

export function validateEnquiryPatch(input, validTypes) {
  const errors = {};
  const out = {};
  const b = input && typeof input === 'object' ? input : {};

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) errors.status = 'Invalid status';
    else out.status = b.status;
  }
  if (b.follow_up_date !== undefined) {
    if (b.follow_up_date === null || b.follow_up_date === '') out.follow_up_date = null;
    else if (!isDateStr(b.follow_up_date)) errors.follow_up_date = 'Follow-up date must be YYYY-MM-DD';
    else out.follow_up_date = b.follow_up_date;
  }
  if (b.assigned_to !== undefined) {
    if (b.assigned_to === null || b.assigned_to === '') out.assigned_to = null;
    else if (!str(String(b.assigned_to), 1, 100)) errors.assigned_to = 'Assignee must be under 100 characters';
    else out.assigned_to = String(b.assigned_to).trim();
  }
  if (b.customer_name !== undefined) {
    const v = String(b.customer_name).trim();
    if (!str(v, 2, 100)) errors.customer_name = 'Name must be 2–100 characters'; else out.customer_name = v;
  }
  if (b.phone !== undefined) { if (!isPhone(String(b.phone).trim())) errors.phone = 'Invalid phone'; else out.phone = String(b.phone).trim(); }
  if (b.email !== undefined) { if (!isEmail(String(b.email).trim())) errors.email = 'Invalid email'; else out.email = String(b.email).trim(); }
  if (b.enquiry_type !== undefined) { if (!validTypes.includes(b.enquiry_type)) errors.enquiry_type = 'Invalid enquiry type'; else out.enquiry_type = b.enquiry_type; }
  if (b.preferred_date !== undefined) {
    if (b.preferred_date === null || b.preferred_date === '') out.preferred_date = null;
    else if (!isDateStr(b.preferred_date)) errors.preferred_date = 'Invalid date'; else out.preferred_date = b.preferred_date;
  }
  if (b.preferred_time !== undefined) {
    if (b.preferred_time === null || b.preferred_time === '') out.preferred_time = null;
    else if (!isTimeStr(b.preferred_time)) errors.preferred_time = 'Invalid time'; else out.preferred_time = b.preferred_time;
  }
  if (b.budget !== undefined) {
    if (b.budget === null || b.budget === '') out.budget = null;
    else if (String(b.budget).length > 100) errors.budget = 'Too long'; else out.budget = String(b.budget).trim();
  }
  if (b.source !== undefined) {
    if (b.source === null || b.source === '') out.source = null;
    else if (String(b.source).length > 100) errors.source = 'Too long'; else out.source = String(b.source).trim();
  }
  if (b.message !== undefined) {
    const v = String(b.message).trim();
    if (!str(v, 10, 5000)) errors.message = 'Message must be 10–5000 characters'; else out.message = v;
  }
  if (b.custom_fields !== undefined) {
    if (b.custom_fields === null) out.custom_fields = null;
    else if (typeof b.custom_fields === 'object' && !Array.isArray(b.custom_fields)) {
      const cf = {}; let bad = false;
      for (const [k, v] of Object.entries(b.custom_fields)) {
        if (typeof v !== 'string' || v.length > 500 || !/^[a-z0-9_]{1,50}$/.test(k)) { bad = true; break; }
        cf[k] = v;
      }
      if (bad) errors.custom_fields = 'Invalid custom fields'; else out.custom_fields = cf;
    } else errors.custom_fields = 'Invalid custom fields';
  }

  if (Object.keys(errors).length) throw unprocessable(errors);
  return out;
}

export function validateNote(input) {
  const b = input && typeof input === 'object' ? input : {};
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (!str(note, 1, 2000)) throw unprocessable({ note: 'Note must be 1–2000 characters' });
  return { note };
}
