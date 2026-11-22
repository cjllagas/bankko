'use strict';
// #12 GET /billers   #13 GET /billers/:id   (any logged-in user)   #14 POST /billers   #15 PUT /billers/:id  (Admin)
const db = require('../db');
const map = require('../lib/map');
const { E } = require('../lib/http');
const v = require('../lib/validate');
const { requireAdmin } = require('../lib/auth');
const { audit } = require('../lib/audit');

const STATUS = ['Active', 'Inactive'];

async function list({ query }) {
  const status = v.optEnum(query, 'status', STATUS);
  const p = v.paging(query);
  if (query.category && query.category.length > 50) throw E.badRequest('Invalid query parameter.', ['category must not exceed 50 characters.']);
  const where = [], prm = [];
  if (query.category) { where.push('Category = ?'); prm.push(query.category); }
  if (status) { where.push('Status = ?'); prm.push(status); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM Biller ${w}`, prm);
  const rows = await db.query(`SELECT * FROM Biller ${w} ORDER BY Biller_ID LIMIT ${p.limit} OFFSET ${p.offset}`, prm);
  return { status: 200, body: map.envelope(rows, map.biller, p, n) };
}

async function get({ params }) {
  const id = v.idParam(params.billerId, 'Biller');
  const [row] = await db.query('SELECT * FROM Biller WHERE Biller_ID = ?', [id]);
  if (!row) throw E.notFound('Biller not found.', [`No biller exists with ID ${id}.`]);
  return { status: 200, body: map.biller(row) };
}

function readBiller(body) {
  return {
    name: v.str(body, 'billerName', { max: 100 }),
    category: v.str(body, 'category', { max: 50 }),
    status: body.status === undefined ? 'Active' : v.oneOf(body.status, STATUS, 'status'),
  };
}

async function create({ auth, body, ip }) {
  requireAdmin(auth);
  const b = readBiller(body);
  const res = await db.query('INSERT INTO Biller (Biller_Name, Category, Status) VALUES (?,?,?)', [b.name, b.category, b.status]);
  await audit('Admin', auth.sub, 'BILLER_CREATED', 'Biller', res.insertId, ip);
  const [row] = await db.query('SELECT * FROM Biller WHERE Biller_ID = ?', [res.insertId]);
  return { status: 201, body: map.biller(row) };
}

// PUT replaces the whole record, so every field is required.
async function replace({ auth, params, body, ip }) {
  requireAdmin(auth);
  const id = v.idParam(params.billerId, 'Biller');
  if (body.status === undefined) throw E.badRequest('Missing required field.', ['status is required for a full update.']);
  const b = readBiller(body);
  const res = await db.query('UPDATE Biller SET Biller_Name = ?, Category = ?, Status = ? WHERE Biller_ID = ?', [b.name, b.category, b.status, id]);
  if (res.affectedRows === 0) throw E.notFound('Biller not found.', [`No biller exists with ID ${id}.`]);
  await audit('Admin', auth.sub, 'BILLER_UPDATED', 'Biller', id, ip);
  const [row] = await db.query('SELECT * FROM Biller WHERE Biller_ID = ?', [id]);
  return { status: 200, body: map.biller(row) };
}

module.exports = (router) => {
  router.add('GET', '/billers', 'any', list);
  router.add('GET', '/billers/:billerId', 'any', get);
  router.add('POST', '/billers', 'any', create);
  router.add('PUT', '/billers/:billerId', 'any', replace);
};
