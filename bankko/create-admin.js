'use strict';
// Usage (MySQL must be running):  node create-admin.js
// Creates one Admin row. The password is typed hidden, hashed with bcrypt, and never stored in plain text.
require('dotenv').config({ quiet: true });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const origWrite = rl._writeToOutput;
rl._writeToOutput = function (s) { if (!muted) origWrite.call(rl, s); else if (s.includes('\n')) origWrite.call(rl, '\n'); };
const ask = (q, hidden = false) => new Promise((res) => {
  rl.question(q, (a) => { muted = false; res(a.trim()); });
  muted = hidden;
});

(async () => {
  const first = await ask('First name: ');
  const last = await ask('Last name: ');
  const email = (await ask('Email (login): ')).toLowerCase();
  const phone = await ask('Mobile number (receives the OTP, e.g. 09171234567): ');
  const pass = await ask('Password (min 12 chars, hidden): ', true);
  const pass2 = await ask('Repeat password (hidden): ', true);
  rl.close();

  const errors = [];
  if (!first || first.length > 50) errors.push('First name is required (max 50).');
  if (!last || last.length > 50) errors.push('Last name is required (max 50).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) errors.push('Email is not valid.');
  if (!/^\d{10,15}$/.test(phone)) errors.push('Mobile number must be 10 to 15 digits.');
  if (pass.length < 12) errors.push('Password must be at least 12 characters.');
  if (pass !== pass2) errors.push('Passwords do not match.');
  if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    const hash = await bcrypt.hash(pass, 10);
    const [r] = await conn.execute(
      "INSERT INTO Admin (First_Name, Last_Name, Email, Phone_Number, `Password`, Status) VALUES (?,?,?,?,?,'Active')",
      [first, last, email, phone, hash]);
    console.log(`\nAdmin created. Admin_ID = ${r.insertId}. Log in at /admin with ${email}`);
  } catch (e) {
    console.error('\nFailed:', e.code === 'ER_DUP_ENTRY' ? 'That email or mobile number is already used by another admin.' : e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
