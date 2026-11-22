'use strict';
// #27 GET /notifications/:id   #28 GET /users/:userId/notifications   (Owner or Admin; read-only, created by the system)
const db = require('../db');
const map = require('../lib/map');
const { E } = require('../lib/http');
const v = require('../lib/validate');
const access = require('../lib/access');

const note = (r) => ({
  notificationId: r.Notification_ID, userId: r.User_ID, transactionId: r.Transaction_ID, type: r.Type,
  message: r.Message, dateSent: new Date(r.Date_Sent).toISOString(), status: r.Status,
});

async function getOne({ auth, params }) {
  const id = v.idParam(params.notificationId, 'Notification');
  const [row] = await db.query('SELECT * FROM Notification WHERE Notification_ID = ?', [id]);
  if (!row) throw E.notFound('Notification not found.', [`No notification exists with ID ${id}.`]);
  access.requireOwnerOrAdmin(auth, row.User_ID);
  return { status: 200, body: note(row) };
}

async function listForUser({ auth, params, query }) {
  const userId = v.idParam(params.userId, 'User');
  access.requireOwnerOrAdmin(auth, userId);
  const type = v.optEnum(query, 'type', ['Email', 'SMS']);
  const status = v.optEnum(query, 'status', ['Sent', 'Failed']);
  const p = v.paging(query);
  const [u] = await db.query('SELECT User_ID FROM `User` WHERE User_ID = ?', [userId]);
  if (!u) throw E.notFound('User not found.', [`No user exists with ID ${userId}.`]);
  const where = ['User_ID = ?'], prm = [userId];
  if (type) { where.push('`Type` = ?'); prm.push(type); }
  if (status) { where.push('Status = ?'); prm.push(status); }
  const w = 'WHERE ' + where.join(' AND ');
  const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM Notification ${w}`, prm);
  const rows = await db.query(`SELECT * FROM Notification ${w} ORDER BY Notification_ID DESC LIMIT ${p.limit} OFFSET ${p.offset}`, prm);
  return { status: 200, body: map.envelope(rows, note, p, n) };
}

module.exports = (router) => {
  router.add('GET', '/notifications/:notificationId', 'any', getOne);
  router.add('GET', '/users/:userId/notifications', 'any', listForUser);
};
