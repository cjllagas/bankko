'use strict';
// Bankko administrator console. Plain JavaScript, no libraries.
// All text is inserted with textContent (never innerHTML), so stored data cannot run as script (XSS, Lab 06 #6).
(() => {
  const API = '/api/v1';
  const $app = document.getElementById('app');

  /* ---------- storage (sessionStorage: cleared when the tab closes) ---------- */
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* ignore */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (_) { /* ignore */ } },
  };
  const state = { token: store.get('bk_token'), name: store.get('bk_name') || 'Administrator', q: {}, shell: null };

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
  const TAGS = {
    Completed: 't-ok', Pending: 't-wn', Failed: 't-rd',
    None: 't-gr', Flagged: 't-wn', Cleared: 't-ok',
    Active: 't-ok', Inactive: 't-gr', Frozen: 't-rd', Removed: 't-gr',
  };
  const tag = (text) => h('span', { class: 'tag ' + (TAGS[text] || 't-gr') }, text);
  const typeLabel = (t) => (t === 'BillPayment' ? 'Bill payment' : t);

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

  async function api(method, path, { body, query, token = state.token } = {}) {
    const url = new URL(API + path, location.origin);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '' && v !== null) url.searchParams.set(k, v);
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch (_) { throw new ApiError(0, { message: 'Cannot reach the server.', errors: ['Check that the server is running.'] }); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && state.token && !path.startsWith('/auth/')) {
        endSession('Your session has expired. Please log in again.');
      }
      throw new ApiError(res.status, data);
    }
    return data;
  }

  function endSession(message) {
    state.token = null; state.shell = null;
    store.del('bk_token'); store.del('bk_name');
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

  // fields: [{ name, label, type: text|textarea|select, options:[[v,l]], value, required, maxlength, hint }]
  function formDialog({ title, intro, fields = [], submit = 'Save', onSubmit }) {
    const inputs = {};
    const err = h('div', { class: 'err hidden' });
    const rows = fields.map((f) => {
      const input = f.type === 'textarea'
        ? h('textarea', { maxlength: f.maxlength, value: f.value || '' })
        : f.type === 'select'
          ? h('select', { value: f.value }, f.options.map(([v, l]) => h('option', { value: v }, l)))
          : h('input', { type: 'text', maxlength: f.maxlength, value: f.value || '', autocomplete: 'off' });
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

  function infoDialog(title, intro, content) {
    const dlg = openDialog(title, intro, content,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Close')));
  }

  /* ---------- login (Lab 05 #1 and #2) ---------- */
  function renderLogin(message) {
    show(document.getElementById('topWho'), false);
    clear($app);
    const err = h('div', { class: 'err hidden' });
    const note = h('div', { class: message ? 'err' : 'err hidden' }, message || '');
    const panel = h('div', { class: 'panel' });
    $app.append(h('main', null, h('div', { class: 'auth' }, panel)));

    const showErr = (m) => { err.textContent = m; show(err, true); show(note, false); };

    // Stores the session once the JWT is issued. Returns false when a Customer token ended up in this console.
    async function finish(r) {
      if (r.role !== 'Admin') {
        await api('DELETE', '/auth/sessions/current', { token: r.accessToken }).catch(() => {});
        return false;
      }
      state.token = r.accessToken; state.name = r.name || 'Administrator';
      store.set('bk_token', state.token); store.set('bk_name', state.name);
      start();
      return true;
    }

    // Login step 2 (#2 verify, #30 resend): type the 6-digit code that was emailed.
    function codeStep(c) {
      clear(panel);
      const info = h('div', { class: 'hint' });
      const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]{6}', placeholder: '6-digit code', required: true });
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Verify and log in');
      const demo = h('div', { class: 'demo hidden' });
      const showDemo = () => {                         // only present when the server runs with DEMO_SHOW_CODE=true
        clear(demo);
        if (!c.demoCode) { show(demo, false); return; }
        demo.append(h('span', null, 'DEMO MODE - your verification code:'), h('b', null, c.demoCode),
          h('button', { type: 'button', onclick: () => { code.value = c.demoCode; code.focus(); } }, 'Fill it in'));
        show(demo, true);
      };
      const resend = h('a', { onclick: () => doResend(), style: 'cursor:pointer' }, 'Resend code');
      let wait = c.resendAfterSeconds || 60, timer;
      const tick = () => {
        resend.textContent = wait > 0 ? `Resend code (${wait}s)` : 'Resend code';
        resend.style.opacity = wait > 0 ? '.5' : '1';
        if (wait > 0) { wait -= 1; timer = setTimeout(tick, 1000); }
      };
      async function doResend() {
        if (wait > 0) return;
        show(err, false);
        try {
          c = await api('POST', '/auth/sessions/resend', { body: { challengeId: c.challengeId }, token: null });
          info.textContent = 'A new code was sent to ' + c.sentTo + '.';
          wait = c.resendAfterSeconds || 60; tick(); showDemo();
        } catch (ex) { showErr(ex.detail); }
      }
      panel.append(
        h('h2', null, 'Enter your verification code'),
        h('p', { class: 'sub' }, 'We sent a 6-digit code to ' + c.sentTo + '. It expires in ' + Math.round(c.expiresInSeconds / 60) + ' minutes.'),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault(); show(err, false); btn.disabled = true;
            try {
              const r = await api('POST', '/auth/sessions/verify', { body: { challengeId: c.challengeId, code: code.value.trim() }, token: null });
              clearTimeout(timer);
              if (!(await finish(r))) { step1(); showErr('This console is for administrators only.'); }
            } catch (ex) { showErr(ex.detail); btn.disabled = false; code.select(); }
          },
        }, h('label', null, 'Verification code'), code, demo, info, err, btn),
        h('div', { class: 'links' }, resend, h('a', { onclick: () => { clearTimeout(timer); step1(); }, style: 'cursor:pointer' }, 'Back to log in')));
      tick(); showDemo(); code.focus();
    }

    function step1() {
      clear(panel);
      const email = h('input', { type: 'email', autocomplete: 'username', maxlength: 100, placeholder: 'admin@bankko.example', required: true });
      const pass = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 200, required: true });
      const btn = h('button', { type: 'submit', class: 'btn' }, 'Log in');
      panel.append(
        h('h2', null, 'Administrator log in'),
        h('p', { class: 'sub' }, 'Enter your staff email and password.'),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault(); show(err, false); btn.disabled = true;
            try {
              const r = await api('POST', '/auth/sessions', { body: { email: email.value.trim(), password: pass.value }, token: null });
              if (r.verificationRequired) {                   // step 2: the code that was emailed to the administrator
                if (r.role !== 'Admin') { showErr('This console is for administrators only.'); btn.disabled = false; return; }
                codeStep(r); return;
              }
              if (!(await finish(r))) { showErr('This console is for administrators only.'); btn.disabled = false; }
            } catch (ex) { showErr(ex.detail); btn.disabled = false; }
          },
        }, h('label', null, 'Email address'), email, h('label', null, 'Password'), pass, note, err, btn));
      email.focus();
    }

    step1();
  }

  /* ---------- shell ---------- */
  const NAV = [['transactions', 'Transactions'], ['accounts', 'Accounts'], ['users', 'Users'], ['billers', 'Billers'], ['audit', 'Audit log']];

  function renderShell() {
    clear($app);
    const links = NAV.map(([key, label]) => h('a', { href: '#' + key, 'data-nav': key }, label));
    const main = h('div', { class: 'main' });
    $app.append(h('div', { class: 'portal' },
      h('aside', { class: 'side' },
        h('div', { class: 'who' }, h('b', null, state.name), h('span', null, 'Administrator')),
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
    const key = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'transactions';
    state.shell.links.forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
    const main = clear(state.shell.main);
    VIEWS[key](main);
  }
  function start() { if (!location.hash) location.hash = '#transactions'; state.shell = null; route(); }

  /* ---------- generic list view ---------- */
  function listView(main, cfg) {
    const st = (state.q[cfg.key] ||= { page: 1, f: {} });
    const limit = cfg.limit || 10;
    const inputs = {};
    const tableWrap = h('div');
    const pagerWrap = h('div');

    const fieldEls = cfg.filters.map((f) => {
      const input = f.type === 'select'
        ? h('select', { value: st.f[f.name] || '' }, h('option', { value: '' }, 'All'), f.options.map(([v, l]) => h('option', { value: v }, l)))
        : h('input', { type: f.type || 'text', value: st.f[f.name] || '', maxlength: 50, autocomplete: 'off' });
      inputs[f.name] = input;
      return h('div', null, h('label', null, f.label), input);
    });
    const apply = (e) => {
      e.preventDefault();
      st.f = {}; for (const n in inputs) if (inputs[n].value) st.f[n] = inputs[n].value;
      st.page = 1; load();
    };
    const reset = () => { st.f = {}; st.page = 1; for (const n in inputs) inputs[n].value = ''; load(); };

    main.append(h('h1', null, cfg.title), h('p', { class: 'sub' }, cfg.sub));
    if (cfg.top) main.append(cfg.top());
    main.append(h('div', { class: 'box' },
      h('form', { onsubmit: apply },
        h('div', { class: 'filters' }, fieldEls),
        h('div', { class: 'toolbar' },
          h('div', { class: 'btnrow' }, h('button', { type: 'submit', class: 'btn sm' }, 'Apply filters'), h('button', { type: 'button', class: 'btn sm alt', onclick: reset }, 'Reset')),
          cfg.toolbar ? cfg.toolbar(() => load()) : null)),
      tableWrap, pagerWrap),
      cfg.bottom ? cfg.bottom() : null);

    async function load() {
      clear(tableWrap).append(h('p', { class: 'empty' }, 'Loading...'));
      clear(pagerWrap);
      try {
        const res = await api('GET', cfg.path, { query: { page: st.page, limit, sort: cfg.sort, ...st.f } });
        if (res.data.length === 0 && st.page > 1) { st.page = 1; return load(); }
        clear(tableWrap);
        if (res.data.length === 0) { tableWrap.append(h('p', { class: 'empty' }, 'No records found.')); return; }
        tableWrap.append(h('table', null,
          h('tr', null, cfg.columns.map((c) => h('th', { class: c.cls }, c.label))),
          res.data.map((row) => h('tr', null, cfg.columns.map((c) => h('td', { class: c.cls }, c.cell(row, load)))))));
        pagerWrap.append(pager(res, (p) => { st.page = p; load(); }));
      } catch (ex) {
        if (ex.status === 401) return;
        clear(tableWrap).append(h('div', { class: 'err' }, ex.detail));
      }
    }
    load();
    return load;
  }

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

  const opts = (...v) => v.map((x) => (Array.isArray(x) ? x : [x, x]));

  /* ---------- Transactions (#22, #24, #10, #32) ---------- */
  let refreshSummary = () => {};
  let refreshRecent = () => {};

  function summaryCards() {
    const els = { t: h('b', { class: 'num' }, '-'), f: h('b', { class: 'num red' }, '-'), a: h('b', { class: 'num' }, '-') };
    refreshSummary = async () => {
      try {
        const s = await api('GET', '/admin/summary');
        els.t.textContent = s.transactionsToday; els.f.textContent = s.flaggedForReview; els.a.textContent = s.frozenAccounts;
      } catch (_) { /* shown as - */ }
    };
    refreshSummary();
    const card = (label, el) => h('div', { class: 'box' }, h('small', null, label), el);
    return h('div', { class: 'cards' }, card('Transactions today', els.t), card('Flagged for review', els.f), card('Frozen accounts', els.a));
  }

  function recentAudit() {
    const body = h('div');
    refreshRecent = async () => {
      try {
        const r = await api('GET', '/audit-logs', { query: { limit: 5 } });
        clear(body).append(auditTable(r.data));
      } catch (ex) { clear(body).append(h('div', { class: 'err' }, ex.detail)); }
    };
    refreshRecent();
    return h('div', { class: 'box' }, h('h3', null, 'Recent audit log', h('a', { href: '#audit', class: 'btn sm alt' }, 'View all')), body);
  }

  const actor = (r) => (r.actorType === 'System' ? 'System' : `${r.actorType} ${r.actorId ?? '?'}`);
  function auditTable(rows) {
    if (!rows.length) return h('p', { class: 'empty' }, 'No entries yet.');
    return h('table', null,
      h('tr', null, ['Time', 'Actor', 'Action', 'Entity', 'IP address'].map((t) => h('th', null, t))),
      rows.map((r) => h('tr', null,
        h('td', { class: 'nowrap' }, when(r.createdAt)), h('td', null, actor(r)), h('td', { class: 'mono' }, r.action),
        h('td', null, r.entityType ? `${r.entityType} ${r.entityId}` : '-'), h('td', null, r.ipAddress || '-'))));
  }

  const changed = (reload) => { reload(); refreshSummary(); refreshRecent(); };

  function reviewDialog(row, status, reload) {
    formDialog({
      title: status === 'Flagged' ? 'Flag transaction' : 'Clear transaction',
      intro: `${row.referenceNumber} - PHP ${money(row.amount)}`,
      fields: [{ name: 'reviewNote', label: 'Review note (optional)', type: 'textarea', maxlength: 255, value: row.reviewNote || '' }],
      submit: status === 'Flagged' ? 'Flag' : 'Clear',
      onSubmit: async (v) => {
        await api('PATCH', `/transactions/${row.transactionId}`, { body: { reviewStatus: status, reviewNote: v.reviewNote || undefined } });
        toast(`Transaction ${status === 'Flagged' ? 'flagged' : 'cleared'}.`); changed(reload);
      },
    });
  }

  function freezeDialog(accountId, reload) {
    formDialog({
      title: `Freeze account ${accountId}`,
      intro: 'The customer will not be able to move money from this account until it is reactivated.',
      fields: [{ name: 'reason', label: 'Reason', maxlength: 255, required: true, value: 'Suspicious activity' }],
      submit: 'Freeze account',
      onSubmit: async (v) => {
        await api('PATCH', `/accounts/${accountId}`, { body: { status: 'Frozen', reason: v.reason } });
        toast(`Account ${accountId} frozen.`); changed(reload);
      },
    });
  }

  VIEWS.transactions = (main) => listView(main, {
    key: 'transactions', title: 'Transaction monitoring', sub: 'Review transactions and flag anything suspicious.',
    path: '/transactions', sort: '-transactionDate', top: summaryCards, bottom: recentAudit,
    filters: [
      { name: 'status', label: 'Status', type: 'select', options: opts('Pending', 'Completed', 'Failed') },
      { name: 'transactionType', label: 'Type', type: 'select', options: opts(['Transfer', 'Transfer'], ['BillPayment', 'Bill payment']) },
      { name: 'reviewStatus', label: 'Review', type: 'select', options: opts('None', 'Flagged', 'Cleared') },
      { name: 'dateFrom', label: 'From', type: 'date' },
      { name: 'dateTo', label: 'To', type: 'date' },
    ],
    columns: [
      { label: 'Ref', cell: (r) => h('span', { class: 'mono' }, r.referenceNumber) },
      { label: 'Account', cell: (r) => (r.destinationAccountId ? `${r.accountId} to ${r.destinationAccountId}` : String(r.accountId)) },
      { label: 'Type', cell: (r) => typeLabel(r.transactionType) },
      { label: 'Date', cell: (r) => h('span', { class: 'nowrap' }, when(r.transactionDate)) },
      { label: 'Amount', cls: 'r', cell: (r) => money(r.amount) },
      { label: 'Status', cell: (r) => tag(r.status) },
      { label: 'Review', cell: (r) => h('span', { title: r.reviewNote || '' }, tag(r.reviewStatus)) },
      { label: '', cls: 'r', cell: (r, reload) => h('span', { class: 'nowrap' },
        r.reviewStatus === 'Flagged'
          ? [h('button', { class: 'btn sm alt', onclick: () => reviewDialog(r, 'Cleared', reload) }, 'Clear'),
             h('button', { class: 'btn sm', onclick: () => freezeDialog(r.accountId, reload) }, 'Freeze account')]
          : h('button', { class: 'btn sm alt', onclick: () => reviewDialog(r, 'Flagged', reload) }, 'Flag')) },
    ],
  });

  /* ---------- Accounts (#8, #10, #25) ---------- */
  function accountHistory(a) {
    const body = h('p', { class: 'empty' }, 'Loading...');
    infoDialog(`Transactions of ${a.accountNumber}`, 'Includes transfers this account received (latest 10).', body);
    api('GET', `/accounts/${a.accountId}/transactions`, { query: { limit: 10 } }).then((r) => {
      body.replaceWith(r.data.length ? h('table', null,
        h('tr', null, ['Ref', 'Type', 'Amount', 'Status'].map((t) => h('th', null, t))),
        r.data.map((t) => h('tr', null, h('td', { class: 'mono' }, t.referenceNumber), h('td', null, typeLabel(t.transactionType)),
          h('td', { class: 'r' }, money(t.amount)), h('td', null, tag(t.status))))) : h('p', { class: 'empty' }, 'No transactions.'));
    }).catch((ex) => body.replaceWith(h('div', { class: 'err' }, ex.detail)));
  }

  VIEWS.accounts = (main) => listView(main, {
    key: 'accounts', title: 'Accounts', sub: 'Monitor accounts and freeze or reactivate them.',
    path: '/accounts', sort: 'accountId',
    filters: [
      { name: 'status', label: 'Status', type: 'select', options: opts('Active', 'Inactive', 'Frozen') },
      { name: 'accountType', label: 'Type', type: 'select', options: opts('Savings', 'Checking') },
      { name: 'userId', label: 'User ID', type: 'text' },
    ],
    columns: [
      { label: 'ID', cell: (r) => r.accountId },
      { label: 'Account number', cell: (r) => h('span', { class: 'mono' }, r.accountNumber) },
      { label: 'User', cell: (r) => r.userId },
      { label: 'Type', cell: (r) => r.accountType },
      { label: 'Opened', cell: (r) => h('span', { class: 'nowrap' }, when(r.dateOpened)) },
      { label: 'Balance', cls: 'r', cell: (r) => money(r.balance) },
      { label: 'Status', cell: (r) => tag(r.status) },
      { label: '', cls: 'r', cell: (r, reload) => h('span', { class: 'nowrap' },
        h('button', { class: 'btn sm alt', onclick: () => accountHistory(r) }, 'History'),
        r.status === 'Frozen'
          ? h('button', { class: 'btn sm', onclick: () => formDialog({
              title: `Reactivate account ${r.accountId}`, intro: 'The account returns to Active.', submit: 'Reactivate',
              fields: [{ name: 'reason', label: 'Reason (optional)', maxlength: 255 }],
              onSubmit: async (v) => { await api('PATCH', `/accounts/${r.accountId}`, { body: { status: 'Active', reason: v.reason || undefined } }); toast('Account reactivated.'); reload(); },
            }) }, 'Reactivate')
          : h('button', { class: 'btn sm', onclick: () => freezeDialog(r.accountId, reload) }, 'Freeze')) },
    ],
  });

  /* ---------- Users (#4, #11) ---------- */
  function userAccounts(u) {
    const body = h('p', { class: 'empty' }, 'Loading...');
    infoDialog(`${u.firstName} ${u.lastName}`, `Accounts of user ${u.userId}`, body);
    api('GET', `/users/${u.userId}/accounts`).then((r) => {
      body.replaceWith(r.data.length ? h('table', null,
        h('tr', null, ['Number', 'Type', 'Balance', 'Status'].map((t) => h('th', null, t))),
        r.data.map((a) => h('tr', null, h('td', { class: 'mono' }, a.accountNumber), h('td', null, a.accountType),
          h('td', { class: 'r' }, money(a.balance)), h('td', null, tag(a.status))))) : h('p', { class: 'empty' }, 'No accounts yet.'));
    }).catch((ex) => body.replaceWith(h('div', { class: 'err' }, ex.detail)));
  }

  VIEWS.users = (main) => listView(main, {
    key: 'users', title: 'Users', sub: 'All registered account holders.',
    path: '/users', sort: '-dateRegistered',
    filters: [{ name: 'lastName', label: 'Last name', type: 'text' }],
    columns: [
      { label: 'ID', cell: (r) => r.userId },
      { label: 'Name', cell: (r) => `${r.firstName} ${r.lastName}` },
      { label: 'Email', cell: (r) => r.email },
      { label: 'Mobile', cell: (r) => r.phoneNumber },
      { label: 'Registered', cell: (r) => h('span', { class: 'nowrap' }, when(r.dateRegistered)) },
      { label: '', cls: 'r', cell: (r) => h('button', { class: 'btn sm alt', onclick: () => userAccounts(r) }, 'Accounts') },
    ],
  });

  /* ---------- Billers (#12, #14, #15) ---------- */
  function billerDialog(biller, reload) {
    const edit = !!biller;
    formDialog({
      title: edit ? `Edit biller ${biller.billerId}` : 'Add a biller',
      fields: [
        { name: 'billerName', label: 'Biller name', maxlength: 100, required: true, value: biller && biller.billerName },
        { name: 'category', label: 'Category', maxlength: 50, required: true, value: biller && biller.category, hint: 'e.g. Electricity, Water, Internet, Credit Card' },
        { name: 'status', label: 'Status', type: 'select', options: opts('Active', 'Inactive'), value: biller ? biller.status : 'Active' },
      ],
      submit: edit ? 'Save changes' : 'Add biller',
      onSubmit: async (v) => {
        if (edit) await api('PUT', `/billers/${biller.billerId}`, { body: v });
        else await api('POST', '/billers', { body: v });
        toast(edit ? 'Biller updated.' : 'Biller added.'); reload();
      },
    });
  }

  VIEWS.billers = (main) => listView(main, {
    key: 'billers', title: 'Billers', sub: 'Companies customers can pay through Bankko.',
    path: '/billers',
    filters: [
      { name: 'category', label: 'Category', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: opts('Active', 'Inactive') },
    ],
    toolbar: (reload) => h('button', { type: 'button', class: 'btn sm', onclick: () => billerDialog(null, reload) }, 'Add biller'),
    columns: [
      { label: 'ID', cell: (r) => r.billerId },
      { label: 'Name', cell: (r) => r.billerName },
      { label: 'Category', cell: (r) => r.category },
      { label: 'Status', cell: (r) => tag(r.status) },
      { label: '', cls: 'r', cell: (r, reload) => h('button', { class: 'btn sm alt', onclick: () => billerDialog(r, reload) }, 'Edit') },
    ],
  });

  /* ---------- Audit log (#32) ---------- */
  VIEWS.audit = (main) => listView(main, {
    key: 'audit', title: 'Audit log', sub: 'Read-only record of logins, failures and admin actions.',
    path: '/audit-logs', limit: 20,
    filters: [
      { name: 'actorType', label: 'Actor', type: 'select', options: opts('User', 'Admin', 'System') },
      { name: 'action', label: 'Action (e.g. ACCOUNT_FROZEN)', type: 'text' },
      { name: 'dateFrom', label: 'From', type: 'date' },
      { name: 'dateTo', label: 'To', type: 'date' },
    ],
    columns: [
      { label: 'Time', cell: (r) => h('span', { class: 'nowrap' }, when(r.createdAt)) },
      { label: 'Actor', cell: actor },
      { label: 'Action', cell: (r) => h('span', { class: 'mono' }, r.action) },
      { label: 'Entity', cell: (r) => (r.entityType ? `${r.entityType} ${r.entityId}` : '-') },
      { label: 'IP address', cell: (r) => r.ipAddress || '-' },
    ],
  });

  /* ---------- boot ---------- */
  window.addEventListener('hashchange', route);
  if (state.token) start(); else renderLogin();
})();
