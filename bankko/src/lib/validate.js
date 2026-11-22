'use strict';
// Input validation using the Lab 04 rules (types, lengths, ENUM values). Failures give 400.
const { E } = require('./http');

const MAX_INT = 2147483647;

// Path id such as /accounts/101. A malformed id cannot exist, so it is 404 (matches Lab 05 error codes).
function idParam(value, what) {
  if (!/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > MAX_INT) {
    throw E.notFound(`${what} not found.`, [`No ${what.toLowerCase()} exists with ID ${String(value).slice(0, 20)}.`]);
  }
  return Number(value);
}

function oneOf(value, list, name) {
  if (!list.includes(value)) throw E.badRequest(`Invalid ${name}.`, [`${name} must be ${list.join(', ').replace(/, ([^,]*)$/, ' or $1')}.`]);
  return value;
}

// Optional query enum: returns undefined when absent.
function optEnum(q, name, list) {
  if (q[name] === undefined || q[name] === '') return undefined;
  if (!list.includes(q[name])) throw E.badRequest('Invalid query parameter.', [`${name} must be ${list.join(', ').replace(/, ([^,]*)$/, ' or $1')}.`]);
  return q[name];
}

function optInt(q, name) {
  if (q[name] === undefined || q[name] === '') return undefined;
  if (!/^[1-9]\d{0,9}$/.test(q[name]) || Number(q[name]) > MAX_INT) throw E.badRequest('Invalid query parameter.', [`${name} must be a positive integer.`]);
  return Number(q[name]);
}

function paging(q) {
  let page = 1, limit = 10;
  if (q.page !== undefined) {
    if (!/^\d{1,9}$/.test(q.page) || Number(q.page) < 1) throw E.badRequest('Invalid query parameter.', ['page must be an integer of 1 or more.']);
    page = Number(q.page);
  }
  if (q.limit !== undefined) {
    if (!/^\d{1,4}$/.test(q.limit) || Number(q.limit) < 1 || Number(q.limit) > 100) throw E.badRequest('Invalid query parameter.', ['limit must be an integer from 1 to 100.']);
    limit = Number(q.limit);
  }
  return { page, limit, offset: (page - 1) * limit };
}

// sort=-field  ->  { col, dir } using a whitelist (never raw input in SQL).
function sorting(q, map, def) {
  const raw = q.sort === undefined || q.sort === '' ? def : q.sort;
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  if (!Object.prototype.hasOwnProperty.call(map, field)) {
    throw E.badRequest('Invalid query parameter.', [`sort must be one of: ${Object.keys(map).join(', ')} (prefix - for descending).`]);
  }
  return { col: map[field], dir: desc ? 'DESC' : 'ASC' };
}

function dateRange(q) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const parse = (name) => {
    if (q[name] === undefined || q[name] === '') return undefined;
    const ok = re.test(q[name]) && !Number.isNaN(Date.parse(q[name] + 'T00:00:00Z')) &&
      new Date(q[name] + 'T00:00:00Z').toISOString().slice(0, 10) === q[name];
    if (!ok) throw E.badRequest('Invalid query parameter.', [`${name} must be a valid date in YYYY-MM-DD format.`]);
    return q[name];
  };
  const from = parse('dateFrom'), to = parse('dateTo');
  if (from && to && from > to) throw E.badRequest('Invalid date range.', ['dateFrom must not be later than dateTo.']);
  return { from, to };
}

// Body string field. opts: required, max, min.
function str(body, name, { required = true, max = 255, min = 1 } = {}) {
  const v = body[name];
  if (v === undefined || v === null || v === '') {
    if (required) throw E.badRequest('Missing required field.', [`${name} is required.`]);
    return undefined;
  }
  if (typeof v !== 'string') throw E.badRequest('Invalid field.', [`${name} must be a string.`]);
  const t = v.trim();
  if (t.length < min && required) throw E.badRequest('Missing required field.', [`${name} is required.`]);
  if (t.length > max) throw E.badRequest('Invalid field.', [`${name} must not exceed ${max} characters.`]);
  // block control characters (keeps logs and tables clean)
  if (/[\u0000-\u001f\u007f]/.test(t)) throw E.badRequest('Invalid field.', [`${name} contains invalid characters.`]);
  return t;
}

const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

module.exports = { idParam, oneOf, optEnum, optInt, paging, sorting, dateRange, str, likeEscape };
