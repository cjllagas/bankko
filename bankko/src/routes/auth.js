'use strict';
// #1 POST /auth/sessions   #2 POST /auth/otp-verifications   #29 DELETE /auth/sessions/current   #30 POST /auth/step-ups
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const jwt = require('../lib/jwt');
const { E } = require('../lib/http');
const { str } = require('../lib/validate');
const { audit } = require('../lib/audit');
const { rateLimit } = require('../lib/ratelimit');
const { sendOtpSms, maskPhone } = require('../lib/sms');
const access = require('../lib/access');
const stepup = require('../lib/stepup');

const TABLE = { Admin: { name: 'Admin', id: 'Admin_ID' }, Customer: { name: '`User`', id: 'User_ID' } };
let dummyHash; // compared when the email is unknown so response time does not reveal which emails exist
const getDummy = () => (dummyHash ||= bcrypt.hashSync('not-a-real-password', 10));

const otpHash = (challengeId, otp) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`${challengeId}:${otp}`).digest('hex');

async function findActor(email) {
  let rows = await db.query('SELECT Admin_ID AS id, Phone_Number, `Password` AS hash, Locked_Until, Status FROM Admin WHERE Email = ?', [email]);
  if (rows.length) return { role: 'Admin', ...rows[0] };
  rows = await db.query("SELECT User_ID AS id, Phone_Number, `Password` AS hash, Locked_Until, 'Active' AS Status FROM `User` WHERE Email = ?", [email]);
  if (rows.length) return { role: 'Customer', ...rows[0] };
  return null;
}

// Atomic: count the failure and lock the account after maxFailed (Lab 04 Failed_Attempts / Locked_Until).
async function registerFailure(role, id) {
  const t = TABLE[role];
  const { maxFailed, minutes } = config.lockout;
  await db.query(
    `UPDATE ${t.name} SET
       Locked_Until = IF(Failed_Attempts + 1 >= ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), Locked_Until),
       Failed_Attempts = IF(Failed_Attempts + 1 >= ?, 0, Failed_Attempts + 1)
     WHERE ${t.id} = ?`, [maxFailed, minutes, maxFailed, id]);
}

const actorType = (role) => (role === 'Admin' ? 'Admin' : 'User');

async function createSession({ body, ip }) {
  await rateLimit(`login:${ip}`, config.rateLimit.loginMax, config.rateLimit.windowSeconds);
  const email = str(body, 'email', { max: 100 }).toLowerCase();
  const password = body.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    throw E.badRequest('Missing required field.', ['password is required.']);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw E.badRequest('Invalid email.', ['email must be a valid email address.']);

  const actor = await findActor(email);
  const generic = () => E.unauthorized('Invalid email or password.', ['The email or password is incorrect.']);

  if (!actor) {
    await bcrypt.compare(password, getDummy());
    await audit('System', null, 'LOGIN_FAILED', null, null, ip);
    throw generic();
  }
  if (actor.Locked_Until && new Date(actor.Locked_Until) > new Date()) {
    throw E.tooMany((new Date(actor.Locked_Until) - Date.now()) / 1000);
  }
  const valid = await bcrypt.compare(password, actor.hash);
  if (!valid || actor.Status !== 'Active') {
    if (!valid) await registerFailure(actor.role, actor.id);
    await audit(actorType(actor.role), actor.id, 'LOGIN_FAILED', null, null, ip);
    throw generic();
  }

  // Password is right: issue an SMS OTP challenge (one open challenge per person).
  const challengeId = crypto.randomBytes(8).toString('hex');
  const otp = String(crypto.randomInt(0, 10 ** config.otp.length)).padStart(config.otp.length, '0');
  await db.query('DELETE FROM Otp_Challenge WHERE Expires_At < UTC_TIMESTAMP() OR (Actor_Type = ? AND Actor_ID = ?)', [actor.role === 'Admin' ? 'Admin' : 'User', actor.id]);
  await db.query(
    'INSERT INTO Otp_Challenge (Challenge_ID, Actor_Type, Actor_ID, Otp_Hash, Attempts_Left, Expires_At) VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
    [challengeId, actor.role === 'Admin' ? 'Admin' : 'User', actor.id, otpHash(challengeId, otp), config.otp.maxAttempts, config.otp.ttlSeconds]);
  await sendOtpSms(actor.Phone_Number, otp);

  const out = {
    otpChallengeId: challengeId,
    message: 'OTP sent to the registered phone number.',
    otpExpiresInSeconds: config.otp.ttlSeconds,
    maskedPhone: maskPhone(actor.Phone_Number),
  };
  if (config.devShowOtp) out.devOtp = otp; // development only
  return { status: 200, body: out };
}

async function verifyOtp({ body, ip }) {
  await rateLimit(`otp:${ip}`, config.rateLimit.otpMax, config.rateLimit.windowSeconds);
  const challengeId = str(body, 'otpChallengeId', { max: 32 });
  const otp = str(body, 'otp', { max: 12 });
  const invalid = () => E.unauthorized('Invalid or expired OTP.', ['The OTP entered is incorrect or has expired.']);
  if (!/^\d{6}$/.test(otp)) throw invalid();

  const [ch] = await db.query('SELECT * FROM Otp_Challenge WHERE Challenge_ID = ?', [challengeId]);
  if (!ch) throw invalid();
  if (new Date(ch.Expires_At) <= new Date()) {
    await db.query('DELETE FROM Otp_Challenge WHERE Challenge_ID = ?', [challengeId]);
    throw invalid();
  }
  const role = ch.Actor_Type === 'Admin' ? 'Admin' : 'Customer';

  // Spend one attempt first (atomic), then compare: parallel guesses cannot exceed the limit.
  const spent = await db.query('UPDATE Otp_Challenge SET Attempts_Left = Attempts_Left - 1 WHERE Challenge_ID = ? AND Attempts_Left > 0', [challengeId]);
  if (spent.affectedRows === 0) {
    await db.query('DELETE FROM Otp_Challenge WHERE Challenge_ID = ?', [challengeId]);
    throw E.tooMany(config.lockout.minutes * 60);
  }
  const a = Buffer.from(otpHash(challengeId, otp), 'hex');
  const b = Buffer.from(ch.Otp_Hash, 'hex');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    await audit(actorType(role), ch.Actor_ID, 'OTP_FAILED', null, null, ip);
    if (ch.Attempts_Left - 1 <= 0) {
      await db.query('DELETE FROM Otp_Challenge WHERE Challenge_ID = ?', [challengeId]);
      await registerFailure(role, ch.Actor_ID);
    }
    throw invalid();
  }
  // Single use: only the request that deletes the row may continue.
  const used = await db.query('DELETE FROM Otp_Challenge WHERE Challenge_ID = ?', [challengeId]);
  if (used.affectedRows !== 1) throw invalid();

  const t = TABLE[role];
  await db.query(`UPDATE ${t.name} SET Failed_Attempts = 0, Locked_Until = NULL WHERE ${t.id} = ?`, [ch.Actor_ID]);
  const [who] = await db.query(`SELECT First_Name, Last_Name FROM ${t.name} WHERE ${t.id} = ?`, [ch.Actor_ID]);
  const { token } = jwt.sign({ sub: ch.Actor_ID, role });
  await audit(actorType(role), ch.Actor_ID, 'LOGIN_SUCCESS', null, null, ip);

  return {
    status: 200,
    body: {
      accessToken: token, tokenType: 'Bearer', expiresInSeconds: config.jwt.ttlSeconds,
      userId: ch.Actor_ID, role, name: who ? `${who.First_Name} ${who.Last_Name}` : null,
    },
  };
}

// Logout: the token's jti goes on the denylist until the token would have expired anyway.
async function logout({ auth, ip }) {
  await db.query('DELETE FROM Token_Denylist WHERE Expires_At < UTC_TIMESTAMP()');
  await db.query('INSERT IGNORE INTO Token_Denylist (Jti, Expires_At) VALUES (?, ?)', [auth.jti, new Date(auth.exp * 1000)]);
  await audit(actorType(auth.role), auth.sub, 'LOGOUT', null, null, ip);
  return { status: 204 };
}

// Step-up: the customer proves the OTP and gets a single-use token for one large transfer (#21).
async function stepUp({ auth, body }) {
  access.requireCustomer(auth, 'Step-up verification');
  await rateLimit(`stepup:${auth.sub}`, config.rateLimit.otpMax, config.rateLimit.windowSeconds);
  const stepUpId = str(body, 'stepUpId', { max: 32 });
  const otp = str(body, 'otp', { max: 12 });
  const token = await stepup.verify(Number(auth.sub), stepUpId, otp);
  return { status: 200, body: { stepUpToken: token, expiresInSeconds: config.stepUp.tokenTtlSeconds } };
}

module.exports = (router) => {
  router.add('POST', '/auth/sessions', 'none', createSession);
  router.add('POST', '/auth/otp-verifications', 'none', verifyOtp);
  router.add('DELETE', '/auth/sessions/current', 'any', logout);
  router.add('POST', '/auth/step-ups', 'any', stepUp);
};