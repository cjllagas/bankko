'use strict';
// Row (Lab 04 column names) -> JSON (Lab 05 camelCase). Passwords and lockout fields are never mapped.
const iso = (d) => (d ? new Date(d).toISOString() : null);

const user = (r) => ({
  userId: r.User_ID, firstName: r.First_Name, lastName: r.Last_Name, email: r.Email,
  phoneNumber: r.Phone_Number, dateRegistered: iso(r.Date_Registered),
});
const account = (r) => ({
  accountId: r.Account_ID, userId: r.User_ID, accountNumber: r.Account_Number, accountType: r.Account_Type,
  balance: r.Balance, dateOpened: iso(r.Date_Opened), status: r.Status,
});
const biller = (r) => ({ billerId: r.Biller_ID, billerName: r.Biller_Name, category: r.Category, status: r.Status });
const transaction = (r) => ({
  transactionId: r.Transaction_ID, accountId: r.Account_ID, destinationAccountId: r.Destination_Account_ID,
  payeeId: r.Payee_ID, reviewedByAdminId: r.Reviewed_By_Admin_ID, transactionType: r.Transaction_Type,
  amount: r.Amount, transactionDate: iso(r.Transaction_Date), referenceNumber: r.Reference_Number,
  status: r.Status, reviewStatus: r.Review_Status, reviewNote: r.Review_Note, reviewedAt: iso(r.Reviewed_At),
});
const auditLog = (r) => ({
  logId: Number(r.Log_ID), actorType: r.Actor_Type, actorId: r.Actor_ID, action: r.Action,
  entityType: r.Entity_Type, entityId: r.Entity_ID, ipAddress: r.IP_Address, createdAt: iso(r.Created_At),
});

const envelope = (rows, mapper, { page, limit }, total) => ({ data: rows.map(mapper), page, limit, totalItems: Number(total) });

module.exports = { user, account, biller, transaction, auditLog, envelope };
