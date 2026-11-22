'use strict';
// HTTP helpers: error type, JSON in/out, a tiny router. No framework.

class HttpError extends Error {
  constructor(status, message, errors = [], headers = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.headers = headers;
  }
}
const E = {
  badRequest: (m, errs) => new HttpError(400, m, errs),
  unauthorized: (m = 'Unauthorized.', errs = ['Missing, invalid or expired access token.']) => new HttpError(401, m, errs),
  forbidden: (m = 'Access denied.', errs = []) => new HttpError(403, m, errs),
  notFound: (m, errs) => new HttpError(404, m, errs),
  conflict: (m, errs) => new HttpError(409, m, errs),
  tooMany: (retryAfter) =>
    new HttpError(429, 'Too many attempts.', [`Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} minute(s).`],
      { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter))) }),
};

// Standard error format (Lab 05 Part D conventions).
const errorBody = (status, message, errors) => ({
  success: false, statusCode: status, message, errors: errors || [], timestamp: new Date().toISOString(),
});

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(status === 204 ? undefined : payload);
}

async function readJson(req, limit = 100 * 1024) {
  const declared = parseInt(req.headers['content-length'] || '0', 10);
  if (declared > limit) throw new HttpError(413, 'Request body too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const type = (req.headers['content-type'] || '').toLowerCase();
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Unsupported media type.', ['Content-Type must be application/json.']);
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch (_) {
    throw E.badRequest('Malformed JSON.', ['The request body must be a JSON object.']);
  }
}

class Router {
  constructor(prefix) { this.prefix = prefix; this.routes = []; }
  add(method, pattern, auth, handler) {
    const keys = [];
    const re = new RegExp('^' + (this.prefix + pattern).replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    this.routes.push({ method, re, keys, auth, handler });
  }
  // Registration order matters: fixed words must be added before /:id patterns.
  match(method, path) {
    const allowed = new Set();
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      if (r.method === method) {
        const params = {};
        r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch (_) { params[k] = ''; } });
        return { route: r, params };
      }
      allowed.add(r.method);
    }
    return allowed.size ? { allowed: [...allowed] } : null;
  }
}

module.exports = { HttpError, E, errorBody, sendJson, readJson, Router };
