'use strict';
// #16 POST /payees   #17 GET /payees/:id   #18 PATCH /payees/:id   #19 DELETE /payees/:id (soft)   #20 GET /accounts/:id/payees
const db = require('../db');
const map = require('../lib/map');
const { E, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { audit } = require('../lib/audit');
const access = require('../lib/access');

const payee = (r) => ({
  payeeId: r.Payee_ID, accountId: r.Account_ID, billerId: r.Biller_ID, billerAccountNumber: r.Biller_Account_Number,
  nickname: r.Nickname, dateAdded: new Date(r.Date_Added).toISOString(), status: r.Status,
});
const intField = (body, name) => {
  if (!Number.isInteger(body[name]) || body[name] <= 0) throw E.badRequest('Invalid field.', [`${name} must be a positive integer.`]);
  return body[name];
};

async function loadPayee(params) {
  const id = v.idParam(params.payeeId, 'Payee');
  const [row] = await db.query('SELECT * FROM Payee WHERE Payee_ID = ?', [id]);
  if (!row) throw E.notFound('Payee not found.', [`No payee exists with ID ${id}.`]);
  return row;
}

async function create({ auth, body, ip }) {
  body = body || {};
  access.requireCustomer(auth, 'Saving a payee');
  const accountId = intField(body, 'accountId');
  const billerId = intField(body, 'billerId');
  const refNo = v.str(body, 'billerAccountNumber', { max: 50 });
  const nickname = v.str(body, 'nickname', { required: false, max: 50 }) ?? null;
  await access.loadAccount(auth, accountId, { allowAdmin: false });

  const [biller] = await db.query('SELECT Biller_ID, Status FROM Biller WHERE Biller_ID = ?', [billerId]);
  if (!biller) throw E.notFound('Biller not found.', [`No biller exists with ID ${billerId}.`]);
  if (biller.Status !== 'Active') throw new HttpError(422, 'Biller unavailable.', ['This biller is not accepting new payees.']);

  const conflict = () => new HttpError(409, 'Payee already saved.', [`Account ${accountId} already has biller ${billerId} with reference ${refNo}.`]);
  const [old] = await db.query('SELECT * FROM Payee WHERE Account_ID = ? AND Biller_ID = ? AND Biller_Account_Number = ?', [accountId, billerId, refNo]);
  let id;
  if (old) {
    if (old.Status === 'Active') throw conflict();
    // A removed payee is brought back (the UNIQUE triple keeps its old row).
    await db.query('UPDATE Payee SET Status = \'Active\', Nickname = ?, Date_Added = UTC_TIMESTAMP() WHERE Payee_ID = ?', [nickname, old.Payee_ID]);
    id = old.Payee_ID;
  } else {
    try {
      const res = await db.query('INSERT INTO Payee (Account_ID, Biller_ID, Biller_Account_Number, Nickname) VALUES (?,?,?,?)', [accountId, billerId, refNo, nickname]);
      id = res.insertId;
    } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') throw conflict(); throw e; }
  }
  await audit('User', Number(auth.sub), 'PAYEE_ADDED', 'Payee', id, ip);
  const [row] = await db.query('SELECT * FROM Payee WHERE Payee_ID = ?', [id]);
  return { status: 201, body: payee(row) };
}

async function get({ auth, params }) {
  const row = await loadPayee(params);
  await access.loadAccount(auth, row.Account_ID);
  return { status: 200, body: payee(row) };
}

async function patch({ auth, params, body }) {
  access.requireCustomer(auth, 'Editing a payee');
  const row = await loadPayee(params);
  await access.loadAccount(auth, row.Account_ID, { allowAdmin: false });
  const nickname = v.str(body || {}, 'nickname', { max: 50 });
  await db.query('UPDATE Payee SET Nickname = ? WHERE Payee_ID = ?', [nickname, row.Payee_ID]);
  const [out] = await db.query('SELECT * FROM Payee WHERE Payee_ID = ?', [row.Payee_ID]);
  return { status: 200, body: payee(out) };
}

// Soft delete: past transactions keep their Payee_ID link.
async function remove({ auth, params, ip }) {
  access.requireCustomer(auth, 'Removing a payee');
  const row = await loadPayee(params);
  await access.loadAccount(auth, row.Account_ID, { allowAdmin: false });
  await db.query('UPDATE Payee SET Status = \'Removed\' WHERE Payee_ID = ?', [row.Payee_ID]);
  await audit('User', Number(auth.sub), 'PAYEE_REMOVED', 'Payee', row.Payee_ID, ip);
  return { status: 204 };
}

async function listForAccount({ auth, params, query }) {
  const id = v.idParam(params.accountId, 'Account');
  await access.loadAccount(auth, id);
  const p = v.paging(query);
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM Payee WHERE Account_ID = ? AND Status = \'Active\'', [id]);
  const rows = await db.query(`SELECT * FROM Payee WHERE Account_ID = ? AND Status = 'Active' ORDER BY Payee_ID LIMIT ${p.limit} OFFSET ${p.offset}`, [id]);
  return { status: 200, body: map.envelope(rows, payee, p, n) };
}

module.exports = (router) => {
  router.add('POST', '/payees', 'any', create);
  router.add('GET', '/payees/:payeeId', 'any', get);
  router.add('PATCH', '/payees/:payeeId', 'any', patch);
  router.add('DELETE', '/payees/:payeeId', 'any', remove);
  router.add('GET', '/accounts/:accountId/payees', 'any', listForAccount);
};
