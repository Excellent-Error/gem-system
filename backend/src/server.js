import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createStore } from './db/index.js';
import { createRouter } from './router.js';
import { securityHeaders, cors } from './middleware/security.js';
import { authMiddleware } from './middleware/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerEnquiryRoutes } from './routes/enquiries.js';
import { HttpError, fail } from './utils/http.js';
import { DEFAULT_ENQUIRY_TYPES } from './utils/constants.js';

export function createApp() {
  const store = createStore();
  store.init();
  store.seedEnquiryTypes(DEFAULT_ENQUIRY_TYPES);
  store.driverName = config.dbDriver;

  const router = createRouter();
  const r = new Proxy(router, {
    get: (target, prop) => {
      if (['get', 'post', 'patch', 'delete'].includes(prop)) {
        return (p, ...handlers) => {
          const wrapped = handlers.map((h) => async (req, res, next) => {
            try { await h(req, res, next); }
            catch (err) { next(err); }
          });
          target[prop](p, ...wrapped);
        };
      }
      return target[prop];
    },
  });

  registerAuthRoutes(r);
  registerEnquiryRoutes(r);

  const app = {
    store,
    router,
    async handle(req, res) {
      try {
        securityHeaders(req, res, () => {});
        if (req.url.startsWith('/api/')) {
          cors(req, res, () => {});
          if (res.writableEnded) return; // preflight handled
          req.store = store;
          await parseBody(req, res);
          if (res.writableEnded) return; // body error already responded
          authMiddleware(store)(req, res, () => {});
          await router.dispatch(req, res);
        } else {
          await serveStatic(req, res);
        }
      } catch (err) {
        handleError(err, req, res);
      }
    },
  };
  return app;
}

function parseBody(req, res) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') { req.body = undefined; return resolve(); }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > config.maxBodyBytes) {
        fail(res, 413, 'payload_too_large', 'Request body too large');
        req.destroy();
        return resolve();
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return resolve();
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { req.body = undefined; return resolve(); }
      try {
        req.body = JSON.parse(raw);
        resolve();
      } catch {
        fail(res, 400, 'bad_request', 'Request body must be valid JSON');
        resolve();
      }
    });
    req.on('error', () => { fail(res, 400, 'bad_request', 'Could not read request body'); resolve(); });
  });
}

function handleError(err, req, res) {
  if (res.writableEnded) return;
  if (err instanceof HttpError) {
    const headers = err.status === 429 ? { 'Retry-After': String(err.details || 60) } : {};
    return fail(res, err.status, err.code, err.message, err.details, headers);
  }
  if (err && err.type === 'entity.parse.failed') {
    return fail(res, 400, 'bad_request', 'Request body must be valid JSON');
  }
  console.error(`[error] ${req.method} ${req.url}:`, err);
  fail(res, 500, 'internal_error', 'Something went wrong on our side. Please try again.');
}

// ---- optional static hosting of the built frontend (production) ----
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
};

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: { code: 'method_not_allowed', message: 'Method not allowed' } }));
  }
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('GEM System API is running. Frontend build not found (expected at frontend/dist).');
  }
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let file = path.join(DIST, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html'); // SPA fallback
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

export function startServer(port = config.port, host = config.host) {
  const app = createApp();
  const server = http.createServer((req, res) => app.handle(req, res));
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, app, port: server.address().port }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer().then(({ port }) => {
    console.log(`GEM System backend listening on http://localhost:${port} (driver: ${config.dbDriver}, env: ${config.env})`);
  });
}
