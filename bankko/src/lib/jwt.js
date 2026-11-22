'use strict';
// Minimal HS256 JWT (Lab 06 JWT Design): header.payload.signature, claims iss/sub/role/jti/iat/exp.
const crypto = require('crypto');
const config = require('../config');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', config.jwt.secret).update(data).digest();

function sign({ sub, role }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.jwt.issuer, sub: String(sub), role,
    jti: crypto.randomBytes(8).toString('hex'),
    iat: now, exp: now + config.jwt.ttlSeconds,
  };
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  return { token: `${head}.${body}.${hmac(`${head}.${body}`).toString('base64url')}`, payload };
}

// Returns the payload, or null for anything wrong (never throws on bad input).
function verify(token) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null; // blocks alg=none
    const given = Buffer.from(parts[2], 'base64url');
    const expected = hmac(`${parts[0]}.${parts[1]}`);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (p.iss !== config.jwt.issuer) return null;
    if (typeof p.exp !== 'number' || p.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!['Customer', 'Admin'].includes(p.role)) return null;
    if (typeof p.jti !== 'string' || !/^\d+$/.test(String(p.sub))) return null;
    return p;
  } catch (_) {
    return null;
  }
}

module.exports = { sign, verify };
