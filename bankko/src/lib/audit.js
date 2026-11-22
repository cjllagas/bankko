'use strict';
// Append-only Audit_Log writer (Lab 06 measure 9).
const db = require('../db');

async function audit(actorType, actorId, action, entityType, entityId, ip, conn) {
  const sql = 'INSERT INTO Audit_Log (Actor_Type, Actor_ID, `Action`, Entity_Type, Entity_ID, IP_Address) VALUES (?,?,?,?,?,?)';
  const params = [actorType, actorId ?? null, action, entityType ?? null, entityId ?? null, ip ? String(ip).slice(0, 45) : null];
  try {
    if (conn) await conn.execute(sql, params);
    else await db.query(sql, params);
  } catch (e) {
    // Inside a transaction a lost audit row must fail the whole action; outside, never break the request.
    if (conn) throw e;
    console.error('[audit] write failed:', e.message);
  }
}
module.exports = { audit };
