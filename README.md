# General Enquiry Management System (GEM System)

A reusable, production-oriented enquiry management system for service businesses:
customers submit enquiries through a public form, and staff manage them through a
protected admin dashboard with statuses, internal notes, follow-ups and a full
activity history. The core engine is business-agnostic — customise business identity, enquiry types and custom fields per client (event centre, salon, restaurant, fashion designer…) without changing the core application code.

## 1. Project structure

```
gem-system/
├── backend/                  # Zero-runtime-dependency Node.js API
│   ├── src/
│   │   ├── server.js         # HTTP server, static hosting, error handling
│   │   ├── router.js         # Minimal method+path router
│   │   ├── config.js         # Env loading + configuration
│   │   ├── seed.js           # First-admin creation CLI
│   │   ├── db/               # Pluggable storage drivers
│   │   │   ├── jsonStore.js      # JSON-file driver (any Node 20+)
│   │   │   └── sqliteStore.js    # SQLite driver (Node >= 22.5, default)
│   │   ├── middleware/       # auth, rate limiting, CORS, security headers
│   │   ├── routes/           # auth + enquiries REST endpoints
│   │   ├── service/          # Business logic + activity recording
│   │   ├── validation/       # Server-side validation/sanitisation
│   │   └── utils/            # crypto (scrypt), JWT, errors, constants
│   ├── test/integration.test.js
│   └── .env.example
├── frontend/                 # React 18 + Vite + Tailwind CSS SPA
│   └── src/
│       ├── pages/            # CustomerForm, Login, Dashboard, EnquiryDetail
│       ├── components/       # UI primitives (Modal, Toasts, Pagination…)
│       ├── context/          # Auth session context
│       ├── api/client.js     # Fetch wrapper (credentials, error envelope)
│       └── utils/            # Status metadata, formatting
└── docs/API.md               # Full API reference
```

## 2. Technologies

- **Backend:** Node.js standard library only (`node:http`, `node:sqlite`, `node:crypto`) — no npm runtime dependencies.
- **Auth:** scrypt password hashing + HS256 JWT in an httpOnly cookie.
- **Database:** SQLite (default, zero config) with a JSON-file driver for dev/test. Swap to PostgreSQL later by adding a driver behind the same interface.
- **Frontend:** React 18, Vite, React Router v6, Tailwind CSS v3.
- **Tests:** Node built-in test runner (`node --test`).

## 3. How the frontend communicates with the backend

All communication is JSON over HTTPS/fetch with `credentials: 'include'` so the
httpOnly auth cookie is sent automatically.

- In **development**, Vite proxies `/api/*` to `http://localhost:4000` (see `frontend/vite.config.js`).
- In **production** (same origin), the backend serves `frontend/dist` directly and handles SPA routing.
- In **production** (separate origins), set `VITE_API_BASE` at build time, add the frontend origin to backend `CORS_ORIGINS`, set `COOKIE_SECURE=true`, and change the auth cookie's `SameSite=Lax` to `SameSite=None` in `backend/src/middleware/auth.js` (cross-site cookies require `None; Secure`).

Every response uses one envelope:

```json
{ "ok": true, "data": … }
{ "ok": false, "error": { "code": "validation_failed", "message": "…", "details": { "email": "…" } } }
```

## 4. Database structure

- **admins** — id, email (unique), name, password_hash (scrypt), role, created_at
- **enquiries** — id (`ENQ-YYYY-NNNNNN`), customer_name, phone, email, enquiry_type,
  preferred_date/time, budget, message, source, custom_fields (JSON — per-business
  extension point), status, assigned_to, follow_up_date, archived (soft delete),
  created_at, updated_at
- **enquiry_activities** — immutable audit trail: action (`created`,
  `status_changed`, `note_added`, `follow_up_scheduled`, `follow_up_completed`,
  `updated`, `archived`), from_status, to_status, note, created_by, created_at
- **enquiry_types** — configurable list backing the customer form dropdown
- **counters** — per-year sequences for enquiry IDs

History is append-only: edits never destroy past activity.

## 5. API documentation

See [docs/API.md](docs/API.md).

## 6. Environment variables (backend `.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` / `HOST` | `4000` / `0.0.0.0` | |
| `NODE_ENV` | `development` | `production` enforces JWT_SECRET + HSTS |
| `JWT_SECRET` | dev-only fallback | **Required in production.** `openssl rand -hex 32` |
| `JWT_EXPIRES_SECONDS` | `28800` | Session length (8 h) |
| `DB_DRIVER` | `sqlite` | `sqlite` (Node ≥ 22.5) or `json` (any Node 20+) |
| `DATA_DIR` | `./data` | Database file location |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowlist |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `PUBLIC_RATE_LIMIT_MAX` | `30` | Per window per IP |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `600000` | 10 minutes |
| `MAX_BODY_BYTES` | `102400` | Request body cap |

## 7. Install dependencies

```bash
cd backend   # no dependencies to install — pure Node.js
cd ../frontend && npm install
```

## 8. Run locally

```bash
# Terminal 1 — API
cd backend && cp .env.example .env && npm run dev        # http://localhost:4000

# Terminal 2 — UI (dev server with proxy)
cd frontend && npm run dev                               # http://localhost:5173
```

Open `http://localhost:5173/` for the customer form, `http://localhost:5173/login`
for the admin dashboard.

## 9. Configure the database

SQLite is the default — the file is created automatically in `DATA_DIR` on first
run (`data/gem.db`). No further configuration needed. For the JSON driver (e.g.
Node 20 without `node:sqlite`), set `DB_DRIVER=json`.

## 10. Create the first admin account

```bash
cd backend
npm run seed admin@yourdomain.com "Your Name" 'a-strong-password'
```

The seed also installs the default enquiry types. Admins can manage business identity and enquiry types from `/admin/settings`; the API also exposes protected CRUD endpoints for these settings.

## 11. Deploy the frontend

```bash
cd frontend && npm run build     # outputs dist/
```

- **Same origin:** copy `frontend/dist` next to the backend — it serves the SPA automatically.
- **Separate host** (Netlify/Vercel/Cloudflare Pages/S3+CDN): deploy `dist/`, set
  `VITE_API_BASE=https://api.yourdomain.com` at build time, and configure CORS +
  cookie flags as described in section 3.

## 12. Deploy the backend

Any Node ≥ 22.5 environment: clone, `cp .env.example .env`, fill in secrets,
`npm start` (PM2/systemd recommended), put nginx/Caddy in front for TLS.
Also works on Render/Railway/Fly.io as a plain Node web service with a persistent
disk mounted at `DATA_DIR`.

## 13. Connect the production database

SQLite: ensure `DATA_DIR` points at a persistent volume and back up the file
(`.db` + `-wal`/`-shm`) on a schedule. PostgreSQL migration path: implement a
third store behind `src/db/index.js` using the same interface — the schema uses
standard SQL types.

## 14. Security considerations

Implemented: scrypt + timing-safe password verification; HS256 JWT in httpOnly
SameSite cookie with per-request server-side admin re-validation; full server-side
validation; parameterised queries only (SQL driver) / typed storage (JSON driver);
login + public-endpoint rate limiting; CORS allowlist; security headers
(CSP, nosniff, frame-deny, HSTS in production); uniform error envelope without
stack traces; request body cap; soft-delete history preservation; secrets only
via environment variables.

Deliberate remaining considerations (assess per deployment): no refresh-token
rotation (8 h sessions), no password-reset flow, no email/SMS notifications,
CSRF reliance on SameSite=Lax + JSON-only API + CORS allowlist (add CSRF tokens
if you switch to `SameSite=None`), and set up automated backups + log monitoring
before onboarding paying clients.

## 15. Testing

```bash
cd backend && npm test
```

The integration suite starts the real server and covers: customer submission
(happy path, invalid input, malformed JSON), unique ID generation, activity
logging, 401/404/409/422/429 handling, rate limiting, login/logout/session,
status transitions with from/to audit, notes, follow-up schedule/complete,
archive semantics, search/filter/sort/pagination, custom-field persistence,
CORS and security headers.

## Admin profile

The admin dashboard now includes `/admin/profile`, where the signed-in administrator can view and update their name and email and change their password. Profile changes require the current password and rotate the server-side session nonce; a fresh authenticated cookie is issued after a successful update.
