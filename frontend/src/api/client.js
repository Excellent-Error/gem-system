const BASE = import.meta.env.VITE_API_BASE || '';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — please check your connection and try again.', { status: 0, code: 'network' });
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok || (json && json.ok === false)) {
    const e = json?.error || {};
    throw new ApiError(e.message || `Request failed (${res.status})`, {
      status: res.status, code: e.code, details: e.details,
    });
  }
  return json.data;
}
