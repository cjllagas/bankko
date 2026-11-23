import { Account, AuditLog, Biller, Notification, Payee, Transaction, User } from '../entities';

// Entity -> JSON (camelCase, ISO 8601 dates). Passwords and lockout fields are never mapped.
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export const mapUser = (u: User) => ({
  userId: u.userId, firstName: u.firstName, lastName: u.lastName, email: u.email,
  phoneNumber: u.phoneNumber, dateRegistered: iso(u.dateRegistered),
});
export const mapAccount = (a: Account) => ({
  accountId: a.accountId, userId: a.userId, accountNumber: a.accountNumber, accountType: a.accountType,
  balance: a.balance, dateOpened: iso(a.dateOpened), status: a.status,
});
export const mapBiller = (b: Biller) => ({ billerId: b.billerId, billerName: b.billerName, category: b.category, status: b.status });
export const mapPayee = (p: Payee) => ({
  payeeId: p.payeeId, accountId: p.accountId, billerId: p.billerId, billerAccountNumber: p.billerAccountNumber,
  nickname: p.nickname, dateAdded: iso(p.dateAdded), status: p.status,
});
export const mapTransaction = (t: Transaction) => ({
  transactionId: t.transactionId, accountId: t.accountId, destinationAccountId: t.destinationAccountId,
  payeeId: t.payeeId, reviewedByAdminId: t.reviewedByAdminId, transactionType: t.transactionType,
  amount: t.amount, transactionDate: iso(t.transactionDate), referenceNumber: t.referenceNumber,
  status: t.status, reviewStatus: t.reviewStatus, reviewNote: t.reviewNote, reviewedAt: iso(t.reviewedAt),
});
export const mapNotification = (n: Notification) => ({
  notificationId: n.notificationId, userId: n.userId, transactionId: n.transactionId, type: n.type,
  message: n.message, dateSent: iso(n.dateSent), status: n.status,
});
export const mapAuditLog = (l: AuditLog) => ({
  logId: Number(l.logId), actorType: l.actorType, actorId: l.actorId, action: l.action,
  entityType: l.entityType, entityId: l.entityId, ipAddress: l.ipAddress, createdAt: iso(l.createdAt),
});
