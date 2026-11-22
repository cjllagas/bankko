'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');

// timezone 'Z' + SET time_zone: every DATETIME is read and written as UTC (Lab 05, ISO 8601).
const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: true, // DECIMAL(12,2) -> JS number, as in the Lab 05 JSON
});
pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

// Always prepared statements (values never become part of the SQL text).
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Runs fn(conn) inside one all-or-nothing database transaction (Lab 06, measure 10).
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, tx };
