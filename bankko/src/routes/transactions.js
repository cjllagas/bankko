'use strict';
// #21 POST /transactions   #22 GET /transactions (Admin)   #23 GET /transactions/:id   #24 PATCH /transactions/:id (Admin flag / clear)   #26 GET /transactions/:id/receipt
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const map = require('../lib/map');
const { E, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { requireAdmin } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { rateLimit } = require('../lib/ratelimit');
const access = require('../lib/access');
const stepup = require('../lib/stepup');

const SORT = { transactionId: 'Transaction_ID', transactionDate: 'Transaction_Date', amount: 'Amount', referenceNumber: 'Reference_Number' };
const REVIEW = ['None', 'Flagged', 'Cleared'];
const TYPES = ['Transfer', 'BillPayment'];

// Shared by #22 and #25. `extra` is a fixed SQL fragment written in code, never user input.
async function listTransactions(query, { extra, extraParams = [] } = {}) {
  const status = v.optEnum(query, 'status', ['Pending', 'Completed', 'Failed']);
  const type = v.optEnum(query, 'transactionType', TYPES);
  const review = v.optEnum(query, 'reviewStatus', REVIEW);
  const accountId = extra ? undefined : v.optInt(query, 'accountId');
  const range = v.dateRange(query);
  const p = v.paging(query);
  const s = v.sorting(query, SORT, '-transactionDate');

  const where = [], prm = [];
  if (extra) { where.push(extra); prm.push(...extraParams); }
  if (status) { where.push('Status = ?'); prm.push(status); }
  if (type) { where.push('Transaction_Type = ?'); prm.push(type); }
  if (review) { where.push('Review_Status = ?'); prm.push(review); }
  if (accountId) { where.push('(Account_ID = ? OR Destination_Account_ID = ?)'); prm.push(accountId, accountId); }
  if (range.from) { where.push('Transaction_Date >= ?'); prm.push(`${range.from} 00:00:00`); }
  if (range.to) { where.push('Transaction_Date < DATE_ADD(?, INTERVAL 1 DAY)'); prm.push(`${range.to} 00:00:00`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM \`Transaction\` ${w}`, prm);
  const rows = await db.query(
    `SELECT * FROM \`Transaction\` ${w} ORDER BY ${s.col} ${s.dir}, Transaction_ID DESC LIMIT ${p.limit} OFFSET ${p.offset}`, prm);
  return { status: 200, body: map.envelope(rows, map.transaction, p, n) };
}

async function list({ auth, query }) {
  requireAdmin(auth);
  return listTransactions(query);
}

/* ---------- #21 create a transfer or bill payment ---------- */

function intField(body, name) {
  const n = body[name];
  if (!Number.isInteger(n) || n <= 0) throw E.badRequest('Invalid field.', [`${name} must be a positive integer.`]);
  return n;
}
function amountField(body) {
  const a = body.amount;
  if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0 || a > 9999999999.99 || Math.abs(a * 100 - Math.round(a * 100)) > 1e-6) {
    throw E.badRequest('Invalid amount.', ['amount must be a number greater than 0 with at most 2 decimals.']);
  }
  return Math.round(a * 100) / 100;
}
const peso = (n) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Placeholder for the external payment gateway (Lab 03, arrows 7 and 8). Replace with a real HTTPS call.
async function callGateway() { return true; }

async function newReference(conn) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i++) {
    const ref = `BNK-${day}-${String(crypto.randomInt(0, 1000000)).padStart(6, '0')}`;
    const [r] = await conn.execute('SELECT 1 FROM `Transaction` WHERE Reference_Number = ?', [ref]);
    if (!r.length) return ref;
  }
  throw new Error('Could not allocate a reference number.');
}

// Same Idempotency-Key + same body = the original result again; same key + different body = 409.
async function findReplay(accountId, key, type, amount, destId, payeeId) {
  const [row] = await db.query('SELECT * FROM `Transaction` WHERE Account_ID = ? AND Idempotency_Key = ?', [accountId, key]);
  if (!row) return null;
  const same = row.Transaction_Type === type && Number(row.Amount) === amount
    && (row.Destination_Account_ID ?? null) === destId && (row.Payee_ID ?? null) === payeeId;
  if (!same) throw new HttpError(409, 'Idempotency-Key reuse.', ['This Idempotency-Key was already used with a different request body.']);
  return { status: 200, headers: { 'Idempotent-Replayed': 'true' }, body: map.transaction(row) };
}

async function create({ req, auth, body, ip }) {
  body = body || {};
  access.requireCustomer(auth, 'Creating a transaction');
  const key = String(req.headers['idempotency-key'] || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
    throw E.badRequest('Missing Idempotency-Key.', ['Send a unique Idempotency-Key header (a UUID) with every payment.']);
  }
  const accountId = intField(body, 'accountId');
  const type = v.oneOf(body.transactionType, TYPES, 'transactionType');
  const amount = amountField(body);
  const has = (k) => body[k] !== undefined && body[k] !== null;
  let destId = null, payeeId = null;
  if (type === 'Transfer') {
    if (has('payeeId')) throw E.badRequest('Invalid field.', ['payeeId must not be sent for a Transfer.']);
    destId = intField(body, 'destinationAccountId');
    if (destId === accountId) throw E.badRequest('Invalid destination.', ['The source and destination must be different accounts.']);
  } else {
    if (has('destinationAccountId')) throw E.badRequest('Invalid field.', ['destinationAccountId must not be sent for a BillPayment.']);
    payeeId = intField(body, 'payeeId');
  }

  const src = await access.loadAccount(auth, accountId, { allowAdmin: false });   // 404 / 403 ownership
  const replay = await findReplay(accountId, key, type, amount, destId, payeeId);
  if (replay) return replay;
  const frozen = (a) => new HttpError(403, a.Status === 'Frozen' ? 'Account is frozen.' : 'Account is not active.',
    [a.Status === 'Frozen' ? `Account ${a.Account_ID} is frozen. Contact the bank.` : `Account ${a.Account_ID} is not active.`]);
  if (src.Status !== 'Active') throw frozen(src);

  // Cheap checks first, so a bad request never triggers an SMS.
  let payee = null;
  if (type === 'Transfer') {
    const [dest] = await db.query('SELECT Account_ID, Status FROM Account WHERE Account_ID = ?', [destId]);
    if (!dest || dest.Status !== 'Active') throw E.notFound('Destination account not found.', ['No active account matches the destination.']);
  } else {
    [payee] = await db.query(
      'SELECT p.Payee_ID, p.Biller_Account_Number, b.Biller_Name, b.Status AS Biller_Status FROM Payee p JOIN Biller b ON b.Biller_ID = p.Biller_ID WHERE p.Payee_ID = ? AND p.Account_ID = ? AND p.Status = \'Active\'',
      [payeeId, accountId]);
    if (!payee) throw E.notFound('Payee not found.', [`No active payee ${payeeId} exists on account ${accountId}.`]);
    if (payee.Biller_Status !== 'Active') throw new HttpError(422, 'Biller unavailable.', ['This biller is not accepting payments right now.']);
  }

  // Step-up (Lab 06, measure 11): large transfers need a fresh OTP and a single-use token.
  const needsStepUp = type === 'Transfer' && amount >= config.stepUp.limit;
  const stepToken = String(req.headers['x-step-up-token'] || '');
  if (needsStepUp && !stepToken) {
    await rateLimit(`stepup-send:${auth.sub}`, 10, config.rateLimit.windowSeconds);
    const c = await stepup.challenge(Number(auth.sub));
    const out = {
      success: false, statusCode: 403, message: 'Step-up verification required.',
      errors: [`Transfers of ${config.stepUp.limit.toFixed(2)} or more need a step-up OTP.`, 'An OTP was sent to the registered phone number.'],
      timestamp: new Date().toISOString(), stepUpId: c.stepUpId,
    };
    if (c.devOtp) out.devOtp = c.devOtp;   // development only
    return { status: 403, body: out };
  }

  try {
    const row = await db.tx(async (conn) => {
      // Lock both accounts in id order so two opposite transfers can never deadlock.
      const ids = destId ? [Math.min(accountId, destId), Math.max(accountId, destId)] : [accountId];
      const [locked] = await conn.execute(`SELECT * FROM Account WHERE Account_ID IN (${ids.map(() => '?').join(',')}) ORDER BY Account_ID FOR UPDATE`, ids);
      const s = locked.find((a) => a.Account_ID === accountId);
      const d = destId ? locked.find((a) => a.Account_ID === destId) : null;
      if (s.Status !== 'Active') throw frozen(s);
      if (destId && (!d || d.Status !== 'Active')) throw E.notFound('Destination account not found.', ['No active account matches the destination.']);
      if (Number(s.Balance) < amount) {
        throw new HttpError(422, 'Insufficient balance.', [`Account ${accountId} balance is lower than the requested amount of ${amount.toFixed(2)}.`]);
      }
      if (needsStepUp) await stepup.consume(conn, Number(auth.sub), stepToken);
      if (type === 'BillPayment' && !(await callGateway())) {
        throw new HttpError(502, 'Payment gateway error.', ['The biller could not be reached. No money was debited.']);
      }

      const amt = amount.toFixed(2);
      await conn.execute('UPDATE Account SET Balance = Balance - ? WHERE Account_ID = ?', [amt, accountId]);
      if (destId) await conn.execute('UPDATE Account SET Balance = Balance + ? WHERE Account_ID = ?', [amt, destId]);
      const ref = await newReference(conn);
      const [ins] = await conn.execute(
        'INSERT INTO `Transaction` (Account_ID, Destination_Account_ID, Payee_ID, Transaction_Type, Amount, Reference_Number, Status, Idempotency_Key) VALUES (?,?,?,?,?,?,?,?)',
        [accountId, destId, payeeId, type, amt, ref, 'Completed', key]);
      const txId = ins.insertId;

      const note = (userId, kind, msg) => conn.execute('INSERT INTO Notification (User_ID, Transaction_ID, `Type`, Message) VALUES (?,?,?,?)', [userId, txId, kind, msg]);
      if (type === 'Transfer') {
        await note(s.User_ID, 'SMS', `You sent PHP ${peso(amount)} to account ${d.Account_Number}. Ref: ${ref}.`);
        if (d.User_ID !== s.User_ID) await note(d.User_ID, 'SMS', `You received PHP ${peso(amount)} in account ${d.Account_Number}. Ref: ${ref}.`);
      } else {
        await note(s.User_ID, 'Email', `Your bill payment of PHP ${peso(amount)} to ${payee.Biller_Name} was completed. Ref: ${ref}.`);
      }
      await audit('User', Number(auth.sub), type === 'Transfer' ? 'TRANSFER_CREATED' : 'BILLPAYMENT_CREATED', 'Transaction', txId, ip, conn);
      const [out] = await conn.execute('SELECT * FROM `Transaction` WHERE Transaction_ID = ?', [txId]);
      return out[0];
    });
    return { status: 201, body: map.transaction(row) };
  } catch (e) {
    // Two identical requests at once: the loser hits UNIQUE (Account_ID, Idempotency_Key) and gets the winner's result.
    if (e && e.code === 'ER_DUP_ENTRY') { const r = await findReplay(accountId, key, type, amount, destId, payeeId); if (r) return r; }
    throw e;
  }
}

/* ---------- #23 and #26: who may see a transaction ---------- */

// 'full' = admin or owner of the source account; 'dest' = owner of the destination account (reduced view).
async function viewerRole(auth, row) {
  if (access.isAdmin(auth)) return 'full';
  if (access.isCustomer(auth)) {
    const [s] = await db.query('SELECT User_ID FROM Account WHERE Account_ID = ?', [row.Account_ID]);
    if (s && s.User_ID === Number(auth.sub)) return 'full';
    if (row.Destination_Account_ID) {
      const [d] = await db.query('SELECT User_ID FROM Account WHERE Account_ID = ?', [row.Destination_Account_ID]);
      if (d && d.User_ID === Number(auth.sub)) return 'dest';
    }
  }
  throw access.forbidden('You cannot view this transaction.');
}

async function loadTx(params) {
  const id = v.idParam(params.transactionId, 'Transaction');
  const [row] = await db.query('SELECT * FROM `Transaction` WHERE Transaction_ID = ?', [id]);
  if (!row) throw E.notFound('Transaction not found.', [`No transaction exists with ID ${id}.`]);
  return row;
}

async function get({ auth, params }) {
  const row = await loadTx(params);
  const view = await viewerRole(auth, row);
  const out = map.transaction(row);
  if (view === 'dest') for (const k of ['payeeId', 'reviewedByAdminId', 'reviewStatus', 'reviewNote', 'reviewedAt']) delete out[k];
  return { status: 200, body: out };
}

const mask = (n) => `****-****-${n.slice(-4)}`;
const shortName = (u) => `${u.First_Name} ${u.Last_Name.charAt(0)}.`;

async function receipt({ auth, params }) {
  const row = await loadTx(params);
  const view = await viewerRole(auth, row);
  const [src] = await db.query('SELECT Account_Number FROM Account WHERE Account_ID = ?', [row.Account_ID]);
  const out = {
    referenceNumber: row.Reference_Number, transactionType: row.Transaction_Type, amount: Number(row.Amount),
    transactionDate: new Date(row.Transaction_Date).toISOString(), status: row.Status,
  };
  if (row.Transaction_Type === 'Transfer') {
    const [dst] = await db.query('SELECT a.Account_Number, u.First_Name, u.Last_Name FROM Account a JOIN `User` u ON u.User_ID = a.User_ID WHERE a.Account_ID = ?', [row.Destination_Account_ID]);
    out.accountNumber = view === 'dest' ? mask(src.Account_Number) : src.Account_Number;
    out.destinationAccountNumber = view === 'dest' ? dst.Account_Number : mask(dst.Account_Number);
    out.destinationHolderName = shortName(dst);
  } else {
    const [p] = await db.query('SELECT p.Biller_Account_Number, p.Nickname, b.Biller_Name FROM Payee p JOIN Biller b ON b.Biller_ID = p.Biller_ID WHERE p.Payee_ID = ?', [row.Payee_ID]);
    out.accountNumber = src.Account_Number;
    out.billerName = p.Biller_Name; out.billerAccountNumber = p.Biller_Account_Number; out.nickname = p.Nickname;
  }
  return { status: 200, body: out };
}

// The reviewing admin always comes from the verified token, never from the body.
async function review({ auth, params, body, ip }) {
  requireAdmin(auth);
  const id = v.idParam(params.transactionId, 'Transaction');
  if (body.reviewStatus === undefined) throw E.badRequest('Missing required field.', ['reviewStatus is required.']);
  const status = v.oneOf(body.reviewStatus, REVIEW, 'reviewStatus');
  const note = v.str(body, 'reviewNote', { required: false, max: 255 }) ?? null;

  const row = await db.tx(async (conn) => {
    const [found] = await conn.execute('SELECT Transaction_ID FROM `Transaction` WHERE Transaction_ID = ? FOR UPDATE', [id]);
    if (!found.length) throw E.notFound('Transaction not found.', [`No transaction exists with ID ${id}.`]);
    if (status === 'None') {
      await conn.execute('UPDATE `Transaction` SET Review_Status = ?, Review_Note = NULL, Reviewed_By_Admin_ID = NULL, Reviewed_At = NULL WHERE Transaction_ID = ?', [status, id]);
    } else {
      await conn.execute('UPDATE `Transaction` SET Review_Status = ?, Review_Note = ?, Reviewed_By_Admin_ID = ?, Reviewed_At = UTC_TIMESTAMP() WHERE Transaction_ID = ?', [status, note, auth.sub, id]);
    }
    const action = status === 'Flagged' ? 'TRANSACTION_FLAGGED' : status === 'Cleared' ? 'TRANSACTION_CLEARED' : 'TRANSACTION_REVIEW_RESET';
    await audit('Admin', auth.sub, action, 'Transaction', id, ip, conn);
    const [out] = await conn.execute('SELECT * FROM `Transaction` WHERE Transaction_ID = ?', [id]);
    return out[0];
  });
  return { status: 200, body: map.transaction(row) };
}

module.exports = (router) => {
  router.add('POST', '/transactions', 'any', create);
  router.add('GET', '/transactions', 'any', list);
  router.add('GET', '/transactions/:transactionId/receipt', 'any', receipt);
  router.add('GET', '/transactions/:transactionId', 'any', get);
  router.add('PATCH', '/transactions/:transactionId', 'any', review);
};
module.exports.listTransactions = listTransactions;