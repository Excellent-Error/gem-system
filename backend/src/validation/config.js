import { unprocessable } from '../utils/http.js';
import { isEmail, isPhone, str } from './validate.js';

const KEY_RE = /^[a-z][a-z0-9_]{1,49}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function validateBusinessConfig(input) {
  const b = input && typeof input === 'object' ? input : {};
  const errors = {};
  const out = {};
  const text = (key, min, max) => {
    if (b[key] === undefined) return;
    if (b[key] === null || b[key] === '') { out[key] = ''; return; }
    const v = String(b[key]).trim();
    if (!str(v, min, max)) errors[key] = `Must be ${min}–${max} characters`;
    else out[key] = v;
  };
  text('business_name', 2, 120);
  text('business_description', 0, 500);
  text('contact_phone', 0, 30);
  if (b.contact_phone && !isPhone(String(b.contact_phone).trim())) errors.contact_phone = 'Invalid phone number';
  if (b.contact_email !== undefined) {
    if (b.contact_email === null || b.contact_email === '') out.contact_email = '';
    else if (!isEmail(String(b.contact_email).trim())) errors.contact_email = 'Invalid email address';
    else out.contact_email = String(b.contact_email).trim();
  }
  text('logo_url', 0, 500);
  if (b.logo_url && !/^https:\/\//i.test(String(b.logo_url).trim())) errors.logo_url = 'Logo URL must use HTTPS';
  if (b.accent_color !== undefined) {
    const v = String(b.accent_color).trim();
    if (!HEX_RE.test(v)) errors.accent_color = 'Accent color must be a 6-digit hex color';
    else out.accent_color = v.toLowerCase();
  }
  text('form_title', 2, 120);
  text('form_description', 0, 500);
  if (Object.keys(errors).length) throw unprocessable(errors);
  return out;
}

export function validateEnquiryType(input) {
  const b = input && typeof input === 'object' ? input : {};
  const errors = {};
  const key = typeof b.key === 'string' ? b.key.trim().toLowerCase() : '';
  const label = typeof b.label === 'string' ? b.label.trim() : '';
  if (!KEY_RE.test(key)) errors.key = 'Key must start with a letter and contain only lowercase letters, numbers and underscores';
  if (!str(label, 2, 100)) errors.label = 'Label must be 2–100 characters';
  if (Object.keys(errors).length) throw unprocessable(errors);
  return { key, label };
}
