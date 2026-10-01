import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { SOURCES } from '../utils/constants';
import { Spinner } from '../components/ui';

const initial = {
  customer_name: '', phone: '', email: '', enquiry_type: '',
  preferred_date: '', preferred_time: '', budget: '', message: '', source: '', website: '',
};

export default function CustomerForm() {
  const [types, setTypes] = useState([]);
  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    Promise.all([api('/api/enquiry-types'), api('/api/business-config')]).then(([t, cfg]) => { setTypes(t); setBusiness(cfg); }).catch(() => setFormError('Could not load the form. Please refresh the page.'));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setSubmitting(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      payload.website = form.website;
      const data = await api('/api/enquiries', { method: 'POST', body: payload });
      setSubmitted(data);
    } catch (err) {
      if (err.details) setErrors(err.details);
      setFormError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
          <h1 className="text-xl font-semibold text-slate-900">Enquiry received</h1>
          <p className="mt-2 text-sm text-slate-600">
            Thank you, {submitted.customer_name}. Your reference is{' '}
            <span className="font-mono font-semibold text-slate-900">{submitted.id}</span>. We'll be in touch shortly.
          </p>
          <button className="btn-secondary mt-6" onClick={() => { setSubmitted(null); setForm(initial); }}>
            Make another enquiry
          </button>
        </div>
      </div>
    );
  }

  const err = (k) => (errors[k] ? <p className="mt-1 text-xs text-rose-600">{errors[k]}</p> : null);
  const cls = (k) => `input ${errors[k] ? 'input-error' : ''}`;

  return (
    <div className="min-h-screen bg-slate-50 py-10" style={{ "--gem-accent": business?.accent_color || "#4f46e5" }}>
      <div className="mx-auto max-w-xl px-4">
        <div className="mb-8 text-center">
          {business?.logo_url && <img src={business.logo_url} alt={business.business_name || 'Business logo'} className="mx-auto mb-4 h-16 max-w-48 object-contain" />}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{business?.business_name || 'Enquiry Desk'}</h1>
          {business?.business_description && <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{business.business_description}</p>}
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">{business?.form_title || 'Send an enquiry'}</h2>
          <p className="mt-1 text-sm text-slate-500">{business?.form_description || "Fill in the details below and we'll get back to you."}</p>
        </div>
        <form onSubmit={onSubmit} noValidate className="card space-y-5 p-6">
          {formError && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
          <div>
            <label className="label" htmlFor="customer_name">Full name *</label>
            <input id="customer_name" className={cls('customer_name')} value={form.customer_name} onChange={set('customer_name')} />
            {err('customer_name')}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="phone">Phone number *</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={17} placeholder="e.g. 0801 234 5678" className={cls('phone')} value={form.phone} onChange={set('phone')} />
              {err('phone')}
            </div>
            <div>
              <label className="label" htmlFor="email">Email *</label>
              <input id="email" type="email" className={cls('email')} value={form.email} onChange={set('email')} />
              {err('email')}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="enquiry_type">Enquiry type *</label>
              <select id="enquiry_type" className={cls('enquiry_type')} value={form.enquiry_type} onChange={set('enquiry_type')}>
                <option value="">Select…</option>
                {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {err('enquiry_type')}
            </div>
            <div>
              <label className="label" htmlFor="source">How did you hear about us?</label>
              <select id="source" className={cls('source')} value={form.source} onChange={set('source')}>
                <option value="">Select…</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="preferred_date">Preferred date</label>
              <input id="preferred_date" type="date" className={cls('preferred_date')} value={form.preferred_date} onChange={set('preferred_date')} />
              {err('preferred_date')}
            </div>
            <div>
              <label className="label" htmlFor="preferred_time">Preferred time</label>
              <input id="preferred_time" type="time" className={cls('preferred_time')} value={form.preferred_time} onChange={set('preferred_time')} />
              {err('preferred_time')}
            </div>
            <div>
              <label className="label" htmlFor="budget">Budget (optional)</label>
              <input id="budget" className={cls('budget')} placeholder="e.g. ₦500,000–₦1,000,000" value={form.budget} onChange={set('budget')} />
              {err('budget')}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="message">Message *</label>
            <textarea id="message" rows={5} className={cls('message')} value={form.message} onChange={set('message')} />
            {err('message')}
          </div>
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
          </div>
          <button type="submit" className="btn-primary w-full" style={{ backgroundColor: "var(--gem-accent)" }} disabled={submitting}>
            {submitting && <Spinner />} {submitting ? 'Sending…' : 'Submit enquiry'}
          </button>
        </form>
      </div>
    </div>
  );
}
