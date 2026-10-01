import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Spinner } from '../components/ui';

const emptyForm = {
  business_name: '', business_description: '', contact_phone: '', contact_email: '',
  logo_url: '', accent_color: '#4f46e5', form_title: 'Send an enquiry', form_description: '',
};

export default function Settings() {
  const [config, setConfig] = useState(emptyForm);
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [newType, setNewType] = useState({ key: '', label: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [cfg, t] = await Promise.all([api('/api/business-config'), api('/api/enquiry-types')]);
      setConfig(cfg); setForm(cfg); setTypes(t);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault(); setSaving(true); setMessage(''); setError('');
    try { const saved = await api('/api/business-config', { method: 'PATCH', body: form }); setConfig(saved); setForm(saved); setMessage('Business settings saved.'); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function addType(e) {
    e.preventDefault(); setError(''); setMessage('');
    try { const created = await api('/api/enquiry-types', { method: 'POST', body: newType }); setTypes((t) => [...t, created]); setNewType({ key: '', label: '' }); setMessage('Enquiry type added.'); }
    catch (e) { setError(e.message); }
  }

  async function renameType(type) {
    const label = window.prompt('New label', type.label);
    if (label === null || label.trim() === '' || label.trim() === type.label) return;
    try { const updated = await api(`/api/enquiry-types/${encodeURIComponent(type.key)}`, { method: 'PATCH', body: { label } }); setTypes((items) => items.map((x) => x.key === type.key ? updated : x)); setMessage('Enquiry type updated.'); }
    catch (e) { setError(e.message); }
  }

  async function removeType(type) {
    if (!window.confirm(`Delete “${type.label}”? This is only possible if no existing enquiry uses it.`)) return;
    try { await api(`/api/enquiry-types/${encodeURIComponent(type.key)}`, { method: 'DELETE' }); setTypes((items) => items.filter((x) => x.key !== type.key)); setMessage('Enquiry type deleted.'); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="flex justify-center py-20 text-slate-400"><Spinner className="h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold text-slate-900">Business settings</h1><p className="mt-1 text-sm text-slate-500">Configure the identity and enquiry options used by your customer form.</p></div>
      {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <form onSubmit={save} className="card space-y-5 p-6">
        <div><h2 className="font-semibold text-slate-900">Business identity</h2><p className="mt-1 text-sm text-slate-500">These details appear on the public enquiry form.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business name" value={form.business_name} onChange={set('business_name')} required />
          <Field label="Contact phone" value={form.contact_phone} onChange={set('contact_phone')} />
          <Field label="Contact email" value={form.contact_email} onChange={set('contact_email')} type="email" />
          <Field label="Logo URL (HTTPS)" value={form.logo_url} onChange={set('logo_url')} />
          <Field label="Accent color" value={form.accent_color} onChange={set('accent_color')} type="text" />
        </div>
        <Field label="Business description" value={form.business_description} onChange={set('business_description')} textarea />
        <div className="border-t border-slate-100 pt-5"><h2 className="font-semibold text-slate-900">Customer form</h2><p className="mt-1 text-sm text-slate-500">Control the heading and supporting text customers see.</p></div>
        <Field label="Form title" value={form.form_title} onChange={set('form_title')} required />
        <Field label="Form description" value={form.form_description} onChange={set('form_description')} textarea />
        <button className="btn-primary" disabled={saving}>{saving && <Spinner />}{saving ? 'Saving…' : 'Save settings'}</button>
      </form>

      <section className="card p-6">
        <div><h2 className="font-semibold text-slate-900">Enquiry types</h2><p className="mt-1 text-sm text-slate-500">These options appear in the customer form. Existing enquiries keep their original type.</p></div>
        <div className="mt-5 divide-y divide-slate-100">
          {types.map((type) => <div key={type.key} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium text-slate-800">{type.label}</p><p className="text-xs text-slate-400">{type.key}</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => renameType(type)}>Rename</button><button className="btn-danger" onClick={() => removeType(type)}>Delete</button></div></div>)}
        </div>
        <form onSubmit={addType} className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-[1fr_2fr_auto]">
          <input className="input" placeholder="key e.g. wedding" value={newType.key} onChange={(e) => setNewType((x) => ({ ...x, key: e.target.value }))} />
          <input className="input" placeholder="Label e.g. Wedding booking" value={newType.label} onChange={(e) => setNewType((x) => ({ ...x, label: e.target.value }))} />
          <button className="btn-primary">Add type</button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, textarea, ...props }) {
  return <label className="block"><span className="label">{label}{props.required ? ' *' : ''}</span>{textarea ? <textarea className="input min-h-24" {...props} /> : <input className="input" {...props} />}</label>;
}
