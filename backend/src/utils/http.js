export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Record not found') => new HttpError(404, 'not_found', msg);
export const conflict = (msg) => new HttpError(409, 'conflict', msg);
export const unprocessable = (details) => new HttpError(422, 'validation_failed', 'Please correct the highlighted fields', details);
export const tooMany = (retryAfterSec) => new HttpError(429, 'rate_limited', 'Too many requests. Please wait and try again.', undefined, retryAfterSec);

export function sendJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

export function ok(res, data, status = 200, headers = {}) {
  sendJson(res, status, { ok: true, data }, headers);
}

export function fail(res, status, code, message, details, extraHeaders = {}) {
  sendJson(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } }, extraHeaders);
}
