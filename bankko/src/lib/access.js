'use strict';
// Ownership and role helpers shared by the customer routes (Lab 06, measure 5: RBAC + ownership, deny by default).
const db = require('../db');
const { HttpError, E } = require('./http');

const forbidden = (...errors) => new HttpError(403, 'Access denied.', errors);
const isAdmin = (auth) => auth.role === 'Admin';
const isCustomer = (auth) => auth.role === 'Customer';

function requireCustomer(auth, what = 'This action') {
  if (!isCustomer(auth)) throw forbidden(`${what} is only available to customers.`);
}

// Allowed when the caller is an Admin, or the Customer whose own record it is.
function requireOwnerOrAdmin(auth, userId) {
  if (isAdmin(auth) || (isCustomer(auth) && Number(auth.sub) === Number(userId))) return;
  throw forbidden('You can only access your own records.');
}

// Loads an account and checks that the caller may use it (404 unknown, 403 not yours).
async function loadAccount(auth, accountId, { allowAdmin = true } = {}) {
  const [acct] = await db.query('SELECT * FROM Account WHERE Account_ID = ?', [accountId]);
  if (!acct) throw E.notFound('Account not found.', [`No account exists with ID ${accountId}.`]);
  if (isAdmin(auth)) {
    if (!allowAdmin) throw forbidden('Administrators cannot do this on a customer account.');
    return acct;
  }
  if (!isCustomer(auth) || Number(auth.sub) !== acct.User_ID) throw forbidden(`You do not own account ${accountId}.`);
  return acct;
}

module.exports = { forbidden, isAdmin, isCustomer, requireCustomer, requireOwnerOrAdmin, loadAccount };
