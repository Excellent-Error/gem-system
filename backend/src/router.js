// Minimal Express-style router: route(method, path, ...handlers)
export function createRouter() {
  const routes = [];

  const add = (method, path, handlers) => {
    const keys = [];
    const regex = new RegExp('^' + path.replace(/:[^/]+/g, (m) => {
      keys.push(m.slice(1));
      return '([^/]+)';
    }) + '$');
    routes.push({ method, regex, keys, handlers });
  };

  const router = {
    get: (p, ...h) => add('GET', p, h),
    post: (p, ...h) => add('POST', p, h),
    patch: (p, ...h) => add('PATCH', p, h),
    delete: (p, ...h) => add('DELETE', p, h),
  };

  router.dispatch = async (req, res) => {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = req.url.split('?')[0].match(r.regex);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
      const query = {};
      new URL(req.url, 'http://localhost').searchParams.forEach((v, k) => { query[k] = v; });
      req.query = query;
      req.res = res;
      for (const handler of r.handlers) {
        let nextCalled = false;
        let nextErr = null;
        const next = (err) => { nextCalled = true; nextErr = err || null; };
        await handler(req, res, next);
        if (nextErr) throw nextErr;
        if (res.writableEnded) return;
        if (!nextCalled) return;
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'not_found', message: 'Route not found' } }));
  };

  return router;
}
