import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ACTIVITY_META, STATUSES, STATUS_META } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';
import { ConfirmDialog, Modal, Spinner, StatusBadge, useToast } from '../components/ui';

function Info({ label, children }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{children || '—'}</p>
    </div>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [edit, setEdit] = useState({});

  const load = useCallback(() => {
    api(`/api/enquiries/${id}`).then(setDetail).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn, successMsg) => {
    try {
      await fn();
      push(successMsg);
      load();
    } catch (e) {
      push(e.message, 'error');
    }
  };

  const patch = (body) => act(() => api(`/api/enquiries/${id}`, { method: 'PATCH', body }), 'Saved');

  if (error) return <div className="card p-8 text-center text-sm text-rose-600">{error}</div>;
  if (!detail) return <div className="flex justify-center py-24 text-slate-400"><Spinner className="h-6 w-6" /></div>;

  const e = detail;
  const notes = e.activities.filter((a) => a.action === 'note_added');

  const openEdit = () => {
    setEdit({
      customer_name: e.customer_name, phone: e.phone, email: e.email,
      preferred_date: e.preferred_date || '', preferred_time: e.preferred_time || '',
      budget: e.budget || '', source: e.source || '',
    });
    setEditOpen(true);
  };
  const eset = (k) => (ev) => setEdit((s) => ({ ...s, [k]: ev.target.value }));

  async function addNote(ev) {
    ev.preventDefault();
    if (!note.trim()) return;
    setNoteBusy(true);
    try {
      await api(`/api/enquiries/${id}/notes`, { method: 'POST', body: { note } });
      setNote('');
      push('Note added');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="text-sm text-indigo-600 hover:underline">← Back to enquiries</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-xl font-semibold text-slate-900">{e.id}</h1>
            <StatusBadge status={e.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">Received {formatDateTime(e.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={openEdit}>Edit details</button>
          <button className="btn-danger" onClick={() => setArchiveOpen(true)}>Archive</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Customer</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Info label="Name">{e.customer_name}</Info>
              <Info label="Phone"><a className="text-indigo-600 hover:underline" href={`tel:${e.phone}`}>{e.phone}</a></Info>
              <Info label="Email"><a className="text-indigo-600 hover:underline" href={`mailto:${e.email}`}>{e.email}</a></Info>
              <Info label="Preferred date">{formatDate(e.preferred_date)}</Info>
              <Info label="Preferred time">{e.preferred_time}</Info>
              <Info label="Budget">{e.budget}</Info>
              <Info label="Source">{e.source}</Info>
              <Info label="Assigned to">{e.assigned_to}</Info>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Message</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{e.message}</p>
            {e.custom_fields && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Additional details</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(e.custom_fields).map(([k, v]) => <Info key={k} label={k.replace(/_/g, ' ')}>{v}</Info>)}
                </div>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              Internal notes <span className="font-normal text-slate-400">(never shown to customers)</span>
            </h2>
            <div className="space-y-3">
              {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
              {notes.map((a) => (
                <div key={a.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{a.note}</p>
                  <p className="mt-1 text-xs text-slate-400">{a.created_by} · {formatDateTime(a.created_at)}</p>
                </div>
              ))}
            </div>
            <form onSubmit={addNote} className="mt-4 flex gap-2">
              <input className="input" placeholder="Add a note…" value={note} onChange={(ev) => setNote(ev.target.value)} />
              <button type="submit" className="btn-primary shrink-0" disabled={noteBusy}>{noteBusy ? <Spinner /> : 'Add'}</button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-4 p-5">
            <div>
              <label className="label" htmlFor="status">Status</label>
              <select id="status" className="input" value={e.status}
                onChange={(ev) => patch({ status: ev.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="follow_up">Follow-up date</label>
              <input id="follow_up" type="date" className="input" defaultValue={e.follow_up_date || ''}
                onBlur={(ev) => {
                  if (ev.target.value !== (e.follow_up_date || '')) patch({ follow_up_date: ev.target.value || null });
                }} />
              {e.follow_up_date && (
                <button className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                  onClick={() => act(() => api(`/api/enquiries/${id}/follow-up/complete`, { method: 'POST' }), 'Follow-up completed')}>
                  Mark follow-up complete
                </button>
              )}
            </div>
            <div>
              <label className="label" htmlFor="assigned">Assigned to</label>
              <input id="assigned" className="input" defaultValue={e.assigned_to || ''} placeholder="Staff member…"
                onBlur={(ev) => {
                  if (ev.target.value !== (e.assigned_to || '')) patch({ assigned_to: ev.target.value || null });
                }} />
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Activity</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {[...e.activities].reverse().map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-400 ring-4 ring-white" />
                  <p className="text-sm font-medium text-slate-800">{ACTIVITY_META[a.action] || a.action}</p>
                  {a.action === 'status_changed' && (
                    <p className="mt-0.5 text-xs text-slate-500"><StatusBadge status={a.from_status} /> → <StatusBadge status={a.to_status} /></p>
                  )}
                  {a.note && <p className="mt-0.5 text-xs text-slate-500">{a.note}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{a.created_by} · {formatDateTime(a.created_at)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit enquiry details" wide>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['customer_name', 'Full name', 'text'],
            ['phone', 'Phone', 'tel'],
            ['email', 'Email', 'email'],
            ['budget', 'Budget', 'text'],
            ['source', 'Source', 'text'],
          ].map(([k, label, type]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input type={type} className="input" value={edit[k] || ''} onChange={eset(k)} />
            </div>
          ))}
          <div>
            <label className="label">Preferred date</label>
            <input type="date" className="input" value={edit.preferred_date} onChange={eset('preferred_date')} />
          </div>
          <div>
            <label className="label">Preferred time</label>
            <input type="time" className="input" value={edit.preferred_time} onChange={eset('preferred_time')} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => {
            patch({
              ...edit,
              preferred_date: edit.preferred_date || null,
              preferred_time: edit.preferred_time || null,
              budget: edit.budget || null,
              source: edit.source || null,
            });
            setEditOpen(false);
          }}>Save changes</button>
        </div>
      </Modal>

      <ConfirmDialog open={archiveOpen} onClose={() => setArchiveOpen(false)} busy={archiveBusy}
        title="Archive this enquiry?" confirmLabel="Archive"
        message="The enquiry will be removed from the dashboard. Its full history is preserved in the database."
        onConfirm={async () => {
          setArchiveBusy(true);
          try {
            await api(`/api/enquiries/${id}/archive`, { method: 'POST' });
            navigate('/admin');
          } catch (err) {
            push(err.message, 'error');
            setArchiveBusy(false);
          }
        }} />
    </div>
  );
}
