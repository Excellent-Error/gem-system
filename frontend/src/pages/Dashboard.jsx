import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { STATUS_META } from '../utils/constants';
import { formatDate, formatDateTime } from '../utils/format';
import { EmptyState, Pagination, Spinner, StatusBadge } from '../components/ui';

const SORTS = [
  ['created_at:desc', 'Newest first'],
  ['created_at:asc', 'Oldest first'],
  ['follow_up_date:asc', 'Follow-up date ↑'],
  ['customer_name:asc', 'Name A–Z'],
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({
    search: '', status: 'all', dateFrom: '', dateTo: '', followUpDue: false,
    sort: 'created_at:desc', page: 1,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 15;

  useEffect(() => {
    api('/api/stats').then(setStats).catch(() => {});
  }, [data]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const [sort, order] = filters.sort.split(':');
        const qs = new URLSearchParams({
          search: filters.search,
          status: filters.status,
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          follow_up_due: String(filters.followUpDue),
          sort,
          order,
          page: String(filters.page),
          page_size: String(pageSize),
        });
        setData(await api(`/api/enquiries?${qs}`));
        setError('');
      } catch (err) {
        setData({ items: [], page: 1, pageSize, total: 0 });
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  const setF = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const statCard = (label, value, active, onClick, tone = 'text-slate-900') => (
    <button onClick={onClick} className={`card p-4 text-left transition-shadow hover:shadow ${active ? 'ring-2 ring-indigo-500' : ''}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value ?? '—'}</p>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {statCard('Total', stats?.total, filters.status === 'all' && !filters.followUpDue, () => setF({ status: 'all', followUpDue: false }))}
        {statCard('New', stats?.byStatus?.NEW, filters.status === 'NEW', () => setF({ status: 'NEW', followUpDue: false }), 'text-blue-700')}
        {statCard('Contacted', stats?.byStatus?.CONTACTED, filters.status === 'CONTACTED', () => setF({ status: 'CONTACTED', followUpDue: false }), 'text-violet-700')}
        {statCard('Follow-ups due', stats?.followUpsDue, filters.followUpDue, () => setF({ followUpDue: true, status: 'all' }), 'text-amber-700')}
        {statCard('Quoted', stats?.byStatus?.QUOTED, filters.status === 'QUOTED', () => setF({ status: 'QUOTED', followUpDue: false }), 'text-cyan-700')}
        {statCard('Won', stats?.byStatus?.WON, filters.status === 'WON', () => setF({ status: 'WON', followUpDue: false }), 'text-emerald-700')}
        {statCard('Lost', stats?.byStatus?.LOST, filters.status === 'LOST', () => setF({ status: 'LOST', followUpDue: false }), 'text-rose-700')}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <input
          className="input !w-64"
          placeholder="Search name, phone, email, reference…"
          value={filters.search}
          onChange={(e) => setF({ search: e.target.value })}
        />
        <select className="input !w-40" value={filters.status} onChange={(e) => setF({ status: e.target.value, followUpDue: false })}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" className="input !w-40" value={filters.dateFrom} onChange={(e) => setF({ dateFrom: e.target.value })} title="Created from" />
        <input type="date" className="input !w-40" value={filters.dateTo} onChange={(e) => setF({ dateTo: e.target.value })} title="Created to" />
        <select className="input !w-44" value={filters.sort} onChange={(e) => setF({ sort: e.target.value })}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {error && <div className="px-4 py-3 text-sm text-rose-600">{error}</div>}
        {loading && !data ? (
          <div className="flex justify-center py-16 text-slate-400"><Spinner className="h-6 w-6" /></div>
        ) : !data?.items?.length ? (
          <EmptyState title="No enquiries found" message="Try adjusting your search or filters — or share your enquiry form link to get your first enquiry." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Preferred</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Follow-up</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {data.items.map((e) => (
                    <tr key={e.id} onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{e.customer_name}</p>
                        <p className="text-xs text-slate-500">{e.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.enquiry_type}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(e.preferred_date)}</td>
                      <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(e.created_at)}</td>
                      <td className={`px-4 py-3 ${e.follow_up_date ? 'font-medium text-amber-700' : 'text-slate-400'}`}>
                        {formatDate(e.follow_up_date)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF({ page: p })} />
          </>
        )}
      </div>
    </div>
  );
}
