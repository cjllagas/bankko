'use strict';
// Bankko server: plain Node.js `http`, no web framework.
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { HttpError, E, errorBody, sendJson, readJson, Router } = require('./lib/http');
const { authenticate } = require('./lib/auth');

const API = '/api/v1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const router = new Router(API);
// Order matters: more specific (fixed-word) routes are registered before /:id routes inside each module.
['auth', 'users', 'accounts', 'billers', 'transactions', 'payees', 'notifications', 'audit'].forEach((m) => require(`./routes/${m}`)(router));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function clientIp(req) {
  let ip = req.socket.remoteAddress || '';
  if (config.trustProxy && req.headers['x-forwarded-for']) ip = String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return ip.replace(/^::ffff:/, '').slice(0, 45);
}

async function handleApi(req, res, url) {
  const found = router.match(req.method, url.pathname);
  if (!found) throw E.notFound('Resource not found.', [`No endpoint at ${url.pathname}.`]);
  if (found.allowed) throw new HttpError(405, 'Method not allowed.', [`Allowed: ${found.allowed.join(', ')}.`], { Allow: found.allowed.join(', ') });

  const { route, params } = found;
  const ctx = { req, res, params, ip: clientIp(req), query: Object.fromEntries(url.searchParams), auth: null, body: {} };
  if (route.auth !== 'none') ctx.auth = await authenticate(req);          // 401 if not authenticated
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) ctx.body = await readJson(req);
  const out = await route.handler(ctx);
  sendJson(res, out.status, out.body, out.headers);
}

function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed.', [], { Allow: 'GET, HEAD' });
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (_) { throw E.badRequest('Bad request.'); }
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin') rel = '/admin.html';
  if (rel === '/customer') rel = '/customer.html';
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw E.notFound('Not found.');   // blocks ../ traversal
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, errorBody(404, 'Not found.', []));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === API || url.pathname.startsWith(API + '/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, errorBody(e.status, e.message, e.errors), e.headers);
    console.error('[error]', req.method, req.url, e);
    const dbDown = ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(e && e.code);
    sendJson(res, dbDown ? 503 : 500, errorBody(dbDown ? 503 : 500, dbDown ? 'Service unavailable.' : 'Internal server error.', []));
  }
});

if (require.main === module) {
  server.listen(config.port, async () => {
    console.log(`Bankko running at http://localhost:${config.port}  (admin: http://localhost:${config.port}/admin)`);
    try { await db.query('SELECT 1'); console.log('Database connected.'); }
    catch (e) { console.error('Database connection FAILED:', e.message); }
  });
}
module.exports = { server };