# GEM System — API Reference

Base URL: `/api` — all bodies are JSON, all responses use the `{ ok, data | error }` envelope.

Authentication: admin session via httpOnly cookie `gem_token` (set by login, sent automatically by browsers). Non-browser clients must send the `Cookie` header manually.

## Public endpoints

### `GET /api/health`
Liveness probe.

### `GET /api/enquiry-types`
Enquiry types for the customer form.
**Response 200:** `[{ "key": "quote", "label": "Request a quote" }, …]`

### `GET /api/business-config`
Public business identity and customer-form configuration.

### `PATCH /api/business-config` — admin only
Updates business name, description, contact details, HTTPS logo URL, accent color, and customer-form title/description.

### `POST /api/enquiry-types` — admin only
Creates a configurable enquiry type. Body: `{ "key": "wedding", "label": "Wedding booking" }`.

### `PATCH /api/enquiry-types/:key` — admin only
Renames an existing enquiry type without changing its key.

### `DELETE /api/enquiry-types/:key` — admin only
Deletes an enquiry type only when no existing enquiry uses it.

### `POST /api/enquiries` — rate limited
Customer submission.

**Body:**
```json
{
  "customer_name": "Jane Customer",       // required, 2–100 chars
  "phone": "+1 555 123 4567",             // required, 7–20 chars
  "email": "jane@example.com",            // required, valid email
  "enquiry_type": "quote",                // required, must be a configured type key
  "preferred_date": "2026-12-01",         // optional, YYYY-MM-DD (validated)
  "preferred_time": "14:30",              // optional, HH:MM
  "budget": "$500 - $1000",               // optional, ≤100 chars
  "message": "…",                         // required, 10–5000 chars
  "source": "Google",                     // optional, ≤100 chars
  "custom_fields": { "guest_count": "200" } // optional object of short strings (extension point)
}
```

**Response 201:** `{ "id": "ENQ-2026-000001", "customer_name": "…", "created_at": "…" }`
Internal fields (status, notes, etc.) are never returned here.

**Errors:** `400` malformed JSON · `422` field-level `details` · `429` rate limited (header `Retry-After`).

## Authentication

### `POST /api/auth/login` — rate limited
**Body:** `{ "email": "…", "password": "…" }`
**Response 200:** `{ "email", "name", "role" }` + `Set-Cookie: gem_token=…; HttpOnly; SameSite=Lax`
**Errors:** `401` invalid credentials (generic message) · `422` invalid payload · `429` rate limited.

### `POST /api/auth/logout`
Clears the session cookie. Always `200`.

### `GET /api/auth/me`
**Response 200:** `{ "id", "email", "name", "role" }` · `401` if not authenticated.

## Admin endpoints (all require auth → `401` otherwise)

### `GET /api/enquiries`
Query params: `search`, `status` (`all` or one of `NEW CONTACTED FOLLOW_UP QUOTED WON LOST CLOSED`), `date_from`, `date_to` (created-date range, YYYY-MM-DD), `follow_up_due=true`, `include_archived=true`, `sort` (`created_at|preferred_date|follow_up_date|customer_name|status`), `order` (`asc|desc`), `page` (default 1), `page_size` (default 20, max 100).

**Response 200:** `{ "items": [enquiry…], "total": n, "page": 1, "pageSize": 20 }`

### `GET /api/enquiries/:id`
**Response 200:** enquiry object including `activities: [{ id, action, from_status, to_status, note, created_by, created_at }]`.
**Errors:** `404` not found or archived.

### `PATCH /api/enquiries/:id`
Partial update. Send only fields to change:
`status`, `follow_up_date` (`YYYY-MM-DD` or `null`), `assigned_to`, `customer_name`, `phone`, `email`, `enquiry_type`, `preferred_date`, `preferred_time`, `budget`, `message`, `source`, `custom_fields`.

Every real change appends to the activity log (`status_changed` with from/to, `follow_up_scheduled`, or `updated` listing changed fields).
**Errors:** `404` · `422` invalid value · `409` never for this endpoint.

### `POST /api/enquiries/:id/notes`
**Body:** `{ "note": "…" }` (1–2000 chars) → `201` the created activity.
Notes are returned only by authenticated endpoints — never to the public.

### `POST /api/enquiries/:id/follow-up/complete`
Clears `follow_up_date`, logs `follow_up_completed`. **Error:** `409` if none scheduled.

### `POST /api/enquiries/:id/archive`
Soft-deletes the enquiry (excluded from lists and detail, edits rejected with `404`). History is preserved.

### `GET /api/stats`
**Response 200:** `{ "total": n, "byStatus": { "NEW": n, … }, "followUpsDue": n }`

## Enquiry object

```json
{
  "id": "ENQ-2026-000001",
  "customer_name": "…", "phone": "…", "email": "…",
  "enquiry_type": "quote",
  "preferred_date": "2026-12-01", "preferred_time": "14:30",
  "budget": "…", "message": "…", "source": "…",
  "custom_fields": null,
  "status": "NEW",
  "assigned_to": null, "follow_up_date": null,
  "archived": false,
  "created_at": "2026-09-28T08:00:00.000Z", "updated_at": "…"
}
```

## Status lifecycle

`NEW → CONTACTED → FOLLOW_UP → QUOTED → WON` (or `LOST`), `CLOSED` for anything finished.
All transitions are permitted but every change is validated server-side and recorded in the activity log with actor and timestamp.
