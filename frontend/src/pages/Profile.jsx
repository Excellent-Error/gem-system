import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { admin } = useAuth();
  const [form, setForm] = useState({ name: '', email: '' });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createdAt, setCreatedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/auth/me').then((me) => {
      setForm({ name: me.name || '', email: me.email || '' });
      setCreatedAt(me.created_at || null);
    }).catch((e) => setError(e.message));
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const updated = await api('/api/auth/profile', {
        method: 'PATCH',
        body: {
          name: form.name,
          email: form.email,
          current_password: currentPassword,
          ...(newPassword ? { new_password: newPassword } : {}),
        },
      });
      setForm({ name: updated.name, email: updated.email });
      setCreatedAt(updated.created_at || createdAt);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Admin profile updated successfully.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const initials = (form.name || admin?.name || 'A').trim().slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Admin profile</h1>
        <p className="mt-1 text-sm text-slate-500">Manage the administrator account used to access GEM.</p>
      </div>

      {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">{initials}</div>
            <div>
              <p className="font-semibold text-slate-900">{form.name || 'Administrator'}</p>
              <p className="text-sm text-slate-500">Administrator · GEM enquiry management</p>
            </div>
          </div>
        </div>

        <form onSubmit={save} className="space-y-6 p-6">
          <div>
            <h2 className="font-semibold text-slate-900">Account details</h2>
            <p className="mt-1 text-sm text-slate-500">These details identify the person managing the GEM dashboard.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" value={form.name} onChange={set('name')} required />
            <Field label="Email" type="email" value={form.email} onChange={set('email')} required />
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h2 className="font-semibold text-slate-900">Security</h2>
            <p className="mt-1 text-sm text-slate-500">Enter your current password to save profile changes. Leave the new password blank if you do not want to change it.</p>
          </div>
          <Field label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <Field label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep your current password" />

          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
            <div className="text-xs text-slate-400">
              {createdAt ? `Account created ${new Date(createdAt).toLocaleDateString()}` : <Spinner className="h-4 w-4" />}
            </div>
            <button className="btn-primary" disabled={saving}>{saving && <Spinner />}{saving ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, ...props }) {
  return <label className="block"><span className="label">{label}{props.required ? ' *' : ''}</span><input className="input" {...props} /></label>;
}
