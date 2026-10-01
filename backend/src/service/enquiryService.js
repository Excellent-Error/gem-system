import { notFound, conflict } from '../utils/http.js';
import { normalizeNigerianPhone } from '../validation/validate.js';

const FIELD_LABELS = {
  customer_name: 'name', phone: 'phone', email: 'email', enquiry_type: 'enquiry type',
  preferred_date: 'preferred date', preferred_time: 'preferred time', budget: 'budget',
  message: 'message', source: 'source', assigned_to: 'assignee', custom_fields: 'custom fields',
};
const EDITABLE = ['customer_name','phone','email','enquiry_type','preferred_date','preferred_time','budget','message','source','assigned_to','custom_fields'];

export function getActiveEnquiry(store, id) {
  const enquiry = store.getEnquiry(id);
  if (!enquiry || enquiry.archived) throw notFound('Enquiry not found');
  return enquiry;
}

export function submitEnquiry(store, input) {
  // Block accidental/repeated public submissions without preventing a customer
  // from legitimately contacting the business again later.
  const now = Date.now();
  const recent = store.listEnquiries({ page: 1, pageSize: 100, sort: 'created_at', order: 'desc' }).items;
  const phone = normalizeNigerianPhone(input.phone);
  const email = input.email.trim().toLowerCase();
  const message = input.message.trim().replace(/\s+/g, ' ');
  const duplicate = recent.find((e) => {
    const created = Date.parse(e.created_at);
    if (!Number.isFinite(created) || now - created < 0 || now - created > 15 * 60 * 1000) return false;
    return normalizeNigerianPhone(e.phone) === phone
      && String(e.email || '').trim().toLowerCase() === email
      && String(e.enquiry_type || '') === input.enquiry_type
      && String(e.message || '').trim().replace(/\s+/g, ' ') === message;
  });
  if (duplicate) throw conflict('We already received this enquiry. Please wait for us to respond.');

  const enquiry = store.createEnquiry(input);
  store.addActivity({
    enquiry_id: enquiry.id,
    action: 'created',
    note: `Enquiry submitted via public form (${enquiry.enquiry_type})`,
    created_by: 'customer',
  });
  return enquiry;
}

export function patchEnquiry(store, id, patch, actor) {
  const current = getActiveEnquiry(store, id);
  const activities = [];
  const updates = {};

  if (patch.status !== undefined && patch.status !== current.status) {
    activities.push({
      enquiry_id: id, action: 'status_changed',
      from_status: current.status, to_status: patch.status, created_by: actor,
    });
    updates.status = patch.status;
  }

  if (patch.follow_up_date !== undefined && patch.follow_up_date !== current.follow_up_date) {
    activities.push({
      enquiry_id: id, action: 'follow_up_scheduled',
      note: patch.follow_up_date
        ? `Follow-up scheduled for ${patch.follow_up_date}`
        : 'Follow-up cleared',
      created_by: actor,
    });
    updates.follow_up_date = patch.follow_up_date;
  }

  const changedLabels = [];
  for (const k of EDITABLE) {
    if (patch[k] === undefined) continue;
    if (JSON.stringify(patch[k] ?? null) !== JSON.stringify(current[k] ?? null)) {
      updates[k] = patch[k];
      changedLabels.push(FIELD_LABELS[k] || k);
    }
  }
  if (changedLabels.length) {
    activities.push({
      enquiry_id: id, action: 'updated',
      note: `Updated: ${changedLabels.join(', ')}`, created_by: actor,
    });
  }

  const enquiry = Object.keys(updates).length ? store.updateEnquiry(id, updates) : current;
  for (const a of activities) store.addActivity(a);
  return { enquiry, activities };
}

export function addNote(store, id, note, actor) {
  getActiveEnquiry(store, id);
  const activity = store.addActivity({ enquiry_id: id, action: 'note_added', note, created_by: actor });
  return activity;
}

export function completeFollowUp(store, id, actor) {
  const enquiry = getActiveEnquiry(store, id);
  if (!enquiry.follow_up_date) throw conflict('No follow-up is scheduled for this enquiry');
  store.addActivity({
    enquiry_id: id, action: 'follow_up_completed',
    note: `Follow-up due ${enquiry.follow_up_date} marked complete`, created_by: actor,
  });
  return store.updateEnquiry(id, { follow_up_date: null });
}

export function archiveEnquiry(store, id, actor) {
  const enquiry = getActiveEnquiry(store, id);
  store.addActivity({
    enquiry_id: id, action: 'archived',
    note: `Enquiry archived (was ${enquiry.status})`, created_by: actor,
  });
  return store.updateEnquiry(id, { archived: 1 });
}

export function getEnquiryDetail(store, id) {
  const enquiry = getActiveEnquiry(store, id);
  const activities = store.listActivities(id);
  return { ...enquiry, activities };
}
