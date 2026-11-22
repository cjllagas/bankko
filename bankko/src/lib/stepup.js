'use strict';
// Step-up OTP for large transfers (Lab 05 #30, Lab 06 measure 11). Uses the optional Step_Up table.
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { HttpError, E } = require('./http');
const { sendOtpSms } = require('./sms');

const otpHash = (id, otp) => crypto.createHmac('sha256', config.jwt.secret).update(`${id}:${otp}`).digest('hex');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Creates a challenge, sends the OTP by SMS and returns the id (plus the OTP in dev mode).
async function challenge(userId) {
  const [u] = await db.query('SELECT Phone_Number FROM `User` WHERE User_ID = ?', [userId]);
  if (!u) throw E.unauthorized('Unauthorized.', ['Unknown user.']);
  const stepUpId = crypto.randomBytes(8).toString('hex');
  const otp = String(crypto.randomInt(0, 10 ** config.otp.length)).padStart(config.otp.length, '0');
  await db.query('DELETE FROM Step_Up WHERE Expires_At < UTC_TIMESTAMP() OR (User_ID = ? AND Token_Hash IS NULL)', [userId]);
  await db.query(
    'INSERT INTO Step_Up (StepUp_ID, User_ID, Otp_Hash, Expires_At) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
    [stepUpId, userId, otpHash(stepUpId, otp), config.otp.ttlSeconds]);
  await sendOtpSms(u.Phone_Number, otp);
  return { stepUpId, devOtp: config.devShowOtp ? otp : undefined };
}

// Checks the OTP once and returns a single-use step-up token (the database keeps only its hash).
async function verify(userId, stepUpId, otp) {
  const invalid = () => E.unauthorized('Invalid or expired OTP.', ['The OTP entered is incorrect or has expired.']);
  if (!/^\d{6}$/.test(otp)) throw invalid();
  const [row] = await db.query('SELECT * FROM Step_Up WHERE StepUp_ID = ? AND User_ID = ?', [stepUpId, userId]);
  if (!row || row.Token_Hash || row.Used || new Date(row.Expires_At) <= new Date()) throw invalid();
  const a = Buffer.from(otpHash(stepUpId, otp), 'hex');
  const b = Buffer.from(row.Otp_Hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw invalid();

  const token = 'su_' + crypto.randomBytes(24).toString('hex');
  // Only the request that sets Token_Hash first wins, so one OTP gives one token.
  const res = await db.query(
    'UPDATE Step_Up SET Token_Hash = ?, Expires_At = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE StepUp_ID = ? AND Token_Hash IS NULL',
    [sha(token), config.stepUp.tokenTtlSeconds, stepUpId]);
  if (res.affectedRows !== 1) throw invalid();
  return token;
}

// Spends the token inside the money-moving database transaction: a failed payment rolls this back too.
async function consume(conn, userId, token) {
  const [rows] = await conn.execute(
    'SELECT StepUp_ID FROM Step_Up WHERE Token_Hash = ? AND User_ID = ? AND Used = 0 AND Expires_At > UTC_TIMESTAMP() FOR UPDATE',
    [sha(token), userId]);
  if (!rows.length) throw new HttpError(403, 'Invalid or expired step-up token.', ['Request a new step-up code and try again.']);
  await conn.execute('UPDATE Step_Up SET Used = 1 WHERE StepUp_ID = ?', [rows[0].StepUp_ID]);
}

module.exports = { challenge, verify, consume };
