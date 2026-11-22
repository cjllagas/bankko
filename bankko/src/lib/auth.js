'use strict';
// Authentication = verify the token (401). Authorization = check the role (403). Lab 06 Part C.
const db = require('../db');
const jwt = require('./jwt');
const { E } = require('./http');

async function authenticate(req) {
  const header = req.headers.authorization || '';
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  if (!m) throw E.unauthorized();
  const p = jwt.verify(m[1]);
  if (!p) throw E.unauthorized();

  const denied = await db.query('SELECT 1 FROM Token_Denylist WHERE Jti = ?', [p.jti]);
  if (denied.length) throw E.unauthorized(); // logged-out token

  // The account must still exist and be active (a deactivated admin loses access at once).
  const sub = Number(p.sub);
  const rows = p.role === 'Admin'
    ? await db.query('SELECT Status FROM Admin WHERE Admin_ID = ?', [sub])
    : await db.query("SELECT 'Active' AS Status FROM `User` WHERE User_ID = ?", [sub]);
  if (!rows.length || rows[0].Status !== 'Active') throw E.unauthorized();

  return { sub, role: p.role, jti: p.jti, exp: p.exp };
}

function requireAdmin(auth) {
  if (auth.role !== 'Admin') throw E.forbidden('Access denied.', ['Only administrators can use this endpoint.']);
}

module.exports = { authenticate, requireAdmin };
