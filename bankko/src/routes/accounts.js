'use strict';
// #7 POST /accounts   #31 GET /accounts/lookup   #8 GET /accounts (Admin)   #9 GET /accounts/:id   #10 PATCH /accounts/:id (Admin)   #25 GET /accounts/:id/transactions
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const map = require('../lib/map');
const { E } = require('../lib/http');
const v = require('../lib/validate');
const { requireAdmin } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { rateLimit } = require('../lib/ratelimit');
const access = require('../lib/access');
const { listTransactions } = require('./transactions');

const STATUSES = ['Active', 'Inactive', 'Frozen'];
const SORT = { accountId: 'Account_ID', balance: 'Balance', dateOpened: 'Date_Opened', accountNumber: 'Account_Number' };
const pad4 = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

// Owner = token sub (never the body). Admins cannot open accounts (least privilege).
async function openAccount({ auth, body, ip }) {
  access.requireCustomer(auth, 'Opening an account');
  const type = v.oneOf((body || {}).accountType, ['Savings', 'Checking'], 'accountType');
  for (let i = 0; i < 8; i++) {
    try {
      const res = await db.query('INSERT INTO Account (User_ID, Account_Number, Account_Type) VALUES (?,?,?)', [Number(auth.sub), `1002-${pad4()}-${pad4()}`, type]);
      await audit('User', Number(auth.sub), 'ACCOUNT_OPENED', 'Account', res.insertId, ip);
      const [row] = await db.query('SELECT * FROM Account WHERE Account_ID = ?', [res.insertId]);
      return { status: 201, body: map.account(row) };
    } catch (e) { if (!(e && e.code === 'ER_DUP_ENTRY')) throw e; }   // account number collision: try another
  }
  throw new Error('Could not allocate an account number.');
}

// Finds a destination account before a transfer. Returns only a masked number and a short holder name; rate limited.
async function lookup({ auth, query }) {
  access.requireCustomer(auth, 'Account lookup');
  await rateLimit(`lookup:${auth.sub}`, config.rateLimit.loginMax, config.rateLimit.windowSeconds);
  const num = String(query.accountNumber || '').trim();
  if (!/^[0-9-]{5,20}$/.test(num)) throw E.badRequest('Invalid query parameter.', ['accountNumber must be digits and hyphens, e.g. 1002-3350-4471.']);
  const [r] = await db.query(
    'SELECT a.Account_ID, a.Account_Number, a.Account_Type, u.First_Name, u.Last_Name FROM Account a JOIN `User` u ON u.User_ID = a.User_ID WHERE a.Account_Number = ? AND a.Status = \'Active\'', [num]);
  if (!r) throw E.notFound('Account not found.', ['No active account matches that number.']);
  return { status: 200, body: {
    accountId: r.Account_ID, accountNumber: `****-****-${r.Account_Number.slice(-4)}`, accountType: r.Account_Type,
    holderName: `${r.First_Name} ${r.Last_Name.charAt(0)}.`,
  } };
}

async function listAccounts({ auth, query }) {
  requireAdmin(auth);
  const status = v.optEnum(query, 'status', STATUSES);
  const type = v.optEnum(query, 'accountType', ['Savings', 'Checking']);
  const userId = v.optInt(query, 'userId');
  const p = v.paging(query);
  const s = v.sorting(query, SORT, 'accountId');
  const where = [], prm = [];
  if (status) { where.push('Status = ?'); prm.push(status); }
  if (type) { where.push('Account_Type = ?'); prm.push(type); }
  if (userId) { where.push('User_ID = ?'); prm.push(userId); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM Account ${w}`, prm);
  const rows = await db.query(`SELECT * FROM Account ${w} ORDER BY ${s.col} ${s.dir}, Account_ID ASC LIMIT ${p.limit} OFFSET ${p.offset}`, prm);
  return { status: 200, body: map.envelope(rows, map.account, p, n) };
}

async function getAccount({ auth, params }) {
  const id = v.idParam(params.accountId, 'Account');
  const row = await access.loadAccount(auth, id);
  return { status: 200, body: map.account(row) };
}

async function patchAccount({ auth, params, body, ip }) {
  requireAdmin(auth);
  const id = v.idParam(params.accountId, 'Account');
  const status = v.oneOf(body.status, STATUSES, 'status');
  v.str(body, 'reason', { required: false, max: 255 }); // validated; Lab 04 has no column to keep it (see README)

  const updated = await db.tx(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM Account WHERE Account_ID = ? FOR UPDATE', [id]);
    if (!rows.length) throw E.notFound('Account not found.', [`No account exists with ID ${id}.`]);
    const acct = rows[0];
    if (acct.Status !== status) {
      await conn.execute('UPDATE Account SET Status = ? WHERE Account_ID = ?', [status, id]);
      const action = status === 'Frozen' ? 'ACCOUNT_FROZEN' : status === 'Active' ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_DEACTIVATED';
      await audit('Admin', auth.sub, action, 'Account', id, ip, conn);
      acct.Status = status;
    }
    return acct;
  });
  return { status: 200, body: map.account(updated) };
}

async function accountTransactions({ auth, params, query }) {
  const id = v.idParam(params.accountId, 'Account');
  await access.loadAccount(auth, id);   // 404 unknown, 403 if it is not the caller's account
  // History includes transfers the account received (Lab 05 #25).
  return listTransactions(query, { extra: '(Account_ID = ? OR Destination_Account_ID = ?)', extraParams: [id, id] });
}

module.exports = (router) => {
  router.add('POST', '/accounts', 'any', openAccount);
  router.add('GET', '/accounts/lookup', 'any', lookup);          // fixed word before /:accountId
  router.add('GET', '/accounts', 'any', listAccounts);
  router.add('GET', '/accounts/:accountId/transactions', 'any', accountTransactions);
  router.add('GET', '/accounts/:accountId', 'any', getAccount);
  router.add('PATCH', '/accounts/:accountId', 'any', patchAccount);
};