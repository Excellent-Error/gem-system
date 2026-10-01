import { rateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { validateEnquirySubmission, validateEnquiryPatch, validateNote } from '../validation/validate.js';
import { validateBusinessConfig, validateEnquiryType } from '../validation/config.js';
import { ok, badRequest, notFound, conflict } from '../utils/http.js';
import { SORTABLE } from '../utils/constants.js';
import * as svc from '../service/enquiryService.js';

const validTypes = (store) => store.getEnquiryTypes().map((t) => t.key);

export function registerEnquiryRoutes(r) {
  // Public: enquiry type list (needed by the customer form)
  r.get('/api/enquiry-types', async (req) => {
    return ok(req.res, req.store.getEnquiryTypes());
  });

  r.get('/api/business-config', async (req) => {
    return ok(req.res, req.store.getBusinessConfig());
  });

  r.patch('/api/business-config', requireAuth, async (req) => {
    const patch = validateBusinessConfig(req.body);
    return ok(req.res, req.store.updateBusinessConfig(patch));
  });

  r.post('/api/enquiry-types', requireAuth, async (req) => {
    const type = validateEnquiryType(req.body);
    if (req.store.getEnquiryTypes().some((t) => t.key === type.key)) throw conflict('An enquiry type with that key already exists');
    return ok(req.res, req.store.upsertEnquiryType(type), 201);
  });

  r.patch('/api/enquiry-types/:key', requireAuth, async (req) => {
    const type = validateEnquiryType({ key: req.params.key, label: req.body?.label });
    if (!req.store.getEnquiryTypes().some((t) => t.key === req.params.key)) throw notFound('Enquiry type not found');
    return ok(req.res, req.store.upsertEnquiryType(type));
  });

  r.delete('/api/enquiry-types/:key', requireAuth, async (req) => {
    const types = req.store.getEnquiryTypes();
    if (!types.some((t) => t.key === req.params.key)) throw notFound('Enquiry type not found');
    if (!req.store.deleteEnquiryType(req.params.key)) throw conflict('This enquiry type is already used by existing enquiries');
    return ok(req.res, { deleted: true, key: req.params.key });
  });

  // Public: customer submission (rate-limited)
  r.post('/api/enquiries', rateLimit('public'), async (req) => {
    const input = validateEnquirySubmission(req.body, validTypes(req.store));
    const enquiry = svc.submitEnquiry(req.store, input);
    // Never expose internal fields on the public endpoint
    return ok(req.res, {
      id: enquiry.id,
      customer_name: enquiry.customer_name,
      created_at: enquiry.created_at,
    }, 201);
  });

  r.get('/api/enquiries', requireAuth, async (req) => {
    const q = req.query;
    const filters = {
      search: q.search || '',
      status: q.status || 'all',
      dateFrom: q.date_from || '',
      dateTo: q.date_to || '',
      followUpDue: q.follow_up_due === 'true',
      includeArchived: q.include_archived === 'true',
      sort: SORTABLE.includes(q.sort) ? q.sort : 'created_at',
      order: q.order === 'asc' ? 'asc' : 'desc',
      page: parseInt(q.page, 10) || 1,
      pageSize: parseInt(q.page_size, 10) || 20,
    };
    return ok(req.res, req.store.listEnquiries(filters));
  });

  r.get('/api/enquiries/:id', requireAuth, async (req) => {
    return ok(req.res, svc.getEnquiryDetail(req.store, req.params.id));
  });

  r.patch('/api/enquiries/:id', requireAuth, async (req) => {
    const patch = validateEnquiryPatch(req.body, validTypes(req.store));
    const { enquiry } = svc.patchEnquiry(req.store, req.params.id, patch, req.admin.email);
    return ok(req.res, enquiry);
  });

  r.post('/api/enquiries/:id/notes', requireAuth, async (req) => {
    const { note } = validateNote(req.body);
    const activity = svc.addNote(req.store, req.params.id, note, req.admin.email);
    return ok(req.res, activity, 201);
  });

  r.post('/api/enquiries/:id/follow-up/complete', requireAuth, async (req) => {
    const enquiry = svc.completeFollowUp(req.store, req.params.id, req.admin.email);
    return ok(req.res, enquiry);
  });

  r.post('/api/enquiries/:id/archive', requireAuth, async (req) => {
    const enquiry = svc.archiveEnquiry(req.store, req.params.id, req.admin.email);
    return ok(req.res, { id: enquiry.id, archived: true });
  });

  r.get('/api/stats', requireAuth, async (req) => {
    return ok(req.res, req.store.getStats());
  });

  r.get('/api/health', async (req) => {
    return ok(req.res, { status: 'up', driver: req.store.driverName || 'unknown' });
  });
}
