'use strict';
// Fixed-window rate limiter stored in the Rate_Limit table (Lab 06 measure 7).
const db = require('../db');
const { E } = require('./http');

async function rateLimit(key, max, windowSeconds) {
  const k = key.slice(0, 100);
  await db.query(
    `INSERT INTO Rate_Limit (Limit_Key, Hits, Window_Start) VALUES (?, 1, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       Hits = IF(Window_Start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND), 1, Hits + 1),
       Window_Start = IF(Window_Start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND), UTC_TIMESTAMP(), Window_Start)`,
    [k, windowSeconds, windowSeconds]);
  const [row] = await db.query(
    'SELECT Hits, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), DATE_ADD(Window_Start, INTERVAL ? SECOND)) AS Remaining FROM Rate_Limit WHERE Limit_Key = ?',
    [windowSeconds, k]);
  if (row && row.Hits > max) throw E.tooMany(Math.max(1, row.Remaining));
}
module.exports = { rateLimit };
