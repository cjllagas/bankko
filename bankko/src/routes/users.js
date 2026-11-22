'use strict';
// #3 POST /users (public)   #4 GET /users (Admin)   #5 GET /users/:id   #6 PATCH /users/:id   #11 GET /users/:id/accounts  (Owner or Admin)
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const map = require('../lib/map');
const { E, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { requireAdmin } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { rateLimit } = require('../lib/ratelimit');
const access = require('../lib/access');

const SORT = { userId: 'User_ID', firstName: 'First_Name', lastName: 'Last_Name', email: 'Email', dateRegistered: 'Date_Registered' };
const COLS = 'User_ID, First_Name, Last_Name, Email, Phone_Number, Date_Registered';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d{10,14}$/;
const COMMON = new Set(['password1234', 'password12345', 'passwordpassword', 'qwertyuiop12', '123456789012', '1234567890123', 'iloveyou1234', 'administrator']);

// Lab 06, measure 8: length 12+, mixed character types, no common passwords.
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length === 0) throw E.badRequest('Missing required field.', ['password is required.']);
  const problems = [];
  if (pw.length < 12) problems.push('password must be at least 12 characters.');
  if (pw.length > 72) problems.push('password must not exceed 72 characters.');
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds < 3) problems.push('use at least 3 of: lower case, upper case, digits, symbols.');
  if (COMMON.has(pw.toLowerCase())) problems.push('that password is too common.');
  if (problems.length) throw E.badRequest('Weak password.', problems);
}

// True when the value is already used by any customer (except `exceptUserId`) or any admin.
async function taken(col, value, exceptUserId = 0) {
  const rows = await db.query(`SELECT 1 FROM \`User\` WHERE ${col} = ? AND User_ID <> ? UNION ALL SELECT 1 FROM Admin WHERE ${col} = ?`, [value, exceptUserId, value]);
  return rows.length > 0;
}

async function createUser({ body, ip }) {
  body = body || {};
  await rateLimit(`register:${ip}`, config.rateLimit.loginMax, config.rateLimit.windowSeconds);
  const first = v.str(body, 'firstName', { max: 50 });
  const last = v.str(body, 'lastName', { max: 50 });
  const email = v.str(body, 'email', { max: 100 }).toLowerCase();
  const phone = v.str(body, 'phoneNumber', { max: 15 });
  if (!EMAIL.test(email)) throw E.badRequest('Invalid email.', ['email must be a valid email address.']);
  if (!PHONE.test(phone)) throw E.badRequest('Invalid phone number.', ['phoneNumber must be 10 to 14 digits, e.g. 09171234567.']);
  checkPassword(body.password);

  const emailTaken = () => new HttpError(409, 'Email already registered.', [`A user with email ${email} already exists.`]);
  const phoneTaken = () => new HttpError(409, 'Phone number already in use.', [`Phone number ${phone} belongs to another user.`]);
  if (await taken('Email', email)) throw emailTaken();
  if (await taken('Phone_Number', phone)) throw phoneTaken();

  const hash = await bcrypt.hash(body.password, 10);
  let id;
  try {
    const res = await db.query('INSERT INTO `User` (First_Name, Last_Name, Email, Phone_Number, `Password`) VALUES (?,?,?,?,?)', [first, last, email, phone, hash]);
    id = res.insertId;
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') throw /phone/i.test(e.message) ? phoneTaken() : emailTaken();
    throw e;
  }
  await audit('User', id, 'USER_REGISTERED', 'User', id, ip);
  const [row] = await db.query(`SELECT ${COLS} FROM \`User\` WHERE User_ID = ?`, [id]);
  return { status: 201, body: map.user(row) };
}

async function listUsers({ auth, query }) {
  requireAdmin(auth);
  const p = v.paging(query);
  const s = v.sorting(query, SORT, '-dateRegistered');
  const where = [], params = [];
  if (query.lastName) {
    if (query.lastName.length > 50) throw E.badRequest('Invalid query parameter.', ['lastName must not exceed 50 characters.']);
    where.push('Last_Name LIKE ?'); params.push(`%${v.likeEscape(query.lastName)}%`);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM \`User\` ${w}`, params);
  const rows = await db.query(`SELECT ${COLS} FROM \`User\` ${w} ORDER BY ${s.col} ${s.dir}, User_ID ASC LIMIT ${p.limit} OFFSET ${p.offset}`, params);
  return { status: 200, body: map.envelope(rows, map.user, p, n) };
}

async function getUser({ auth, params }) {
  const id = v.idParam(params.userId, 'User');
  access.requireOwnerOrAdmin(auth, id);
  const [row] = await db.query(`SELECT ${COLS} FROM \`User\` WHERE User_ID = ?`, [id]);
  if (!row) throw E.notFound('User not found.', [`No user exists with ID ${id}.`]);
  return { status: 200, body: map.user(row) };
}

// Partial update. Email is the login identifier and is not changeable here.
async function patchUser({ auth, params, body, ip }) {
  body = body || {};
  const id = v.idParam(params.userId, 'User');
  access.requireOwnerOrAdmin(auth, id);
  const sets = [], prm = [];
  let phone;
  if (body.firstName !== undefined) { sets.push('First_Name = ?'); prm.push(v.str(body, 'firstName', { max: 50 })); }
  if (body.lastName !== undefined) { sets.push('Last_Name = ?'); prm.push(v.str(body, 'lastName', { max: 50 })); }
  if (body.phoneNumber !== undefined) {
    phone = v.str(body, 'phoneNumber', { max: 15 });
    if (!PHONE.test(phone)) throw E.badRequest('Invalid phone number.', ['phoneNumber must be 10 to 14 digits, e.g. 09171234567.']);
    sets.push('Phone_Number = ?'); prm.push(phone);
  }
  if (!sets.length) throw E.badRequest('No updatable fields.', ['Send firstName, lastName or phoneNumber.']);
  const [u] = await db.query('SELECT User_ID FROM `User` WHERE User_ID = ?', [id]);
  if (!u) throw E.notFound('User not found.', [`No user exists with ID ${id}.`]);

  const phoneTaken = () => new HttpError(409, 'Phone number already in use.', [`Phone number ${phone} belongs to another user.`]);
  if (phone && await taken('Phone_Number', phone, id)) throw phoneTaken();
  try { await db.query(`UPDATE \`User\` SET ${sets.join(', ')} WHERE User_ID = ?`, [...prm, id]); }
  catch (e) { if (e && e.code === 'ER_DUP_ENTRY') throw phoneTaken(); throw e; }
  await audit(auth.role === 'Admin' ? 'Admin' : 'User', Number(auth.sub), 'PROFILE_UPDATED', 'User', id, ip);
  const [row] = await db.query(`SELECT ${COLS} FROM \`User\` WHERE User_ID = ?`, [id]);
  return { status: 200, body: map.user(row) };
}

async function userAccounts({ auth, params, query }) {
  const id = v.idParam(params.userId, 'User');
  access.requireOwnerOrAdmin(auth, id);
  const type = v.optEnum(query, 'accountType', ['Savings', 'Checking']);
  const p = v.paging(query);
  const [u] = await db.query('SELECT User_ID FROM `User` WHERE User_ID = ?', [id]);
  if (!u) throw E.notFound('User not found.', [`No user exists with ID ${id}.`]);
  const where = ['User_ID = ?'], prm = [id];
  if (type) { where.push('Account_Type = ?'); prm.push(type); }
  const w = 'WHERE ' + where.join(' AND ');
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM Account ${w}`, prm);
  const rows = await db.query(`SELECT * FROM Account ${w} ORDER BY Account_ID LIMIT ${p.limit} OFFSET ${p.offset}`, prm);
  return { status: 200, body: map.envelope(rows, map.account, p, n) };
}

module.exports = (router) => {
  router.add('POST', '/users', 'none', createUser);
  router.add('GET', '/users', 'any', listUsers);
  router.add('GET', '/users/:userId/accounts', 'any', userAccounts);
  router.add('GET', '/users/:userId', 'any', getUser);
  router.add('PATCH', '/users/:userId', 'any', patchUser);
};