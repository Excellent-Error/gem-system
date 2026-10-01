export const STATUSES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUOTED', 'WON', 'LOST', 'CLOSED'];

export const STATUS_META = {
  NEW:       { label: 'New',       badge: 'bg-blue-100 text-blue-800 ring-blue-600/20' },
  CONTACTED: { label: 'Contacted', badge: 'bg-violet-100 text-violet-800 ring-violet-600/20' },
  FOLLOW_UP: { label: 'Follow-up', badge: 'bg-amber-100 text-amber-800 ring-amber-600/20' },
  QUOTED:    { label: 'Quoted',    badge: 'bg-cyan-100 text-cyan-800 ring-cyan-600/20' },
  WON:       { label: 'Won',       badge: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20' },
  LOST:      { label: 'Lost',      badge: 'bg-rose-100 text-rose-800 ring-rose-600/20' },
  CLOSED:    { label: 'Closed',    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

export const SOURCES = ['Google search', 'Social media', 'Referral', 'Walk-in', 'Advertisement', 'Other'];

export const ACTIVITY_META = {
  created: 'Enquiry created',
  status_changed: 'Status changed',
  note_added: 'Note added',
  follow_up_scheduled: 'Follow-up scheduled',
  follow_up_completed: 'Follow-up completed',
  updated: 'Details updated',
  archived: 'Enquiry archived',
};
