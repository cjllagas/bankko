'use strict';
// Bankko customer page. Plain JavaScript, no libraries (same style as admin.js).
// All text is inserted with textContent (never innerHTML), so stored data cannot run as script (Lab 06 #6).
(() => {
  const API = '/api/v1';
  const $app = document.getElementById('app');

  /* ---------- storage (sessionStorage: cleared when the tab closes) ---------- */
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* ignore */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };
  const state = {
    token: store.get('bkc_token'), userId: Number(store.get('bkc_uid')) || null,
    name: store.get('bkc_name') || 'Customer', shell: null,
  };

  /* ---------- tiny DOM helper ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') value = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    if (value !== undefined) el.value = value;
    return el;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  const show = (el, on) => el.classList.toggle('hidden', !on);

  /* ---------- formatting ---------- */
  const money = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
  const TAGS = { Completed: 't-ok', Pending: 't-wn', Failed: 't-rd', Active: 't-ok', Inactive: 't-gr', Frozen: 't-rd', Removed: 't-gr', Sent: 't-ok' };
  const tag = (text) => h('span', { class: 'tag ' + (TAGS[text] || 't-gr') }, text);
  const typeLabel = (t) => (t === 'BillPayment' ? 'Bill payment' : t);
  const opts = (...v) => v.map((x) => (Array.isArray(x) ? x : [x, x]));
  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const x = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  };
  // Money is validated like Lab 04: DECIMAL(12,2), Amount > 0.
  function parseAmount(s) {
    const t = String(s).trim().replace(/,/g, '');
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(t) || Number(t) <= 0) return null;
    return Number(t);
  }

  let toastTimer;
  function toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show(t, false), 4000);
  }

  /* ---------- API ---------- */
  class ApiError extends Error {
    constructor(status, data) {
      super((data && data.message) || 'Request failed.');
      this.status = status; this.data = data;
    }
    get detail() { return this.data && this.data.errors && this.data.errors.length ? this.data.errors.join(' ') : this.message; }
  }

  async function api(method, path, { body, query, headers: extra, token = state.token } = {}) {
    const url = new URL(API + path, location.origin);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '' && v !== null) url.searchParams.set(k, v);
    const headers = { ...(extra || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch (_) { throw new ApiError(0, { message: 'Cannot reach the server.', errors: ['Check that the server is running.'] }); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && state.token && !path.startsWith('/auth/')) endSession('Your session has expired. Please log in again.');
      throw new ApiError(res.status, data);
    }
    return data;
  }

  function endSession(message) {
    state.token = null; state.userId = null; state.shell = null;
    ['bkc_token', 'bkc_uid', 'bkc_name'].forEach(store.del);
    document.querySelectorAll('dialog').forEach((d) => d.close());
    renderLogin(message);
  }

  /* ---------- dialogs ---------- */
  function openDialog(title, intro, content, actions) {
    const dlg = h('dialog', { class: 'wide' }, h('h3', null, title), intro ? h('p', { class: 'sub' }, intro) : null, content, actions);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  // fields: [{ name, label, type: text|select, options:[[v,l]], value, required, maxlength, hint, inputmode }]
  function formDialog({ title, intro, fields = [], submit = 'Save', onSubmit }) {
    const inputs = {};
    const err = h('div', { class: 'err hidden' });
    const rows = fields.map((f) => {
      const input = f.type === 'select'
        ? h('select', { value: f.value }, f.options.map(([v, l]) => h('option', { value: v }, l)))
        : h('input', { type: 'text', maxlength: f.maxlength, value: f.value || '', autocomplete: 'off', inputmode: f.inputmode });
      inputs[f.name] = input;
      return h('div', null, h('label', null, f.label), input, f.hint ? h('p', { class: 'hint' }, f.hint) : null);
    });
    const okBtn = h('button', { type: 'submit', class: 'btn' }, submit);
    const dlg = openDialog(title, intro,
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          show(err, false);
          const values = {};
          for (const f of fields) {
            values[f.name] = inputs[f.name].value.trim();
            if (f.required && !values[f.name]) { err.textContent = `${f.label} is required.`; show(err, true); return; }
          }
          okBtn.disabled = true;
          try { await onSubmit(values); dlg.close(); }
          catch (ex) { err.textContent = ex.detail || ex.message; show(err, true); okBtn.disabled = false; }
        },
      }, rows, err,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn alt', onclick: () => dlg.close() }, 'Cancel'), okBtn)));
    const first = Object.values(inputs)[0];
    if (first) first.focus();
  }

  function infoDialog(title, intro, content, extraActions) {
    const dlg = openDialog(title, intro, content,
      h('div', { class: 'actions' }, extraActions || null, h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Close')));
  }

  // rows: [[label, value]] shown before the user confirms a payment or removal.
  function confirmDialog({ title, intro, rows = [], ok = 'Confirm', onOk }) {
    const err = h('div', { class: 'err hidden' });
    const okBtn = h('button', { type: 'button', class: 'btn' }, ok);
    const dlg = openDialog(title, intro,
      h('div', null,
        rows.length ? h('div', { class: 'receipt' }, rows.map(([k, v]) => h('div', { class: 'row' }, h('span', null, k), h('b', null, v)))) : null, err),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn alt', onclick: () => dlg.close() }, 'Cancel'), okBtn));
    okBtn.addEventListener('click', async () => {
      show(err, false); okBtn.disabled = true;
      try { await onOk(); dlg.close(); }
      catch (ex) { if (!ex.cancelled) { err.textContent = ex.detail || ex.message; show(err, true); } okBtn.disabled = false; }
    });
  }

  /* ---------- login (Lab 05 #1, #2) and registration (#3) ---------- */
  function renderLogin(message, good) {
    show(document.getElementById('topWho'), false);
    clear($app);
    const panel = h('div', { class: 'panel' });
    $app.append(h('main', null, h('div', { class: 'auth' }, panel)));

    function step1(msg, ok) {
      clear(panel);
      const err = h('div', { class: 'err hidden' });
      const note = h('div', { class: msg ? (ok ? 'ok' : 'err') : 'err hidden' }, msg || '');
      const showErr = (m) => { err.textContent = m; show(err, true); show(note, false); };
      const email = h('input', { type: 'email', autocomplete: 'username', maxlength: 100, placeholder: 'you@email.com', required: true });
      const pass = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 200, required: true });
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Continue');
      panel.append(
        h('h2', null, 'Log in to Bankko'),
        h('p', { class: 'sub' }, 'Step 1 of 2: enter your email and password.'),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault(); show(err, false); btn.disabled = true;
            try {
              const r = await api('POST', '/auth/sessions', { body: { email: email.value.trim(), password: pass.value }, token: null });
              step2(r);
            } catch (ex) { showErr(ex.detail); btn.disabled = false; }
          },
        }, h('label', null, 'Email address'), email, h('label', null, 'Password'), pass, note, err, btn),
        h('div', { class: 'links' }, h('span', null, 'New to Bankko?'), h('a', { onclick: () => register() }, 'Create an account')));
      email.focus();
    }

    function step2(r) {
      clear(panel);
      const err = h('div', { class: 'err hidden' });
      const showErr = (m) => { err.textContent = m; show(err, true); };
      const boxes = Array.from({ length: 6 }, (_, i) => h('input', {
        maxlength: 1, inputmode: 'numeric', pattern: '[0-9]', 'aria-label': `Digit ${i + 1}`,
        autocomplete: i === 0 ? 'one-time-code' : 'off',
      }));
      boxes.forEach((b, i) => {
        b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, ''); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
        b.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
        b.addEventListener('paste', (e) => {
          e.preventDefault();
          const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
          digits.split('').forEach((d, j) => { boxes[j].value = d; });
          boxes[Math.min(digits.length, 5)].focus();
        });
      });
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Verify and log in');
      panel.append(
        h('h2', null, 'Log in to Bankko'),
        h('p', { class: 'sub' }, `Step 2 of 2: enter the 6-digit code sent to ${r.maskedPhone || 'your phone'}.`),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault(); show(err, false);
            const otp = boxes.map((b) => b.value).join('');
            if (otp.length !== 6) return showErr('Enter all 6 digits.');
            btn.disabled = true;
            try {
              const t = await api('POST', '/auth/otp-verifications', { body: { otpChallengeId: r.otpChallengeId, otp }, token: null });
              if (t.role !== 'Customer') {                    // an Admin token must not stay on the customer page
                await api('DELETE', '/auth/sessions/current', { token: t.accessToken }).catch(() => {});
                showErr('Administrators log in at /admin.');
                btn.disabled = false; return;
              }
              state.token = t.accessToken; state.userId = t.userId; state.name = t.name || 'Customer';
              store.set('bkc_token', state.token); store.set('bkc_uid', String(state.userId));
              try {
                const u = await api('GET', `/users/${state.userId}`);
                state.name = `${u.firstName} ${u.lastName}`;
              } catch (_) { /* keep default name */ }
              store.set('bkc_name', state.name);
              start();
            } catch (ex) { showErr(ex.detail); btn.disabled = false; }
          },
        },
        h('div', { class: 'otp' }, boxes),
        h('p', { class: 'hint' }, `The code expires in ${Math.round((r.otpExpiresInSeconds || 300) / 60)} minutes.`),
        r.devOtp ? h('div', { class: 'dev' }, `Development mode (no SMS gateway): your code is ${r.devOtp}`) : null,
        err, btn),
        h('div', { class: 'links' }, h('a', { onclick: () => step1() }, 'Start over')));
      boxes[0].focus();
    }

    function register() {
      clear(panel);
      const err = h('div', { class: 'err hidden' });
      const showErr = (m) => { err.textContent = m; show(err, true); };
      const f = {
        firstName: h('input', { type: 'text', maxlength: 50, required: true, autocomplete: 'given-name' }),
        lastName: h('input', { type: 'text', maxlength: 50, required: true, autocomplete: 'family-name' }),
        email: h('input', { type: 'email', maxlength: 100, required: true, autocomplete: 'email' }),
        phoneNumber: h('input', { type: 'tel', maxlength: 15, required: true, inputmode: 'numeric', placeholder: '09171234567', autocomplete: 'tel' }),
        password: h('input', { type: 'password', maxlength: 200, required: true, autocomplete: 'new-password' }),
        confirm: h('input', { type: 'password', maxlength: 200, required: true, autocomplete: 'new-password' }),
      };
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Create account');
      panel.append(
        h('h2', null, 'Create your Bankko account'),
        h('p', { class: 'sub' }, 'Your mobile number receives the one-time code each time you log in.'),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault(); show(err, false);
            if (f.password.value.length < 12) return showErr('Password must be at least 12 characters.');
            if (f.password.value !== f.confirm.value) return showErr('The two passwords do not match.');
            btn.disabled = true;
            try {
              await api('POST', '/users', { token: null, body: {
                firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), email: f.email.value.trim(),
                phoneNumber: f.phoneNumber.value.trim(), password: f.password.value,
              } });
              step1('Account created. Log in to continue.', true);
            } catch (ex) { showErr(ex.detail); btn.disabled = false; }
          },
        },
        h('div', { class: 'form2' }, h('div', null, h('label', null, 'First name'), f.firstName), h('div', null, h('label', null, 'Last name'), f.lastName)),
        h('label', null, 'Email address'), f.email,
        h('label', null, 'Mobile number'), f.phoneNumber,
        h('label', null, 'Password'), f.password,
        h('p', { class: 'hint' }, 'At least 12 characters, with 3 of: lower case, upper case, numbers, symbols.'),
        h('label', null, 'Confirm password'), f.confirm, err, btn),
        h('div', { class: 'links' }, h('span', null, 'Already registered?'), h('a', { onclick: () => step1() }, 'Log in')));
      f.firstName.focus();
    }
    step1(message, good);
  }

  /* ---------- shell ---------- */
  const NAV = [['dashboard', 'My accounts'], ['transfer', 'Transfer'], ['bills', 'Pay bills'], ['history', 'History'], ['notifications', 'Notifications'], ['profile', 'Profile']];

  function renderShell() {
    clear($app);
    const links = NAV.map(([key, label]) => h('a', { href: '#' + key, 'data-nav': key }, label));
    const main = h('div', { class: 'main' });
    $app.append(h('div', { class: 'portal' },
      h('aside', { class: 'side' },
        h('div', { class: 'who' }, h('b', null, state.name), h('span', null, 'Customer')),
        links,
        h('div', { class: 'sep' }, 'Account'),
        h('a', { href: '#', onclick: async (e) => { e.preventDefault(); try { await api('DELETE', '/auth/sessions/current'); } catch (_) { /* token may already be gone */ } endSession(); } }, 'Log out')),
      main));
    const who = document.getElementById('topWho');
    who.textContent = state.name; show(who, true);
    state.shell = { main, links };
  }

  const VIEWS = {};
  function route() {
    if (!state.token) return;
    if (!state.shell) renderShell();
    const key = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
    state.shell.links.forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
    const main = clear(state.shell.main);
    VIEWS[key](main);
  }
  function start() { location.hash = '#dashboard'; state.shell = null; route(); }

  /* ---------- shared pieces ---------- */
  async function myAccounts() {
    const r = await api('GET', `/users/${state.userId}/accounts`, { query: { limit: 100 } });
    return r.data;
  }
  const accLabel = (a) => `${a.accountType} ${a.accountNumber} (PHP ${money(a.balance)})`;
  const errBox = (ex) => h('div', { class: 'err' }, ex.detail || ex.message);

  function pager({ page, limit, totalItems }, go) {
    const pages = Math.max(1, Math.ceil(totalItems / limit));
    const from = totalItems === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(totalItems, page * limit);
    const btns = [h('button', { type: 'button', disabled: page <= 1, onclick: () => go(page - 1) }, 'Previous')];
    for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) {
      btns.push(h('button', { type: 'button', class: p === page ? 'cur' : '', onclick: () => go(p) }, p));
    }
    btns.push(h('button', { type: 'button', disabled: page >= pages, onclick: () => go(page + 1) }, 'Next'));
    return h('div', { class: 'pager' }, h('span', null, `Showing ${from}-${to} of ${totalItems}`), h('div', { class: 'btns' }, btns));
  }

  // path() and query() are functions so a filter change is picked up on the next load().
  function pagedTable(host, { path, query, columns, limit = 10, empty = 'No records found.' }) {
    let page = 1;
    const tableWrap = h('div'); const pagerWrap = h('div');
    host.append(tableWrap, pagerWrap);
    async function load(p) {
      if (p) page = p;
      clear(tableWrap).append(h('p', { class: 'empty' }, 'Loading...')); clear(pagerWrap);
      try {
        const res = await api('GET', path(), { query: { page, limit, ...query() } });
        if (res.data.length === 0 && page > 1) { page = 1; return load(); }
        clear(tableWrap);
        if (res.data.length === 0) { tableWrap.append(h('p', { class: 'empty' }, empty)); return; }
        tableWrap.append(h('table', null,
          h('tr', null, columns.map((c) => h('th', { class: c.cls }, c.label))),
          res.data.map((row) => h('tr', null, columns.map((c) => h('td', { class: c.cls }, c.cell(row)))))));
        pagerWrap.append(pager(res, (n) => load(n)));
      } catch (ex) { if (ex.status !== 401) clear(tableWrap).append(errBox(ex)); }
    }
    return { load };
  }

  // Direction of a transaction as seen from a set of the customer's own account ids.
  function direction(t, ids) {
    const out = ids.has(t.accountId); const inn = t.destinationAccountId && ids.has(t.destinationAccountId);
    if (out && inn) return 'own';
    return out ? 'out' : 'in';
  }
  const describe = (t, dir) => (t.transactionType === 'BillPayment' ? 'Bill payment'
    : dir === 'own' ? 'Transfer between my accounts' : dir === 'out' ? 'Transfer sent' : 'Transfer received');
  const amountCell = (t, dir) => h('span', { class: dir === 'out' ? 'amt-out' : dir === 'in' ? 'amt-in' : 'amt-neutral' },
    (dir === 'out' ? '-' : dir === 'in' ? '+' : '') + money(t.amount));

  /* ---------- receipt (#26) ---------- */
  const RECEIPT_LABELS = [
    ['referenceNumber', 'Reference no.'], ['transactionType', 'Type'], ['amount', 'Amount (PHP)'], ['transactionDate', 'Date'], ['status', 'Status'],
    ['accountNumber', 'From account'], ['destinationAccountNumber', 'To account'], ['destinationHolderName', 'Recipient'],
    ['billerName', 'Biller'], ['billerAccountNumber', 'Biller account no.'], ['nickname', 'Payee nickname'],
  ];
  function showReceipt(transactionId) {
    const body = h('p', { class: 'empty' }, 'Loading...');
    infoDialog('E-receipt', null, body, h('button', { type: 'button', class: 'btn alt', onclick: () => window.print() }, 'Print'));
    api('GET', `/transactions/${transactionId}/receipt`).then((r) => {
      body.replaceWith(h('div', { class: 'receipt' }, RECEIPT_LABELS.filter(([k]) => r[k] !== undefined && r[k] !== null).map(([k, label]) => {
        let v = r[k];
        if (k === 'amount') v = money(v);
        else if (k === 'transactionDate') v = when(v);
        else if (k === 'transactionType') v = typeLabel(v);
        return h('div', { class: 'row' }, h('span', null, label), h('b', null, v));
      })));
    }).catch((ex) => body.replaceWith(errBox(ex)));
  }

  /* ---------- money movement: #21 with Idempotency-Key and step-up (#30) ---------- */
  // Asks for the step-up OTP and resolves with the single-use step-up token.
  function askStepUp(data) {
    return new Promise((resolve, reject) => {
      const stepUpId = data && (data.stepUpId || (data.data && data.data.stepUpId));
      const err = h('div', { class: 'err hidden' });
      const otp = h('input', { type: 'text', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '6-digit code' });
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Verify');
      let done = false;
      const dlg = openDialog('Extra verification needed',
        'Large transfers need a new one-time code. We sent it to your registered phone number.',
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault(); show(err, false);
            if (!stepUpId) { err.textContent = 'The server did not return a step-up ID. Please try again.'; show(err, true); return; }
            if (!/^\d{6}$/.test(otp.value.trim())) { err.textContent = 'Enter the 6-digit code.'; show(err, true); return; }
            btn.disabled = true;
            try {
              const r = await api('POST', '/auth/step-ups', { body: { stepUpId, otp: otp.value.trim() } });
              done = true; dlg.close(); resolve(r.stepUpToken);
            } catch (ex) { err.textContent = ex.detail; show(err, true); btn.disabled = false; }
          },
        }, h('label', null, 'One-time code'), otp,
        data && data.devOtp ? h('div', { class: 'dev' }, `Development mode: your code is ${data.devOtp}`) : null, err,
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn alt', onclick: () => dlg.close() }, 'Cancel'), btn)));
      dlg.addEventListener('close', () => { if (!done) reject(Object.assign(new Error('Cancelled.'), { cancelled: true })); });
      otp.focus();
    });
  }

  // One intended payment = one Idempotency-Key. A retry after step-up reuses the same key.
  async function sendPayment(body) {
    const key = uuid(); let stepToken = null;
    for (;;) {
      const headers = { 'Idempotency-Key': key };
      if (stepToken) headers['X-Step-Up-Token'] = stepToken;
      try { return await api('POST', '/transactions', { body, headers }); }
      catch (ex) {
        if (ex.status === 403 && !stepToken && /step-up/i.test(ex.data && ex.data.message || '')) { stepToken = await askStepUp(ex.data); continue; }
        throw ex;
      }
    }
  }

  const noAccounts = () => h('div', { class: 'box' }, h('p', { class: 'empty' }, 'You have no accounts yet. Open one from My accounts.'));

  /* ---------- Dashboard (#11, #25, #7) ---------- */
  function openAccountDialog(reload) {
    formDialog({
      title: 'Open a new account', intro: 'A new account number is issued immediately and starts with a balance of 0.00.',
      fields: [{ name: 'accountType', label: 'Account type', type: 'select', options: opts('Savings', 'Checking'), value: 'Savings' }],
      submit: 'Open account',
      onSubmit: async (v) => { await api('POST', '/accounts', { body: { accountType: v.accountType } }); toast('Account opened.'); reload(); },
    });
  }

  VIEWS.dashboard = (main) => {
    main.append(h('h1', null, `Welcome, ${state.name}`), h('p', { class: 'sub' }, 'Your accounts and latest activity.'));
    const cardsHost = h('div'); const recent = h('div');
    main.append(cardsHost,
      h('div', { class: 'quick' }, [['transfer', 'Send money'], ['bills', 'Pay a bill'], ['history', 'View history'], ['notifications', 'Notifications']].map(([k, l]) => h('a', { href: '#' + k }, l))),
      h('div', { class: 'box' }, h('h3', null, 'Recent transactions', h('a', { href: '#history', class: 'btn sm alt' }, 'View all')), recent));

    async function load() {
      clear(cardsHost).append(h('p', { class: 'empty' }, 'Loading...')); clear(recent);
      let accts;
      try { accts = await myAccounts(); } catch (ex) { if (ex.status !== 401) clear(cardsHost).append(errBox(ex)); return; }
      clear(cardsHost).append(h('div', { class: 'cards' }, accts.map((a, i) => h('div', { class: 'acct' + (i % 2 ? ' g' : '') + (a.status !== 'Active' ? ' frozen' : '') },
        h('div', { class: 'top2' }, h('small', null, a.accountType), a.status !== 'Active' ? tag(a.status) : null),
        h('div', { class: 'n mono' }, a.accountNumber),
        h('div', { class: 'b' }, 'PHP ' + money(a.balance)),
        h('small', null, 'Available balance')))),
        h('div', { class: 'toolbar' }, h('span', { class: 'hint' }, accts.length ? 'A frozen account cannot send money. Contact the bank.' : 'You have no accounts yet.'),
          h('button', { class: 'btn sm', onclick: () => openAccountDialog(load) }, 'Open an account')));
      if (!accts.length) { recent.append(h('p', { class: 'empty' }, 'No transactions yet.')); return; }
      try {
        const ids = new Set(accts.map((a) => a.accountId));
        const lists = await Promise.all(accts.map((a) => api('GET', `/accounts/${a.accountId}/transactions`, { query: { limit: 5, sort: '-transactionDate' } }).then((r) => r.data)));
        const seen = new Map(); lists.flat().forEach((t) => seen.set(t.transactionId, t));
        const rows = [...seen.values()].sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)).slice(0, 6);
        recent.append(rows.length ? h('table', null,
          h('tr', null, ['Date', 'Description', 'Reference', 'Amount', 'Status'].map((t, i) => h('th', { class: i === 3 ? 'r' : '' }, t))),
          rows.map((t) => { const d = direction(t, ids); return h('tr', null,
            h('td', { class: 'nowrap' }, when(t.transactionDate)), h('td', null, describe(t, d)), h('td', { class: 'mono' }, t.referenceNumber),
            h('td', { class: 'r' }, amountCell(t, d)), h('td', null, tag(t.status))); })) : h('p', { class: 'empty' }, 'No transactions yet.'));
      } catch (ex) { if (ex.status !== 401) recent.append(errBox(ex)); }
    }
    load();
  };

  /* ---------- Transfer (#31 lookup, #21) ---------- */
  VIEWS.transfer = async (main) => {
    main.append(h('h1', null, 'Transfer money'), h('p', { class: 'sub' }, 'Send money to your own account or to another Bankko account.'));
    let accts;
    try { accts = await myAccounts(); } catch (ex) { if (ex.status !== 401) main.append(errBox(ex)); return; }
    const sources = accts.filter((a) => a.status === 'Active');
    if (!sources.length) { main.append(noAccounts()); return; }

    const from = h('select', null, sources.map((a) => h('option', { value: a.accountId }, accLabel(a))));
    const to = h('select');
    const number = h('input', { type: 'text', maxlength: 20, placeholder: '1002-3350-4471', autocomplete: 'off' });
    const found = h('div', { class: 'found hidden' });
    const amount = h('input', { type: 'text', inputmode: 'decimal', maxlength: 13, placeholder: '0.00', autocomplete: 'off' });
    const err = h('div', { class: 'err hidden' });
    const numberRow = h('div', null, h('label', null, 'Recipient account number'),
      h('div', { class: 'lookup' }, number, h('button', { type: 'button', class: 'btn sm alt', onclick: () => lookup().catch(() => {}) }, 'Look up')), found);
    const btn = h('button', { type: 'submit', class: 'btn' }, 'Review transfer');
    let target = null; // { accountId, accountNumber, holderName }

    function rebuildTo() {
      const src = Number(from.value);
      clear(to).append(...accts.filter((a) => a.accountId !== src).map((a) => h('option', { value: a.accountId }, 'My ' + accLabel(a))), h('option', { value: 'other' }, 'Another Bankko account...'));
      to.value = to.options.length > 1 ? to.options[0].value : 'other';
      toggle();
    }
    function toggle() { show(numberRow, to.value === 'other'); target = null; show(found, false); }
    async function lookup() {
      show(err, false); show(found, false); target = null;
      const n = number.value.trim();
      if (!n) { err.textContent = 'Enter the recipient account number.'; show(err, true); throw new Error('empty'); }
      try {
        const r = await api('GET', '/accounts/lookup', { query: { accountNumber: n } });
        target = { accountId: r.accountId, accountNumber: r.accountNumber, holderName: r.holderName };
        found.textContent = `${r.holderName} - ${r.accountType} ${r.accountNumber}`; show(found, true);
      } catch (ex) { err.textContent = ex.detail; show(err, true); throw ex; }
    }
    from.addEventListener('change', rebuildTo);
    to.addEventListener('change', toggle);
    number.addEventListener('input', () => { target = null; show(found, false); });

    main.append(h('div', { class: 'box wide' }, h('form', {
      onsubmit: async (e) => {
        e.preventDefault(); show(err, false);
        const amt = parseAmount(amount.value);
        if (amt === null) { err.textContent = 'Enter an amount greater than 0 with at most 2 decimals.'; show(err, true); return; }
        let destId; let destText;
        if (to.value === 'other') {
          if (!target) { try { await lookup(); } catch (_) { return; } }
          destId = target.accountId; destText = `${target.holderName} (${target.accountNumber})`;
        } else { destId = Number(to.value); destText = to.options[to.selectedIndex].text; }
        const src = accts.find((a) => a.accountId === Number(from.value));
        confirmDialog({
          title: 'Confirm transfer', intro: 'Check the details before you send.', ok: 'Send money',
          rows: [['From', `${src.accountType} ${src.accountNumber}`], ['To', destText], ['Amount', 'PHP ' + money(amt)]],
          onOk: async () => {
            const t = await sendPayment({ accountId: src.accountId, destinationAccountId: destId, transactionType: 'Transfer', amount: amt });
            toast('Transfer completed.'); showReceipt(t.transactionId);
            amount.value = ''; number.value = ''; target = null; show(found, false);
            myAccounts().then((fresh) => { accts = fresh; }).catch(() => {});
          },
        });
      },
    },
    h('label', null, 'From account'), from, h('label', null, 'To'), to, numberRow,
    h('label', null, 'Amount (PHP)'), amount,
    h('p', { class: 'hint' }, 'Transfers of PHP 50,000.00 or more need an extra one-time code.'), err, btn)));
    rebuildTo();
  };

  /* ---------- Pay bills (#12, #16, #18, #19, #20, #21) ---------- */
  VIEWS.bills = async (main) => {
    main.append(h('h1', null, 'Pay bills'), h('p', { class: 'sub' }, 'Save your billers once, then pay them in a few taps.'));
    let accts; let billers;
    try {
      [accts, billers] = await Promise.all([myAccounts(), api('GET', '/billers', { query: { limit: 100 } }).then((r) => r.data)]);
    } catch (ex) { if (ex.status !== 401) main.append(errBox(ex)); return; }
    if (!accts.length) { main.append(noAccounts()); return; }
    const billerName = (id) => (billers.find((b) => b.billerId === id) || {}).billerName || `Biller ${id}`;

    const sel = h('select', null, accts.map((a) => h('option', { value: a.accountId }, accLabel(a) + (a.status !== 'Active' ? ' - ' + a.status : ''))));
    const host = h('div');
    const acct = () => accts.find((a) => a.accountId === Number(sel.value));

    function addPayee() {
      const active = billers.filter((b) => b.status === 'Active');
      if (!active.length) return toast('No billers are available right now.', true);
      formDialog({
        title: 'Add a payee', intro: `Saved under ${acct().accountNumber}.`, submit: 'Save payee',
        fields: [
          { name: 'billerId', label: 'Biller', type: 'select', options: active.map((b) => [b.billerId, `${b.billerName} (${b.category})`]) },
          { name: 'billerAccountNumber', label: 'Your account / reference number at the biller', maxlength: 50, required: true, hint: 'For example your electric meter number.' },
          { name: 'nickname', label: 'Nickname (optional)', maxlength: 50 },
        ],
        onSubmit: async (v) => {
          await api('POST', '/payees', { body: { accountId: acct().accountId, billerId: Number(v.billerId), billerAccountNumber: v.billerAccountNumber, nickname: v.nickname || undefined } });
          toast('Payee saved.'); load();
        },
      });
    }

    function payDialog(p) {
      formDialog({
        title: `Pay ${p.nickname || billerName(p.billerId)}`, intro: `${billerName(p.billerId)} - ${p.billerAccountNumber}. Paid from ${acct().accountNumber}.`, submit: 'Pay bill',
        fields: [{ name: 'amount', label: 'Amount (PHP)', maxlength: 13, required: true, inputmode: 'decimal' }],
        onSubmit: async (v) => {
          const amt = parseAmount(v.amount);
          if (amt === null) throw new ApiError(400, { message: 'Invalid amount.', errors: ['Enter an amount greater than 0 with at most 2 decimals.'] });
          const t = await sendPayment({ accountId: acct().accountId, payeeId: p.payeeId, transactionType: 'BillPayment', amount: amt });
          toast('Bill paid.'); showReceipt(t.transactionId);
          myAccounts().then((fresh) => { accts = fresh; }).catch(() => {});
        },
      });
    }
    const renameDialog = (p) => formDialog({
      title: 'Rename payee', submit: 'Save', fields: [{ name: 'nickname', label: 'Nickname', maxlength: 50, required: true, value: p.nickname || '' }],
      onSubmit: async (v) => { await api('PATCH', `/payees/${p.payeeId}`, { body: { nickname: v.nickname } }); toast('Payee updated.'); load(); },
    });
    const removeDialog = (p) => confirmDialog({
      title: 'Remove payee', intro: 'Your past payments to this payee stay in your history.', ok: 'Remove',
      rows: [['Payee', p.nickname || billerName(p.billerId)], ['Biller', billerName(p.billerId)]],
      onOk: async () => { await api('DELETE', `/payees/${p.payeeId}`); toast('Payee removed.'); load(); },
    });

    async function load() {
      clear(host).append(h('p', { class: 'empty' }, 'Loading...'));
      try {
        const r = await api('GET', `/accounts/${sel.value}/payees`, { query: { limit: 100 } });
        clear(host).append(r.data.length ? h('table', null,
          h('tr', null, ['Payee', 'Biller', 'Reference no.', ''].map((t) => h('th', null, t))),
          r.data.map((p) => h('tr', null, h('td', null, p.nickname || '-'), h('td', null, billerName(p.billerId)), h('td', { class: 'mono' }, p.billerAccountNumber),
            h('td', { class: 'r nowrap' },
              h('button', { class: 'btn sm', onclick: () => payDialog(p) }, 'Pay'),
              h('button', { class: 'btn sm alt', onclick: () => renameDialog(p) }, 'Rename'),
              h('button', { class: 'btn sm alt', onclick: () => removeDialog(p) }, 'Remove'))))) : h('p', { class: 'empty' }, 'No saved payees for this account yet.'));
      } catch (ex) { if (ex.status !== 401) clear(host).append(errBox(ex)); }
    }
    sel.addEventListener('change', load);
    main.append(h('div', { class: 'box' },
      h('h3', null, 'Saved payees', h('button', { class: 'btn sm', onclick: addPayee }, 'Add payee')),
      h('label', null, 'Pay from account'), sel, h('div', { class: 'divider' }), host));
    load();
  };

  /* ---------- History (#25, #26) ---------- */
  VIEWS.history = async (main) => {
    main.append(h('h1', null, 'Transaction history'), h('p', { class: 'sub' }, 'Everything sent from or received by your account.'));
    let accts;
    try { accts = await myAccounts(); } catch (ex) { if (ex.status !== 401) main.append(errBox(ex)); return; }
    if (!accts.length) { main.append(noAccounts()); return; }
    const sel = h('select', null, accts.map((a) => h('option', { value: a.accountId }, accLabel(a))));
    const type = h('select', null, h('option', { value: '' }, 'All'), opts(['Transfer', 'Transfer'], ['BillPayment', 'Bill payment']).map(([v, l]) => h('option', { value: v }, l)));
    const status = h('select', null, h('option', { value: '' }, 'All'), opts('Pending', 'Completed', 'Failed').map(([v, l]) => h('option', { value: v }, l)));
    const dFrom = h('input', { type: 'date' }); const dTo = h('input', { type: 'date' });
    const err = h('div', { class: 'err hidden' });
    const tableHost = h('div');
    const table = pagedTable(tableHost, {
      path: () => `/accounts/${sel.value}/transactions`,
      query: () => ({ sort: '-transactionDate', transactionType: type.value, status: status.value, dateFrom: dFrom.value, dateTo: dTo.value }),
      columns: [
        { label: 'Date', cell: (t) => h('span', { class: 'nowrap' }, when(t.transactionDate)) },
        { label: 'Description', cell: (t) => describe(t, t.accountId === Number(sel.value) ? 'out' : 'in') },
        { label: 'Reference', cell: (t) => h('span', { class: 'mono' }, t.referenceNumber) },
        { label: 'Amount', cls: 'r', cell: (t) => amountCell(t, t.accountId === Number(sel.value) ? 'out' : 'in') },
        { label: 'Status', cell: (t) => tag(t.status) },
        { label: '', cls: 'r', cell: (t) => h('button', { class: 'btn sm alt', onclick: () => showReceipt(t.transactionId) }, 'Receipt') },
      ],
    });
    const apply = (e) => {
      if (e) e.preventDefault();
      show(err, false);
      if (dFrom.value && dTo.value && dFrom.value > dTo.value) { err.textContent = 'The From date must not be later than the To date.'; show(err, true); return; }
      table.load(1);
    };
    sel.addEventListener('change', () => apply());
    main.append(h('div', { class: 'box' }, h('form', { onsubmit: apply },
      h('div', { class: 'filters' },
        h('div', null, h('label', null, 'Account'), sel), h('div', null, h('label', null, 'Type'), type), h('div', null, h('label', null, 'Status'), status),
        h('div', null, h('label', null, 'From'), dFrom), h('div', null, h('label', null, 'To'), dTo)),
      h('div', { class: 'toolbar' }, h('div', { class: 'btnrow' },
        h('button', { type: 'submit', class: 'btn sm' }, 'Apply filters'),
        h('button', { type: 'button', class: 'btn sm alt', onclick: () => { type.value = ''; status.value = ''; dFrom.value = ''; dTo.value = ''; apply(); } }, 'Reset'))),
      err), tableHost));
    table.load(1);
  };

  /* ---------- Notifications (#28) ---------- */
  VIEWS.notifications = (main) => {
    main.append(h('h1', null, 'Notifications'), h('p', { class: 'sub' }, 'Email and SMS alerts sent after your transactions.'));
    const type = h('select', null, h('option', { value: '' }, 'All'), opts('Email', 'SMS').map(([v, l]) => h('option', { value: v }, l)));
    const status = h('select', null, h('option', { value: '' }, 'All'), opts('Sent', 'Failed').map(([v, l]) => h('option', { value: v }, l)));
    const tableHost = h('div');
    const table = pagedTable(tableHost, {
      path: () => `/users/${state.userId}/notifications`,
      query: () => ({ type: type.value, status: status.value }),
      columns: [
        { label: 'Date', cell: (n) => h('span', { class: 'nowrap' }, when(n.dateSent)) },
        { label: 'Channel', cell: (n) => n.type },
        { label: 'Message', cell: (n) => n.message },
        { label: 'Status', cell: (n) => tag(n.status) },
        { label: '', cls: 'r', cell: (n) => h('button', { class: 'btn sm alt', onclick: () => showReceipt(n.transactionId) }, 'Receipt') },
      ],
      empty: 'No notifications yet.',
    });
    main.append(h('div', { class: 'box' }, h('form', { onsubmit: (e) => { e.preventDefault(); table.load(1); } },
      h('div', { class: 'filters' }, h('div', null, h('label', null, 'Channel'), type), h('div', null, h('label', null, 'Status'), status),
        h('div', null, h('button', { type: 'submit', class: 'btn sm' }, 'Apply filters')))), tableHost));
    table.load(1);
  };

  /* ---------- Profile (#5, #6) ---------- */
  VIEWS.profile = async (main) => {
    main.append(h('h1', null, 'My profile'), h('p', { class: 'sub' }, 'Your details on file.'));
    const box = h('div', { class: 'box wide' }); main.append(box);
    async function load() {
      clear(box).append(h('p', { class: 'empty' }, 'Loading...'));
      try {
        const u = await api('GET', `/users/${state.userId}`);
        clear(box).append(
          h('div', { class: 'receipt' },
            [['Name', `${u.firstName} ${u.lastName}`], ['Email', u.email], ['Mobile number', u.phoneNumber], ['Member since', when(u.dateRegistered)]]
              .map(([k, v]) => h('div', { class: 'row' }, h('span', null, k), h('b', null, v)))),
          h('div', { class: 'toolbar', style: 'margin-top:16px' }, h('span', { class: 'hint' }, 'Login codes are sent to this mobile number.'),
            h('button', { class: 'btn sm', onclick: () => formDialog({
              title: 'Change mobile number', submit: 'Save',
              fields: [{ name: 'phoneNumber', label: 'New mobile number', maxlength: 15, required: true, value: u.phoneNumber, inputmode: 'numeric' }],
              onSubmit: async (v) => { await api('PATCH', `/users/${state.userId}`, { body: { phoneNumber: v.phoneNumber } }); toast('Mobile number updated.'); load(); },
            }) }, 'Change mobile number')));
      } catch (ex) { if (ex.status !== 401) clear(box).append(errBox(ex)); }
    }
    load();
  };

  /* ---------- boot ---------- */
  window.addEventListener('hashchange', route);
  if (state.token && state.userId) { state.shell = null; route(); } else renderLogin();
})();