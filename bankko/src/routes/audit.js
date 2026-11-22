'use strict';
// #32 GET /audit-logs (Admin, read-only)   plus   GET /admin/summary (dashboard counters)
const db = require('../db');
const map = require('../lib/map');
const { E } = require('../lib/http');
const v = require('../lib/validate');
const { requireAdmin } = require('../lib/auth');

async function list({ auth, query }) {
  requireAdmin(auth);
  const actorType = v.optEnum(query, 'actorType', ['User', 'Admin', 'System']);
  if (query.action !== undefined && query.action !== '' && !/^[A-Z_]{1,40}$/.test(query.action)) {
    throw E.badRequest('Invalid query parameter.', ['action must be upper-case letters and underscores, e.g. ACCOUNT_FROZEN.']);
  }
  const actorId = v.optInt(query, 'actorId');
  const range = v.dateRange(query);
  const p = v.paging(query);
  const where = [], prm = [];
  if (actorType) { where.push('Actor_Type = ?'); prm.push(actorType); }
  if (actorId) { where.push('Actor_ID = ?'); prm.push(actorId); }
  if (query.action) { where.push('`Action` = ?'); prm.push(query.action); }
  if (range.from) { where.push('Created_At >= ?'); prm.push(`${range.from} 00:00:00`); }
  if (range.to) { where.push('Created_At < DATE_ADD(?, INTERVAL 1 DAY)'); prm.push(`${range.to} 00:00:00`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM Audit_Log ${w}`, prm);
  const rows = await db.query(`SELECT * FROM Audit_Log ${w} ORDER BY Log_ID DESC LIMIT ${p.limit} OFFSET ${p.offset}`, prm);
  return { status: 200, body: map.envelope(rows, map.auditLog, p, n) };
}

// Not in Lab 05: feeds the three counters on the admin dashboard ("today" = current UTC day).
async function summary({ auth }) {
  requireAdmin(auth);
  const [r] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM \`Transaction\` WHERE Transaction_Date >= UTC_DATE()) AS transactionsToday,
       (SELECT COUNT(*) FROM \`Transaction\` WHERE Review_Status = 'Flagged') AS flaggedForReview,
       (SELECT COUNT(*) FROM Account WHERE Status = 'Frozen') AS frozenAccounts,
       (SELECT COUNT(*) FROM \`User\`) AS totalUsers`);
  return { status: 200, body: {
    transactionsToday: Number(r.transactionsToday), flaggedForReview: Number(r.flaggedForReview),
    frozenAccounts: Number(r.frozenAccounts), totalUsers: Number(r.totalUsers),
  } };
}

module.exports = (router) => {
  router.add('GET', '/audit-logs', 'any', list);
  router.add('GET', '/admin/summary', 'any', summary);
};
