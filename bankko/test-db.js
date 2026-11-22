require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: 'Z'
  });
  const [rows] = await pool.query('SELECT User_ID, Email FROM `User`');
  console.log('Connected. Users:', rows);
  await pool.end();
})().catch(e => console.error('FAILED:', e.message));