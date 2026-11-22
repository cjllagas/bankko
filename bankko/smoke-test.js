'use strict';
// Run with the server already started:  node smoke-test.js
// Walks the Admin flow end to end against the seeded bankko database. Needs DEV_SHOW_OTP (default in development).
const BASE = process.env.BASE || 'http://localhost:3000/api/v1';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`); };

async function call(method, path, { token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}
async function login(email, password) {
  const s1 = await call('POST', '/auth/sessions', { body: { email, password } });
  if (s1.status !== 200) return { s1 };
  const s2 = await call('POST', '/auth/otp-verifications', { body: { otpChallengeId: s1.data.otpChallengeId, otp: s1.data.devOtp } });
  return { s1, s2, token: s2.data && s2.data.accessToken };
}

(async () => {
  const bad = await call('POST', '/auth/sessions', { body: { email: 'admin3x@bankko.example', password: 'wrong-password' } });
  check('unknown email -> 401', bad.status === 401, bad.status);

  const a = await login('ana.reyes@bankko.example', 'Adm1n!Secure#2026');
  check('admin login step 1 (#1) -> 200', a.s1.status === 200, JSON.stringify(a.s1.data));
  check('admin login step 2 (#2) -> 200 role Admin', a.s2 && a.s2.status === 200 && a.s2.data.role === 'Admin', a.s2 && JSON.stringify(a.s2.data));
  const T = a.token;
  if (!T) { console.log('Cannot continue without a token.'); process.exit(1); }

  const c = await login('juan.delacruz@email.com', 'MyS3cure!Pass');
  check('customer can log in', !!c.token);
  check('customer calling GET /users -> 403', (await call('GET', '/users', { token: c.token })).status === 403);
  check('no token -> 401', (await call('GET', '/users')).status === 401);

  const users = await call('GET', '/users?sort=lastName&limit=3', { token: T });
  check('GET /users (#4) paginated', users.status === 200 && users.data.totalItems === 5 && users.data.data.length === 3 && !JSON.stringify(users.data).includes('Password'), JSON.stringify(users.data));
  check('GET /users/1 (#5)', (await call('GET', '/users/1', { token: T })).data.email === 'juan.delacruz@email.com');
  check('GET /users/999 -> 404', (await call('GET', '/users/999', { token: T })).status === 404);
  const ua = await call('GET', '/users/1/accounts', { token: T });
  check('GET /users/1/accounts (#11) -> 2 accounts', ua.data.totalItems === 2, JSON.stringify(ua.data));

  const frozen = await call('GET', '/accounts?status=Frozen', { token: T });
  check('GET /accounts?status=Frozen (#8) includes 87', frozen.data.data.some((x) => x.accountId === 87));
  check('GET /accounts/101 (#9) balance is a number', (await call('GET', '/accounts/101', { token: T })).data.balance === 15250.75);
  check('GET /accounts?status=x -> 400', (await call('GET', '/accounts?status=x', { token: T })).status === 400);

  const fr = await call('PATCH', '/accounts/102', { token: T, body: { status: 'Frozen', reason: 'smoke test' } });
  check('PATCH /accounts/102 freeze (#10)', fr.status === 200 && fr.data.status === 'Frozen', JSON.stringify(fr.data));
  const re = await call('PATCH', '/accounts/102', { token: T, body: { status: 'Active' } });
  check('PATCH /accounts/102 reactivate', re.data.status === 'Active');

  const tx = await call('GET', '/transactions?sort=-transactionDate', { token: T });
  check('GET /transactions (#22) -> 3 rows', tx.data.totalItems === 3, JSON.stringify(tx.data));
  check('filter reviewStatus=Flagged -> txn 5000', (await call('GET', '/transactions?reviewStatus=Flagged', { token: T })).data.data[0].transactionId === 5000);
  check('GET /transactions/5001 (#23)', (await call('GET', '/transactions/5001', { token: T })).data.referenceNumber === 'BNK-20261022-000123');
  const th = await call('GET', '/accounts/102/transactions', { token: T });
  check('GET /accounts/102/transactions (#25) includes received transfer', th.data.data.some((x) => x.transactionId === 5001));

  const fl = await call('PATCH', '/transactions/5001', { token: T, body: { reviewStatus: 'Flagged', reviewNote: 'Verify with customer', reviewedByAdminId: 1 } });
  check('PATCH /transactions/5001 flag (#24): reviewer comes from token (3), not body', fl.status === 200 && fl.data.reviewedByAdminId === 3 && fl.data.reviewStatus === 'Flagged', JSON.stringify(fl.data));
  await call('PATCH', '/transactions/5001', { token: T, body: { reviewStatus: 'None' } });
  check('PATCH invalid reviewStatus -> 400', (await call('PATCH', '/transactions/5001', { token: T, body: { reviewStatus: 'Maybe' } })).status === 400);

  const bl = await call('GET', '/billers', { token: T });
  check('GET /billers (#12) -> 4', bl.data.totalItems === 4);
  const nb = await call('POST', '/billers', { token: T, body: { billerName: 'Smoke Test Biller', category: 'Test', status: 'Active' } });
  check('POST /billers (#14) -> 201', nb.status === 201, JSON.stringify(nb.data));
  const put = await call('PUT', `/billers/${nb.data.billerId}`, { token: T, body: { billerName: 'Smoke Test Biller 2', category: 'Test', status: 'Inactive' } });
  check('PUT /billers/:id (#15)', put.status === 200 && put.data.status === 'Inactive');
  check('PUT without status -> 400', (await call('PUT', `/billers/${nb.data.billerId}`, { token: T, body: { billerName: 'x', category: 'y' } })).status === 400);

  const au = await call('GET', '/audit-logs?actorType=Admin', { token: T });
  check('GET /audit-logs (#32) has ACCOUNT_FROZEN', au.data.data.some((x) => x.action === 'ACCOUNT_FROZEN'));
  check('GET /admin/summary', (await call('GET', '/admin/summary', { token: T })).data.frozenAccounts >= 1);

  const lo = await call('DELETE', '/auth/sessions/current', { token: T });
  check('logout (#29) -> 204', lo.status === 204);
  check('token after logout -> 401', (await call('GET', '/users', { token: T })).status === 401);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
