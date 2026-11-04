'use strict';
(function () {
  // ---------- helpers ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var fmt = function (n) { n = Math.round(Number(n) || 0); return (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN'); };
  var IST = 330 * 60000;
  var istDate = function (ms) { return new Date((ms == null ? Date.now() : ms) + IST).toISOString().slice(0, 10); };
  var addDays = function (d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); };
  var fday = function (d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var ftime = function (ms) { return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }); };
  var unit = function (u, q) { return u === 'kg' ? 'kg' : (q === 1 ? 'pc' : 'pcs'); };
  var ICON = {
    dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z"/>',
    orders: '<path d="M6 3h12l2 4v14H4V7zM4 7h16M9 11h6"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    exp: '<path d="M12 3v18M7 8c0-2 2-3 5-3s5 1 5 3-2 3-5 4-5 2-5 4 2 3 5 3 5-1 5-3"/>',
    cust: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6"/>',
    rep: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  };
  var svg = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; };

  var meta = null;           // config + status labels, loaded after login
  var pulse = { maxId: 0, awaiting: 0 };
  var current = { name: '', refresh: null };

  function toast(msg, bad) {
    var el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg;
    $('#toasts').appendChild(el); setTimeout(function () { el.remove(); }, bad ? 6000 : 3500);
  }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ww' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401 && path !== '/api/admin/login') { showLogin(); throw new Error('Please sign in.'); }
        return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed.'); return j; });
      });
  }
  var label = function (s) { return (meta.statusLabels || {})[s] || s; };
  var pillS = function (s) { return '<span class="pill s-' + s + '">' + esc(label(s)) + '</span>'; };
  var pillP = function (p) { return '<span class="pill p-' + p + '">' + ({ paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', void: 'Void' })[p] + '</span>'; };
  var itemsText = function (items) { return items.map(function (i) { return i.name + ' ' + i.qty + unit(i.unit, i.qty); }).join(', '); };

  // ---------- login ----------
  function showLogin(msg) {
    meta = null;
    $('#root').innerHTML = '<div class="login"><form id="login-form"><a class="logo" href="/">' + logoSvg() + '<span>Wash Wala<small>Admin</small></span></a><h1>Sign in</h1><p class="muted">Orders, sales and cash for the shop.</p>' +
      '<label class="f">Password<input type="password" id="pw" autocomplete="current-password" required autofocus></label><p class="err" id="login-err">' + esc(msg || '') + '</p><button class="btn dark" type="submit">Sign in</button></form></div>';
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/api/admin/login', { password: $('#pw').value }).then(boot).catch(function (er) { $('#login-err').textContent = er.message; $('#pw').select(); });
    });
  }
  function logoSvg() { return '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3C13 12 8 18 8 25a12 12 0 0 0 24 0C32 18 27 12 20 3Z" fill="currentColor"/><path d="M11 26c3-3 6-3 9 0s6 3 9 0" fill="none" stroke="#06191C" stroke-width="2.4" stroke-linecap="round"/></svg>'; }

  // ---------- shell ----------
  var NAV = [['dashboard', 'Dashboard', 'dash'], ['orders', 'Orders', 'orders'], ['cash', 'Cash book', 'cash'], ['expenses', 'Expenses', 'exp'], ['customers', 'Customers', 'cust'], ['reports', 'Reports', 'rep'], ['settings', 'Settings', 'set']];
  function shell() {
    $('#root').innerHTML = '<div class="shell"><aside class="rail"><a class="logo" href="#/dashboard">' + logoSvg() + '<span>Wash Wala<small>Admin</small></span></a>' +
      NAV.map(function (n) { return '<a class="nav" data-nav="' + n[0] + '" href="#/' + n[0] + '">' + svg(n[2]) + '<span class="l">' + n[1] + '</span>' + (n[0] === 'orders' ? '<b class="badge hidden" id="badge"></b>' : '') + '</a>'; }).join('') +
      '<div class="spacer"></div><a class="nav" href="/" target="_blank" rel="noopener"><span class="l">View website</span></a><button class="out" id="logout" type="button">Sign out</button><div class="who">Signed in as owner</div></aside><main id="view" tabindex="-1"></main></div>';
    $('#logout').addEventListener('click', function () { api('POST', '/api/admin/logout').finally(function () { showLogin(); }); });
  }
  function setBadge(n) {
    var b = $('#badge'); if (!b) return;
    b.textContent = n; b.classList.toggle('hidden', !n);
    document.title = (n ? '(' + n + ') ' : '') + 'Wash Wala Admin';
  }
  function poll() {
    if (!meta) return;
    api('GET', '/api/admin/pulse?since=' + pulse.maxId).then(function (p) {
      if (pulse.maxId && p.newSince > 0) { toast(p.newSince === 1 ? 'New order from the website' : p.newSince + ' new orders from the website'); if (current.name === 'dashboard' || current.name === 'orders') current.refresh && current.refresh(); }
      pulse.maxId = p.maxId; pulse.awaiting = p.awaiting; setBadge(p.awaiting);
    }).catch(function () { /* offline or signed out */ });
  }
  setInterval(poll, 20000);

  // ---------- router ----------
  var VIEWS = {};
  function route() {
    if (!meta) return;
    var h = (location.hash || '#/dashboard').slice(2), parts = h.split('?'), name = parts[0] || 'dashboard';
    var q = new URLSearchParams(parts[1] || '');
    if (!VIEWS[name]) name = 'dashboard';
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.dataset.nav === name); });
    current = { name: name, refresh: null };
    var v = $('#view'); v.innerHTML = '<p class="muted">Loading…</p>';
    VIEWS[name](v, q);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  var go = function (p) { location.hash = '#/' + p; };

  // ---------- reusable bits ----------
  function rangeBar(state, onChange) {
    var presets = [['Today', 0], ['7 days', 6], ['30 days', 29], ['90 days', 89]];
    var el = document.createElement('div'); el.className = 'tools';
    el.innerHTML = '<div class="seg">' + presets.map(function (p) { return '<button type="button" data-d="' + p[1] + '">' + p[0] + '</button>'; }).join('') + '<button type="button" data-d="month">This month</button></div>' +
      '<input type="date" id="r-from" style="width:auto" aria-label="From date"><span class="muted">to</span><input type="date" id="r-to" style="width:auto" aria-label="To date">';
    function sync() {
      $('#r-from', el).value = state.from; $('#r-to', el).value = state.to;
      $$('.seg button', el).forEach(function (b) {
        var on = b.dataset.d === 'month' ? (state.from === istDate().slice(0, 8) + '01' && state.to === istDate()) : (state.to === istDate() && state.from === addDays(istDate(), -Number(b.dataset.d)));
        b.classList.toggle('on', on);
      });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      state.to = istDate(); state.from = b.dataset.d === 'month' ? istDate().slice(0, 8) + '01' : addDays(state.to, -Number(b.dataset.d));
      sync(); onChange();
    });
    el.addEventListener('change', function (e) {
      if (e.target.id === 'r-from' || e.target.id === 'r-to') { var f = $('#r-from', el).value, t = $('#r-to', el).value; if (f && t) { state.from = f <= t ? f : t; state.to = f <= t ? t : f; sync(); onChange(); } }
    });
    sync(); return el;
  }

  function niceMax(v) { if (v <= 0) return 100; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function revenueChart(series) {
    var W = 760, H = 270, L = 52, R = 10, T = 14, B = 34, iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, series.map(function (d) { return Math.max(d.sales, d.collected, d.expenses); }).concat([1])));
    var y = function (v) { return T + ih - (v / max) * ih; };
    var step = iw / series.length, bw = Math.max(2, Math.min(18, step * 0.34));
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily sales, collections and expenses">';
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (L - 8) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + (gv >= 1000 ? (gv / 1000) + 'k' : gv) + '</text>'; }
    var every = Math.ceil(series.length / 8), pts = [];
    series.forEach(function (d, i) {
      var cx = L + step * i + step / 2;
      out += '<g><title>' + fday(d.date) + ': sales ' + fmt(d.sales) + ', collected ' + fmt(d.collected) + ', expenses ' + fmt(d.expenses) + '</title>' +
        '<rect x="' + (cx - bw - 1) + '" y="' + y(d.sales) + '" width="' + bw + '" height="' + Math.max(0, T + ih - y(d.sales)) + '" rx="2" fill="var(--c-sales)"/>' +
        '<rect x="' + (cx + 1) + '" y="' + y(d.collected) + '" width="' + bw + '" height="' + Math.max(0, T + ih - y(d.collected)) + '" rx="2" fill="var(--c-coll)"/></g>';
      pts.push([cx, y(d.expenses)]);
      if (i % every === 0) out += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + fday(d.date) + '</text>';
    });
    out += '<polyline fill="none" stroke="var(--c-exp)" stroke-width="2.2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
    if (series.length <= 45) pts.forEach(function (p) { out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="var(--c-exp)"/>'; });
    return out + '</svg>';
  }
  function barList(rows, key, valFn, color) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[key]; }).concat([1]));
    if (!rows.length) return '<p class="muted">Nothing yet in this range.</p>';
    return '<div class="bars">' + rows.map(function (r) { return '<div class="bar-row"><span>' + esc(r.name) + '</span><div class="track"><div class="fill" style="width:' + (r[key] / max * 100).toFixed(1) + '%;' + (color ? 'background:' + color : '') + '"></div></div><b>' + valFn(r) + '</b></div>'; }).join('') + '</div>';
  }

  // ---------- items editor (used in new order + edit order) ----------
  function itemsEditor(host, initial, onChange) {
    var lines = (initial && initial.length ? initial : [{ service: meta.config.services[0].id, qty: meta.config.services[0].unit === 'kg' ? 3 : 1 }]).map(function (l) { return { service: l.service, qty: l.qty }; });
    var svc = function (id) { return meta.config.services.find(function (s) { return s.id === id; }); };
    function draw() {
      var used = lines.map(function (l) { return l.service; });
      host.innerHTML = '<div class="lines-ed">' + lines.map(function (l, i) {
        var s = svc(l.service);
        return '<div class="line-ed"><select data-i="' + i + '" data-k="service">' + meta.config.services.map(function (o) { return '<option value="' + o.id + '"' + (o.id === l.service ? ' selected' : '') + (o.id !== l.service && used.indexOf(o.id) > -1 ? ' disabled' : '') + '>' + esc(o.name) + ' · ' + fmt(o.rate) + '/' + o.unit + '</option>'; }).join('') + '</select>' +
          '<input type="number" data-i="' + i + '" data-k="qty" min="' + (s.unit === 'kg' ? .5 : 1) + '" max="60" step="' + (s.unit === 'kg' ? .5 : 1) + '" value="' + l.qty + '" aria-label="Quantity in ' + s.unit + '">' +
          (lines.length > 1 ? '<button type="button" class="x" data-rm="' + i + '" aria-label="Remove">×</button>' : '<span></span>') + '</div>';
      }).join('') + '</div>' + (lines.length < meta.config.services.length ? '<button type="button" class="btn sm" data-add style="margin-top:8px">+ Add service</button>' : '');
      onChange && onChange(lines);
    }
    host.addEventListener('change', function (e) {
      var t = e.target, i = t.dataset.i; if (i == null) return;
      if (t.dataset.k === 'service') { lines[i].service = t.value; var s = svc(t.value); lines[i].qty = s.unit === 'kg' ? Math.max(.5, Math.round(lines[i].qty * 2) / 2) : Math.max(1, Math.round(lines[i].qty)); draw(); }
      else { var v = Number(t.value) || 0; lines[i].qty = v; onChange && onChange(lines); }
    });
    host.addEventListener('input', function (e) { var t = e.target; if (t.dataset.k === 'qty') { lines[t.dataset.i].qty = Number(t.value) || 0; onChange && onChange(lines); } });
    host.addEventListener('click', function (e) {
      if (e.target.dataset.add !== undefined) { var used = lines.map(function (l) { return l.service; }); var n = meta.config.services.find(function (s) { return used.indexOf(s.id) < 0; }); if (n) { lines.push({ service: n.id, qty: n.unit === 'kg' ? 2 : 1 }); draw(); } }
      if (e.target.dataset.rm !== undefined) { lines.splice(Number(e.target.dataset.rm), 1); draw(); }
    });
    draw();
    return function () { return lines.map(function (l) { return { service: l.service, qty: l.qty }; }); };
  }
  function localQuote(lines, express, discount) {
    var c = meta.config, sub = 0;
    lines.forEach(function (l) { var s = c.services.find(function (x) { return x.id === l.service; }); if (s) sub += Math.round(l.qty * s.rate); });
    var topUp = sub < c.minOrder ? c.minOrder - sub : 0; sub += topUp;
    var exp = express ? Math.round(sub * c.expressPct / 100) : 0, pick = sub + exp >= c.freePickupAbove ? 0 : c.pickupFee;
    var disc = Math.max(0, Math.min(Number(discount) || 0, sub + exp + pick));
    return { sub: sub, topUp: topUp, exp: exp, pick: pick, disc: disc, total: sub + exp + pick - disc };
  }
  function totalsHtml(q) {
    return '<div class="totals"><div><span>Services' + (q.topUp ? ' (incl. minimum top-up ' + fmt(q.topUp) + ')' : '') + '</span><span>' + fmt(q.sub) + '</span></div>' +
      (q.exp ? '<div><span>Express</span><span>' + fmt(q.exp) + '</span></div>' : '') + '<div><span>Pickup and delivery</span><span>' + (q.pick ? fmt(q.pick) : 'Free') + '</span></div>' +
      (q.disc ? '<div><span>Discount</span><span>−' + fmt(q.disc) + '</span></div>' : '') + '<div class="big"><span>Total</span><span>' + fmt(q.total) + '</span></div></div>';
  }

  // ---------- modal / drawer ----------
  function openLayer(html, kind) {
    var s = document.createElement('div'); s.className = 'scrim' + (kind === 'modal' ? ' center' : '');
    s.innerHTML = '<div class="' + (kind === 'modal' ? 'modal' : 'drawer') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(s); document.body.style.overflow = 'hidden';
    var close = function () { s.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', esck); };
    var esck = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esck);
    s.addEventListener('mousedown', function (e) { if (e.target === s) close(); });
    s.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var f = $('input,select,textarea', s); if (f && kind === 'modal') f.focus();
    return { el: s, close: close, body: s.firstChild };
  }

  // ---------- DASHBOARD ----------
  var dashRange = { from: addDays(istDate(), -29), to: istDate() };
  VIEWS.dashboard = function (v) {
    var hour = Number(new Date(Date.now() + IST).toISOString().slice(11, 13));
    v.innerHTML = '<div class="page-head"><div><h1>' + (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') + '</h1><p>' + new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }) + '</p></div><div class="tools"><button class="btn primary" id="new-order">+ New order</button></div></div>' +
      '<div class="stack" id="dash"><p class="muted">Loading…</p></div>';
    $('#new-order').addEventListener('click', function () { newOrderModal(); });
    var load = function () {
      api('GET', '/api/admin/summary?from=' + dashRange.from + '&to=' + dashRange.to).then(function (s) {
        var k = s.kpi, t = s.today, sc = s.statusCounts;
        var m = k.byMethod, mt = Math.max(1, m.cash + m.upi + m.card);
        var awaiting = sc.new;
        $('#dash').innerHTML =
          (awaiting ? '<div class="callout">' + awaiting + ' new order' + (awaiting > 1 ? 's' : '') + ' waiting for confirmation. <a href="#/orders?status=new">Review now</a></div>' : '') +
          '<div class="cards"><div class="stat hero"><span class="k">Cash in drawer</span><span class="v">' + fmt(k.cashInHand) + '</span><span class="s">Per the books. <a href="#/cash" style="color:var(--gold)">Open cash book</a></span></div>' +
          '<div class="stat"><span class="k">Today, orders</span><span class="v">' + t.orders + '</span><span class="s">' + fmt(t.sales) + ' booked</span></div>' +
          '<div class="stat"><span class="k">Today, collected</span><span class="v">' + fmt(t.collected) + '</span><span class="s">' + fmt(t.cash) + ' of it in cash</span></div>' +
          '<div class="stat"><span class="k">Pickups due today</span><span class="v">' + t.pickupsDue + '</span><span class="s"><a href="#/orders?status=active">See active orders</a></span></div></div>' +
          '<div class="h-between" style="margin:6px 0 -6px"><h2>Performance</h2><div id="range-host"></div></div>' +
          '<div class="cards five"><div class="stat"><span class="k">Sales booked</span><span class="v">' + fmt(k.sales) + '</span><span class="s">' + k.orders + ' orders, avg ' + fmt(k.avgOrder) + '</span></div>' +
          '<div class="stat"><span class="k">Money collected</span><span class="v">' + fmt(k.collected) + '</span><span class="s">cash ' + fmt(m.cash) + ' · UPI ' + fmt(m.upi) + (m.card ? ' · card ' + fmt(m.card) : '') + '</span></div>' +
          '<div class="stat"><span class="k">Still to collect</span><span class="v ' + (k.outstanding ? 'neg' : '') + '">' + fmt(k.outstanding) + '</span><span class="s">' + k.outstandingOrders + ' orders with a balance</span></div>' +
          '<div class="stat"><span class="k">Expenses</span><span class="v">' + fmt(k.expenses) + '</span><span class="s">in this range</span></div>' +
          '<div class="stat"><span class="k">Net (collected − expenses)</span><span class="v ' + (k.net >= 0 ? 'pos' : 'neg') + '">' + fmt(k.net) + '</span><span class="s">cash basis</span></div></div>' +
          '<div class="cols"><div class="card"><h3>Sales, collections and expenses</h3><div class="legend"><span><i style="background:var(--c-sales)"></i>Sales booked</span><span><i style="background:var(--c-coll)"></i>Collected</span><span><i style="background:var(--c-exp)"></i>Expenses</span></div>' + revenueChart(s.series) + '</div>' +
          '<div class="card"><h3>How customers pay</h3><div class="stackbar" role="img" aria-label="Payment methods"><i style="width:' + m.cash / mt * 100 + '%;background:var(--c-exp)"></i><i style="width:' + m.upi / mt * 100 + '%;background:var(--c-coll)"></i><i style="width:' + m.card / mt * 100 + '%;background:var(--info)"></i></div>' +
          '<div class="bars" style="margin-top:16px">' + [['Cash', m.cash, 'var(--c-exp)'], ['UPI', m.upi, 'var(--c-coll)'], ['Card', m.card, 'var(--info)']].map(function (r) { return '<div class="bar-row" style="grid-template-columns:60px 1fr auto"><span>' + r[0] + '</span><span class="muted">' + Math.round(r[1] / mt * 100) + '%</span><b>' + fmt(r[1]) + '</b></div>'; }).join('') + '</div></div></div>' +
          '<div class="card"><h3>Order pipeline</h3><div class="pipeline">' + ['new', 'confirmed', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'].map(function (st) { return '<a href="#/orders?status=' + st + '"><b>' + sc[st] + '</b><span>' + esc(label(st)) + '</span></a>'; }).join('') + '</div></div>' +
          '<div class="cols3"><div class="card"><h3>Top services</h3>' + barList(s.topServices.slice(0, 6), 'amount', function (r) { return fmt(r.amount); }) + '</div>' +
          '<div class="card"><h3>Busiest areas</h3>' + barList(s.topAreas, 'n', function (r) { return r.n + ' orders'; }) + '</div>' +
          '<div class="card"><h3>Where the money goes</h3>' + barList(s.byCategory.slice(0, 6), 'amount', function (r) { return fmt(r.amount); }, 'var(--c-exp)') + '</div></div>' +
          (s.lastClose ? '<p class="muted">Last day close: ' + fday(s.lastClose.date) + ', counted ' + fmt(s.lastClose.counted) + ' against ' + fmt(s.lastClose.expected) + ' expected (' + (s.lastClose.difference === 0 ? 'matched' : (s.lastClose.difference > 0 ? '+' : '') + fmt(s.lastClose.difference)) + ').</p>' : '<p class="muted">No day close yet. Count the drawer at night in <a href="#/cash">Cash book</a> so the books and the cash stay matched.</p>');
        $('#range-host').appendChild(rangeBar(dashRange, load));
      }).catch(function (e) { $('#dash').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    };
    current.refresh = load; load();
  };

  // ---------- ORDERS ----------
  var ordFilter = { status: '', pay: '', q: '', from: '', to: '', offset: 0 };
  VIEWS.orders = function (v, q) {
    if (q.has('status')) { ordFilter.status = q.get('status'); ordFilter.offset = 0; }
    if (q.has('pay')) { ordFilter.pay = q.get('pay'); ordFilter.offset = 0; }
    v.innerHTML = '<div class="page-head"><div><h1>Orders</h1><p>Every booking from the website, WhatsApp and the counter.</p></div><div class="tools"><button class="btn primary" id="new-order">+ New order</button></div></div>' +
      '<div class="tools" style="margin-bottom:16px"><input id="f-q" placeholder="Search name, phone or code" style="max-width:260px" value="' + esc(ordFilter.q) + '">' +
      '<select id="f-status" style="width:auto"><option value="">All statuses</option><option value="active">Active (not delivered)</option>' + meta.statuses.map(function (s) { return '<option value="' + s + '">' + esc(label(s)) + '</option>'; }).join('') + '</select>' +
      '<select id="f-pay" style="width:auto"><option value="">Any payment</option><option value="due">Has a balance</option><option value="unpaid">Unpaid</option><option value="partial">Part paid</option><option value="paid">Paid</option></select>' +
      '<input type="date" id="f-from" style="width:auto" aria-label="From date" value="' + ordFilter.from + '"><input type="date" id="f-to" style="width:auto" aria-label="To date" value="' + ordFilter.to + '"></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th class="right">Total</th><th class="right">Balance</th><th>Status</th><th>Pickup</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody></table></div><div class="tools" style="margin-top:14px;justify-content:space-between"><span class="muted" id="count"></span><div class="tools"><button class="btn sm" id="prev">Previous</button><button class="btn sm" id="next">Next</button></div></div>';
    $('#f-status').value = ordFilter.status; $('#f-pay').value = ordFilter.pay;
    $('#new-order').addEventListener('click', function () { newOrderModal(); });
    var limit = 25, timer;
    var load = function () {
      var p = new URLSearchParams({ limit: limit, offset: ordFilter.offset });
      ['status', 'pay', 'q', 'from', 'to'].forEach(function (k) { if (ordFilter[k]) p.set(k, ordFilter[k]); });
      api('GET', '/api/admin/orders?' + p).then(function (r) {
        $('#rows').innerHTML = r.orders.length ? r.orders.map(function (o) {
          return '<tr class="click" data-id="' + o.id + '"><td><b>' + esc(o.code) + '</b><small>' + ftime(o.created_at) + (o.express ? ' · Express' : '') + '</small></td><td>' + esc(o.name) + '<small>' + esc(o.phone) + ' · ' + esc(o.area || 'no area') + '</small></td><td>' + esc(itemsText(o.items)) + '</td>' +
            '<td class="right"><b>' + fmt(o.total) + '</b></td><td class="right">' + (o.status === 'cancelled' ? '<span class="muted">-</span>' : o.balance ? '<b class="neg">' + fmt(o.balance) + '</b>' : '<span class="pos">Paid</span>') + '</td><td>' + pillS(o.status) + '</td><td>' + fday(o.pickup_date) + '<small>' + esc(o.slot) + '</small></td></tr>';
        }).join('') : '<tr><td colspan="7" class="empty">No orders match these filters.</td></tr>';
        $('#count').textContent = r.total ? 'Showing ' + (ordFilter.offset + 1) + ' to ' + Math.min(ordFilter.offset + limit, r.total) + ' of ' + r.total : '';
        $('#prev').disabled = ordFilter.offset === 0; $('#next').disabled = ordFilter.offset + limit >= r.total;
      }).catch(function (e) { $('#rows').innerHTML = '<tr><td colspan="7" class="err">' + esc(e.message) + '</td></tr>'; });
    };
    current.refresh = load; load();
    $('#rows').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) openOrder(Number(tr.dataset.id)); });
    var apply = function () { ordFilter.q = $('#f-q').value.trim(); ordFilter.status = $('#f-status').value; ordFilter.pay = $('#f-pay').value; ordFilter.from = $('#f-from').value; ordFilter.to = $('#f-to').value; ordFilter.offset = 0; load(); };
    $('#f-q').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(apply, 250); });
    ['f-status', 'f-pay', 'f-from', 'f-to'].forEach(function (id) { $('#' + id).addEventListener('change', apply); });
    $('#prev').addEventListener('click', function () { ordFilter.offset = Math.max(0, ordFilter.offset - limit); load(); });
    $('#next').addEventListener('click', function () { ordFilter.offset += limit; load(); });
  };

  var NEXT = { new: ['confirmed', 'Confirm pickup'], confirmed: ['picked_up', 'Mark picked up'], picked_up: ['processing', 'Start washing'], processing: ['ready', 'Mark ready'], ready: ['out_for_delivery', 'Out for delivery'], out_for_delivery: ['delivered', 'Mark delivered'] };
  function waMsg(o) {
    var first = o.name.split(' ')[0], t = {
      new: 'Hello ' + first + ', this is Wash Wala. We received your booking ' + o.code + '.',
      confirmed: 'Hello ' + first + ', your Wash Wala pickup ' + o.code + ' is confirmed for ' + fday(o.pickup_date) + ', ' + o.slot + '.',
      picked_up: 'Hello ' + first + ', we have picked up your clothes (' + o.code + '). We will message you when they are ready.',
      processing: 'Hello ' + first + ', your clothes (' + o.code + ') are being washed.',
      ready: 'Hello ' + first + ', your clothes (' + o.code + ') are ready. Total ' + fmt(o.total) + (o.balance ? ', ' + fmt(o.balance) + ' to pay on delivery.' : ', already paid.'),
      out_for_delivery: 'Hello ' + first + ', our rider is on the way with your clothes (' + o.code + ').' + (o.balance ? ' Please keep ' + fmt(o.balance) + ' ready (UPI or cash).' : ''),
      delivered: 'Thank you ' + first + '! Your order ' + o.code + ' is delivered.' + (o.balance ? ' Balance due ' + fmt(o.balance) + '.' : ' We hope to see you again.'),
      cancelled: 'Hello ' + first + ', your order ' + o.code + ' has been cancelled.',
    };
    return 'https://wa.me/91' + o.phone + '?text=' + encodeURIComponent(t[o.status]);
  }

  var drawer = null;
  function openOrder(id) {
    api('GET', '/api/admin/orders/' + id).then(function (o) {
      if (drawer) drawer.close();
      drawer = openLayer('<div id="od"></div>', 'drawer');
      renderOrder(o);
    }).catch(function (e) { toast(e.message, true); });
  }
  function renderOrder(o) {
    var host = $('#od', drawer.el), nx = NEXT[o.status], open = o.status !== 'cancelled' && o.balance > 0;
    host.innerHTML = '<div class="stack" style="gap:18px"><div class="d-head"><div><h2>' + esc(o.code) + '</h2><p class="muted">' + ftime(o.created_at) + ' · ' + esc(o.source.replace('_', ' ')) + '</p></div><button class="x" data-close aria-label="Close">×</button></div>' +
      '<div class="actions">' + pillS(o.status) + pillP(o.pay_status) + (o.express ? '<span class="chip">Express</span>' : '') + '</div>' +
      (nx ? '<div class="actions"><button class="btn primary" id="adv">' + nx[1] + '</button><a class="btn" target="_blank" rel="noopener" href="' + waMsg(o) + '">Message on WhatsApp</a></div>' : '<div class="actions"><a class="btn" target="_blank" rel="noopener" href="' + waMsg(o) + '">Message on WhatsApp</a></div>') +
      '<dl class="kv"><dt>Customer</dt><dd><b>' + esc(o.name) + '</b></dd><dt>Phone</dt><dd><a href="tel:+91' + esc(o.phone) + '">' + esc(o.phone) + '</a></dd><dt>Address</dt><dd>' + esc(o.address) + (o.area ? ' <span class="chip">' + esc(o.area) + '</span>' : '') + '</dd><dt>Pickup</dt><dd>' + fday(o.pickup_date) + (o.slot ? ', ' + esc(o.slot) : '') + '</dd>' + (o.notes ? '<dt>Notes</dt><dd>' + esc(o.notes) + '</dd>' : '') + '</dl>' +
      '<div><h3>Items</h3><ul class="tl" style="margin-top:8px">' + o.items.map(function (i) { return '<li><span>' + esc(i.name) + ' · ' + i.qty + ' ' + unit(i.unit, i.qty) + ' × ' + fmt(i.rate) + '</span><small>' + fmt(i.amount) + '</small></li>'; }).join('') + '</ul>' +
      totalsHtml({ sub: o.subtotal, topUp: 0, exp: o.express_fee, pick: o.pickup_fee, disc: o.discount, total: o.total }) + '</div>' +
      '<div><h3>Payments</h3>' + (o.payments.length ? '<ul class="tl" style="margin-top:8px">' + o.payments.map(function (p) { return '<li><span><b>' + fmt(p.amount) + '</b> ' + esc(p.method.toUpperCase()) + (p.note ? ' · ' + esc(p.note) : '') + '</span><small>' + ftime(p.received_at) + ' <button class="btn sm danger" data-delpay="' + p.id + '" style="margin-left:6px">Remove</button></small></li>'; }).join('') + '</ul>' : '<p class="muted" style="margin-top:6px">Nothing received yet.</p>') +
      (o.status === 'cancelled' ? '' : '<div class="callout ' + (open ? '' : 'good') + '" style="margin-top:12px">' + (open ? fmt(o.balance) + ' still to collect' : 'Paid in full') + '</div>') + '</div>' +
      (open ? '<form id="pay-form" class="card" style="padding:16px"><h3 style="font-size:1.1rem">Record a payment</h3><div class="grid3"><label class="f">Amount<input name="amount" type="number" min="1" max="' + o.balance + '" value="' + o.balance + '" required></label><label class="f">Method<select name="method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label><label class="f">Note<input name="note" maxlength="120" placeholder="optional"></label></div><p class="err" id="pay-err"></p><button class="btn dark" type="submit">Save payment</button></form>' : '') +
      '<div><h3>History</h3><ul class="tl" style="margin-top:8px">' + o.events.map(function (e) { return '<li><span>' + esc(label(e.status)) + (e.note ? ' · ' + esc(e.note) : '') + '</span><small>' + ftime(e.at) + '</small></li>'; }).join('') + '</ul></div>' +
      '<div class="actions">' + (['delivered', 'cancelled'].indexOf(o.status) < 0 ? '<button class="btn" id="edit">Edit order</button>' : '') +
      (o.status !== 'cancelled' && o.status !== 'delivered' ? '<button class="btn danger" id="cancel">Cancel order</button>' : '') +
      (o.status === 'cancelled' ? '<button class="btn" id="reopen">Re-open order</button>' : '') +
      (o.status === 'delivered' ? '<button class="btn" id="undo">Move back to ready</button>' : '') + '</div></div>';
    var after = function (res) { renderOrder(res); current.refresh && current.refresh(); poll(); };
    var fail = function (e) { toast(e.message, true); };
    var adv = $('#adv', host); if (adv) adv.addEventListener('click', function () { adv.disabled = true; api('PATCH', '/api/admin/orders/' + o.id, { status: nx[0] }).then(function (r) { toast(label(nx[0])); after(r); }).catch(function (e) { adv.disabled = false; fail(e); }); });
    var pf = $('#pay-form', host); if (pf) pf.addEventListener('submit', function (e) {
      e.preventDefault(); var f = new FormData(pf);
      api('POST', '/api/admin/orders/' + o.id + '/payments', { amount: Number(f.get('amount')), method: f.get('method'), note: f.get('note') }).then(function (r) { toast('Payment saved'); after(r); }).catch(function (er) { $('#pay-err', host).textContent = er.message; });
    });
    $$('[data-delpay]', host).forEach(function (b) { b.addEventListener('click', function () {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to remove'; setTimeout(function () { b.dataset.sure = ''; b.textContent = 'Remove'; }, 3000); return; }
      api('DELETE', '/api/admin/payments/' + b.dataset.delpay).then(function (r) { toast('Payment removed'); after(r); }).catch(fail);
    }); });
    var c = $('#cancel', host); if (c) c.addEventListener('click', function () {
      if (c.dataset.sure !== '1') { c.dataset.sure = '1'; c.textContent = 'Tap again to cancel this order'; setTimeout(function () { c.dataset.sure = ''; c.textContent = 'Cancel order'; }, 3500); return; }
      api('PATCH', '/api/admin/orders/' + o.id, { status: 'cancelled' }).then(after).catch(fail);
    });
    var ro = $('#reopen', host); if (ro) ro.addEventListener('click', function () { api('PATCH', '/api/admin/orders/' + o.id, { status: 'confirmed' }).then(after).catch(fail); });
    var un = $('#undo', host); if (un) un.addEventListener('click', function () { api('PATCH', '/api/admin/orders/' + o.id, { status: 'ready' }).then(after).catch(fail); });
    var ed = $('#edit', host); if (ed) ed.addEventListener('click', function () { editOrderModal(o, after); });
  }

  function orderFormHtml(o) {
    var c = meta.config; o = o || {};
    return '<div class="grid2"><label class="f">Customer name<input name="name" required maxlength="80" value="' + esc(o.name || '') + '"></label><label class="f">Mobile number<input name="phone" required inputmode="numeric" maxlength="14" value="' + esc(o.phone || '') + '"></label></div>' +
      '<div class="grid2"><label class="f">Area<select name="area"><option value="">-</option>' + c.areas.map(function (a) { return '<option' + (a === o.area ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">Pickup date<input type="date" name="pickup_date" value="' + (o.pickup_date || istDate()) + '"></label></div>' +
      '<label class="f">Address<textarea name="address" rows="2" required maxlength="300">' + esc(o.address || '') + '</textarea></label>' +
      '<div class="grid2"><label class="f">Pickup slot<select name="slot"><option value="">-</option>' + c.slots.map(function (s) { return '<option' + (s === o.slot ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">Notes<input name="notes" maxlength="400" value="' + esc(o.notes || '') + '"></label></div>' +
      '<div><p class="muted" style="font-weight:600;font-size:.82rem;margin-bottom:6px">Items</p><div id="items-host"></div></div>' +
      '<div class="grid2"><label class="f" style="flex-direction:row;align-items:center;gap:10px;font-size:.95rem;color:var(--ink)"><input type="checkbox" name="express" style="width:auto;min-height:0"' + (o.express ? ' checked' : '') + '> Express (+' + c.expressPct + '%)</label><label class="f">Discount (₹)<input type="number" name="discount" min="0" step="1" value="' + (o.discount || 0) + '"></label></div>' +
      '<div id="quote-host"></div>';
  }
  function wireQuote(form, getLines) {
    var upd = function () { var f = new FormData(form); $('#quote-host', form).innerHTML = totalsHtml(localQuote(getLines(), f.get('express') === 'on', f.get('discount'))); };
    form.addEventListener('input', upd); form.addEventListener('change', upd); return upd;
  }
  function newOrderModal() {
    var L = openLayer('<div class="d-head"><h2>New order</h2><button class="x" data-close type="button" aria-label="Close">×</button></div><form id="no-form" class="stack" style="gap:14px">' + orderFormHtml() +
      '<div class="grid3"><label class="f">Source<select name="source"><option value="walk_in">Walk-in</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone call</option></select></label><label class="f">Status<select name="status">' + meta.statuses.filter(function (s) { return s !== 'cancelled'; }).map(function (s) { return '<option value="' + s + '"' + (s === 'confirmed' ? ' selected' : '') + '>' + esc(label(s)) + '</option>'; }).join('') + '</select></label><span></span></div>' +
      '<div class="card" style="padding:14px"><p class="muted" style="font-weight:600;font-size:.82rem;margin-bottom:8px">Payment received now (optional)</p><div class="grid2"><label class="f">Amount<input type="number" name="pay_amount" min="0" step="1" value="0"></label><label class="f">Method<select name="pay_method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label></div></div>' +
      '<p class="err" id="no-err"></p><div class="actions"><button class="btn primary" type="submit">Create order</button><button class="btn" type="button" data-close>Cancel</button></div></form>', 'modal');
    var form = $('#no-form', L.el), getLines = itemsEditor($('#items-host', form), null, function () { if (upd) upd(); });
    var upd = wireQuote(form, function () { return getLines ? getLines() : []; });
    upd();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var f = new FormData(form), pay = Number(f.get('pay_amount')) || 0;
      var body = { name: f.get('name'), phone: f.get('phone'), address: f.get('address'), area: f.get('area'), slot: f.get('slot'), notes: f.get('notes'), pickup_date: f.get('pickup_date'), items: getLines(), express: f.get('express') === 'on', discount: Number(f.get('discount')) || 0, source: f.get('source'), status: f.get('status') };
      if (pay > 0) body.payment = { amount: pay, method: f.get('pay_method') };
      api('POST', '/api/admin/orders', body).then(function (o) { L.close(); toast('Order ' + o.code + ' created'); current.refresh && current.refresh(); poll(); openOrder(o.id); }).catch(function (er) { $('#no-err', form).textContent = er.message; });
    });
  }
  function editOrderModal(o, after) {
    var L = openLayer('<div class="d-head"><h2>Edit ' + esc(o.code) + '</h2><button class="x" data-close type="button" aria-label="Close">×</button></div><form id="eo-form" class="stack" style="gap:14px">' + orderFormHtml(o) + '<p class="err" id="eo-err"></p><div class="actions"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" data-close>Cancel</button></div></form>', 'modal');
    var form = $('#eo-form', L.el), getLines = itemsEditor($('#items-host', form), o.items, function () { if (upd) upd(); });
    var upd = wireQuote(form, function () { return getLines ? getLines() : o.items; }); upd();
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var f = new FormData(form);
      api('PATCH', '/api/admin/orders/' + o.id, { name: f.get('name'), phone: f.get('phone'), address: f.get('address'), area: f.get('area'), slot: f.get('slot'), notes: f.get('notes'), pickup_date: f.get('pickup_date'), items: getLines(), express: f.get('express') === 'on', discount: Number(f.get('discount')) || 0 })
        .then(function (r) { L.close(); toast('Order updated'); after(r); }).catch(function (er) { $('#eo-err', form).textContent = er.message; });
    });
  }

  // ---------- CASH BOOK ----------
  var cashRange = { from: addDays(istDate(), -13), to: istDate() };
  VIEWS.cash = function (v) {
    v.innerHTML = '<div class="page-head"><div><h1>Cash book</h1><p>Every rupee that enters or leaves the drawer, with a running balance.</p></div><div id="range-host"></div></div><div class="stack" id="cb"><p class="muted">Loading…</p></div>';
    $('#range-host').appendChild(rangeBar(cashRange, load));
    function load() {
      Promise.all([api('GET', '/api/admin/cashbook?from=' + cashRange.from + '&to=' + cashRange.to), api('GET', '/api/admin/day-closes')]).then(function (r) {
        var b = r[0], closes = r[1].closes;
        $('#cb').innerHTML =
          '<div class="cash-hero"><div class="stat hero" style="padding:26px"><span class="k">Cash that should be in the drawer now</span><span class="big-num">' + fmt(b.today) + '</span><span class="s">Opening ' + fmt(b.opening) + ' · in ' + fmt(b.totalIn) + ' · out ' + fmt(b.totalOut) + ' · closing ' + fmt(b.closing) + ' for the selected range</span></div>' +
          '<form class="card" id="close-form"><h3>Close the day</h3><p class="muted" style="margin-bottom:12px">Count the cash in the drawer and enter it. The difference is saved so shortages show up.</p><div class="grid2"><label class="f">Date<input type="date" name="date" value="' + istDate() + '" max="' + istDate() + '"></label><label class="f">Cash counted (₹)<input type="number" name="counted" min="0" step="1" required></label></div><label class="f" style="margin-top:10px">Note<input name="note" maxlength="160" placeholder="optional"></label>' +
          '<label class="f" style="flex-direction:row;gap:8px;align-items:center;margin:10px 0;font-size:.9rem;color:var(--ink)"><input type="checkbox" name="fix" style="width:auto;min-height:0"> Correct the books to match the count</label><p class="err" id="close-err"></p><button class="btn dark" type="submit">Save day close</button></form></div>' +
          '<div class="cols"><div class="card"><div class="h-between"><h3>Day book</h3></div><div class="tbl-wrap" style="border:0"><table style="min-width:520px"><thead><tr><th>Date</th><th>Entry</th><th class="right">In</th><th class="right">Out</th><th class="right">Balance</th><th></th></tr></thead><tbody>' +
          '<tr><td colspan="4" class="muted">Opening balance</td><td class="right"><b>' + fmt(b.opening) + '</b></td><td></td></tr>' +
          (b.entries.length ? b.entries.map(function (e) {
            return '<tr><td class="nowrap">' + fday(e.date) + '</td><td>' + esc(e.desc) + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</td><td class="right pos">' + (e.in ? fmt(e.in) : '') + '</td><td class="right neg">' + (e.out ? fmt(e.out) : '') + '</td><td class="right"><b>' + fmt(e.balance) + '</b></td><td class="right">' + (e.type === 'expense' ? '<button class="btn sm danger" data-del="expenses/' + e.id + '" aria-label="Delete entry">×</button>' : e.type === 'adjustment' ? '<button class="btn sm danger" data-del="cash-adjustments/' + e.id + '" aria-label="Delete entry">×</button>' : '') + '</td></tr>';
          }).join('') : '<tr><td colspan="6" class="empty">No cash movements in this range.</td></tr>') + '</tbody></table></div></div>' +
          '<div class="stack"><form class="card" id="adj-form"><h3>Add a cash movement</h3><div class="stack" style="gap:10px"><label class="f">What happened<select name="kind"><option value="opening">Opening balance</option><option value="float">Float added (owner puts cash in)</option><option value="deposit">Deposited to bank</option><option value="withdrawal">Owner withdrawal</option></select></label><div class="grid2"><label class="f">Amount (₹)<input type="number" name="amount" min="1" step="1" required></label><label class="f">Date<input type="date" name="date" value="' + istDate() + '"></label></div><label class="f">Note<input name="note" maxlength="160"></label><p class="err" id="adj-err"></p><button class="btn dark" type="submit">Add entry</button></div></form>' +
          '<div class="card"><h3>Recent day closes</h3>' + (closes.length ? '<ul class="tl">' + closes.slice(0, 8).map(function (c) { return '<li><span>' + fday(c.date) + ': counted ' + fmt(c.counted) + '</span><small class="' + (c.difference === 0 ? 'pos' : 'neg') + '">' + (c.difference === 0 ? 'matched' : (c.difference > 0 ? '+' : '') + fmt(c.difference)) + '</small></li>'; }).join('') + '</ul>' : '<p class="muted">None yet.</p>') + '</div></div></div>';
        $('#close-form').addEventListener('submit', function (e) {
          e.preventDefault(); var f = new FormData(e.target);
          api('POST', '/api/admin/day-close', { date: f.get('date'), counted: Number(f.get('counted')), note: f.get('note'), fix: f.get('fix') === 'on' }).then(function (r) {
            toast(r.difference === 0 ? 'Matched. The drawer agrees with the books.' : 'Saved. Difference ' + (r.difference > 0 ? '+' : '') + fmt(r.difference) + (r.fixed ? ' (books corrected)' : ''), r.difference !== 0 && !r.fixed); load();
          }).catch(function (er) { $('#close-err').textContent = er.message; });
        });
        $('#adj-form').addEventListener('submit', function (e) {
          e.preventDefault(); var f = new FormData(e.target);
          api('POST', '/api/admin/cash-adjustments', { kind: f.get('kind'), amount: Number(f.get('amount')), date: f.get('date'), note: f.get('note') }).then(function () { toast('Entry added'); load(); }).catch(function (er) { $('#adj-err').textContent = er.message; });
        });
        $$('[data-del]').forEach(function (btn) { btn.addEventListener('click', function () {
          if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Sure?'; setTimeout(function () { btn.dataset.sure = ''; btn.textContent = '×'; }, 3000); return; }
          api('DELETE', '/api/admin/' + btn.dataset.del).then(function () { toast('Entry deleted'); load(); }).catch(function (er) { toast(er.message, true); });
        }); });
      }).catch(function (e) { $('#cb').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    current.refresh = load; load();
  };

  // ---------- EXPENSES ----------
  var expRange = { from: addDays(istDate(), -29), to: istDate() };
  VIEWS.expenses = function (v) {
    v.innerHTML = '<div class="page-head"><div><h1>Expenses</h1><p>Detergent, fuel, wages, rent. Cash expenses reduce the drawer automatically.</p></div><div id="range-host"></div></div><div class="cols"><div class="stack"><div class="card"><div class="h-between"><h3>Spending</h3><b id="exp-total" style="font:400 1.8rem var(--serif)"></b></div><div class="tbl-wrap" style="border:0"><table><thead><tr><th>Date</th><th>Category</th><th>Paid by</th><th class="right">Amount</th><th></th></tr></thead><tbody id="exp-rows"></tbody></table></div></div></div>' +
      '<form class="card" id="exp-form"><h3>Add an expense</h3><div class="stack" style="gap:10px"><div class="grid2"><label class="f">Date<input type="date" name="date" value="' + istDate() + '" max="' + istDate() + '"></label><label class="f">Amount (₹)<input type="number" name="amount" min="1" step="1" required></label></div><label class="f">Category<select name="category">' + meta.expenseCategories.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label><label class="f">Paid by<select name="method"><option value="cash">Cash from drawer</option><option value="upi">UPI</option><option value="bank">Bank</option></select></label><label class="f">Note<input name="note" maxlength="160" placeholder="e.g. 20 kg detergent"></label><p class="err" id="exp-err"></p><button class="btn primary" type="submit">Save expense</button></div></form></div>';
    $('#range-host').appendChild(rangeBar(expRange, load));
    function load() {
      api('GET', '/api/admin/expenses?from=' + expRange.from + '&to=' + expRange.to).then(function (r) {
        $('#exp-total').textContent = fmt(r.total);
        $('#exp-rows').innerHTML = r.expenses.length ? r.expenses.map(function (e) { return '<tr><td class="nowrap">' + fday(e.date) + '</td><td>' + esc(e.category) + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</td><td><span class="chip">' + esc(e.method.toUpperCase()) + '</span></td><td class="right"><b>' + fmt(e.amount) + '</b></td><td class="right"><button class="btn sm danger" data-del="' + e.id + '" aria-label="Delete expense">×</button></td></tr>'; }).join('') : '<tr><td colspan="5" class="empty">No expenses in this range.</td></tr>';
        $$('[data-del]').forEach(function (b) { b.addEventListener('click', function () {
          if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sure?'; setTimeout(function () { b.dataset.sure = ''; b.textContent = '×'; }, 3000); return; }
          api('DELETE', '/api/admin/expenses/' + b.dataset.del).then(function () { toast('Expense deleted'); load(); }).catch(function (er) { toast(er.message, true); });
        }); });
      }).catch(function (e) { $('#exp-rows').innerHTML = '<tr><td colspan="5" class="err">' + esc(e.message) + '</td></tr>'; });
    }
    $('#exp-form').addEventListener('submit', function (e) {
      e.preventDefault(); var f = new FormData(e.target);
      api('POST', '/api/admin/expenses', { date: f.get('date'), amount: Number(f.get('amount')), category: f.get('category'), method: f.get('method'), note: f.get('note') }).then(function () { toast('Expense saved'); e.target.amount.value = ''; e.target.note.value = ''; $('#exp-err').textContent = ''; load(); }).catch(function (er) { $('#exp-err').textContent = er.message; });
    });
    current.refresh = load; load();
  };

  // ---------- CUSTOMERS ----------
  VIEWS.customers = function (v) {
    v.innerHTML = '<div class="page-head"><div><h1>Customers</h1><p>Everyone who has booked, built from your orders.</p></div><input id="c-q" placeholder="Search name or phone" style="max-width:260px"></div><div class="tbl-wrap"><table><thead><tr><th>Customer</th><th class="right">Orders</th><th class="right">Spent</th><th class="right">Owes</th><th>Last order</th><th></th></tr></thead><tbody id="c-rows"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody></table></div>';
    api('GET', '/api/admin/customers').then(function (r) {
      var all = r.customers;
      var draw = function () {
        var q = $('#c-q').value.trim().toLowerCase(), rows = all.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) > -1 || c.phone.indexOf(q) > -1; });
        $('#c-rows').innerHTML = rows.length ? rows.map(function (c) { return '<tr><td><b>' + esc(c.name) + '</b><small>' + esc(c.phone) + (c.area ? ' · ' + esc(c.area) : '') + '</small></td><td class="right">' + c.orders + (c.orders > 1 ? ' <span class="chip">repeat</span>' : '') + '</td><td class="right"><b>' + fmt(c.spent) + '</b></td><td class="right">' + (c.due ? '<b class="neg">' + fmt(c.due) + '</b>' : '<span class="muted">-</span>') + '</td><td>' + ftime(c.last_order) + '</td><td class="right"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/91' + esc(c.phone) + '">WhatsApp</a></td></tr>'; }).join('') : '<tr><td colspan="6" class="empty">No customers yet.</td></tr>';
      };
      $('#c-q').addEventListener('input', draw); draw();
    }).catch(function (e) { $('#c-rows').innerHTML = '<tr><td colspan="6" class="err">' + esc(e.message) + '</td></tr>'; });
  };

  // ---------- REPORTS ----------
  var repRange = { from: istDate().slice(0, 8) + '01', to: istDate() };
  VIEWS.reports = function (v) {
    v.innerHTML = '<div class="page-head"><div><h1>Reports</h1><p>Profit and loss on a cash basis, plus downloads for your accountant.</p></div><div id="range-host"></div></div><div class="stack" id="rep"><p class="muted">Loading…</p></div>';
    $('#range-host').appendChild(rangeBar(repRange, load));
    function load() {
      Promise.all([api('GET', '/api/admin/summary?from=' + repRange.from + '&to=' + repRange.to), api('GET', '/api/admin/audit')]).then(function (r) {
        var s = r[0], k = s.kpi, qs = '?from=' + repRange.from + '&to=' + repRange.to;
        $('#rep').innerHTML = '<div class="cols"><div class="card"><h3>Profit and loss, ' + fday(s.range.from) + ' to ' + fday(s.range.to) + '</h3><div class="tbl-wrap" style="border:0"><table style="min-width:0"><tbody>' +
          '<tr><td>Sales booked (' + k.orders + ' orders)</td><td class="right">' + fmt(k.sales) + '</td></tr><tr><td class="muted">Still to collect from customers</td><td class="right muted">' + fmt(k.outstanding) + '</td></tr>' +
          '<tr><td><b>Money collected</b></td><td class="right"><b>' + fmt(k.collected) + '</b></td></tr><tr><td class="muted">&nbsp;&nbsp;Cash</td><td class="right muted">' + fmt(k.byMethod.cash) + '</td></tr><tr><td class="muted">&nbsp;&nbsp;UPI</td><td class="right muted">' + fmt(k.byMethod.upi) + '</td></tr><tr><td class="muted">&nbsp;&nbsp;Card</td><td class="right muted">' + fmt(k.byMethod.card) + '</td></tr>' +
          s.byCategory.map(function (c) { return '<tr><td>Expense: ' + esc(c.name) + '</td><td class="right neg">−' + fmt(c.amount) + '</td></tr>'; }).join('') +
          '<tr><td><b>Total expenses</b></td><td class="right neg"><b>−' + fmt(k.expenses) + '</b></td></tr><tr><td><b>Net cash profit</b></td><td class="right ' + (k.net >= 0 ? 'pos' : 'neg') + '"><b style="font:400 1.6rem var(--serif)">' + fmt(k.net) + '</b></td></tr></tbody></table></div></div>' +
          '<div class="stack"><div class="card"><h3>Download (CSV)</h3><p class="muted" style="margin-bottom:12px">For the range selected above. Opens in Excel or Google Sheets.</p><div class="actions"><a class="btn" href="/api/admin/export/orders.csv' + qs + '">Orders</a><a class="btn" href="/api/admin/export/payments.csv' + qs + '">Payments</a><a class="btn" href="/api/admin/export/expenses.csv' + qs + '">Expenses</a></div></div>' +
          '<div class="card"><h3>Activity log</h3><ul class="tl" style="max-height:340px;overflow:auto">' + r[1].log.map(function (a) { return '<li><span>' + esc(a.action) + (a.detail ? ' · ' + esc(a.detail) : '') + '</span><small>' + ftime(a.at) + '</small></li>'; }).join('') + '</ul></div></div></div>';
      }).catch(function (e) { $('#rep').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
    }
    current.refresh = load; load();
  };

  // ---------- SETTINGS ----------
  VIEWS.settings = function (v) {
    api('GET', '/api/admin/settings').then(function (c) {
      meta.config = c;
      v.innerHTML = '<div class="page-head"><div><h1>Settings</h1><p>Prices and details here update the public website straight away.</p></div></div><div class="stack">' +
        '<form class="card" id="s-biz"><h3>Business</h3><div class="grid2"><label class="f">Name<input name="name" value="' + esc(c.business.name) + '" required></label><label class="f">WhatsApp number (with 91)<input name="whatsapp" value="' + esc(c.business.whatsapp) + '" required></label><label class="f">Phone shown on site<input name="phone" value="' + esc(c.business.phone) + '"></label><label class="f">Opening hours<input name="hours" value="' + esc(c.business.hours) + '"></label></div><label class="f" style="margin-top:12px">Address<input name="address" value="' + esc(c.business.address) + '"></label><p class="err" id="biz-err"></p><button class="btn dark" type="submit">Save business details</button></form>' +
        '<form class="card" id="s-svc"><h3>Services and prices</h3><div class="tbl-wrap" style="border:0"><table id="svc-t"><thead><tr><th>Id</th><th>Name</th><th>Unit</th><th>Rate ₹</th><th>Turnaround</th><th>Description</th><th></th></tr></thead><tbody></tbody></table></div><div class="actions" style="margin-top:12px"><button type="button" class="btn sm" id="svc-add">+ Add service</button></div>' +
        '<div class="grid3" style="margin-top:16px"><label class="f">Express surcharge %<input type="number" name="expressPct" min="0" max="200" value="' + c.expressPct + '"></label><label class="f">Minimum order ₹<input type="number" name="minOrder" min="0" value="' + c.minOrder + '"></label><label class="f">Free pickup above ₹<input type="number" name="freePickupAbove" min="0" value="' + c.freePickupAbove + '"></label><label class="f">Pickup fee below that ₹<input type="number" name="pickupFee" min="0" value="' + c.pickupFee + '"></label></div><p class="err" id="svc-err"></p><button class="btn primary" type="submit">Save prices</button></form>' +
        '<form class="card" id="s-lists"><h3>Pickup slots and areas</h3><div class="grid2"><label class="f">Time slots (one per line)<textarea name="slots" rows="6">' + esc(c.slots.join('\n')) + '</textarea></label><label class="f">Areas you serve (one per line)<textarea name="areas" rows="6">' + esc(c.areas.join('\n')) + '</textarea></label></div><p class="err" id="lists-err"></p><button class="btn dark" type="submit" style="margin-top:12px">Save lists</button></form>' +
        '<form class="card" id="s-pw"><h3>Change password</h3><div class="grid2"><label class="f">Current password<input type="password" name="current" autocomplete="current-password" required></label><label class="f">New password (8+ characters)<input type="password" name="next" autocomplete="new-password" minlength="8" required></label></div><p class="err" id="pw-err"></p><button class="btn dark" type="submit">Change password</button></form></div>';
      var tb = $('#svc-t tbody');
      var rowHtml = function (s) { return '<tr><td><input data-f="id" value="' + esc(s.id) + '" style="min-width:110px"></td><td><input data-f="name" value="' + esc(s.name) + '" style="min-width:140px"></td><td><select data-f="unit"><option' + (s.unit === 'kg' ? ' selected' : '') + '>kg</option><option value="piece"' + (s.unit === 'piece' ? ' selected' : '') + '>piece</option></select></td><td><input data-f="rate" type="number" min="1" value="' + s.rate + '" style="width:90px"></td><td><input data-f="tat" value="' + esc(s.tat) + '" style="min-width:120px"></td><td><input data-f="desc" value="' + esc(s.desc) + '" style="min-width:220px"></td><td><button type="button" class="btn sm danger" data-rm aria-label="Remove service">×</button></td></tr>'; };
      tb.innerHTML = c.services.map(rowHtml).join('');
      $('#svc-add').addEventListener('click', function () { tb.insertAdjacentHTML('beforeend', rowHtml({ id: 'service_' + (tb.rows.length + 1), name: 'New service', unit: 'kg', rate: 100, tat: '48 hours', desc: '' })); });
      tb.addEventListener('click', function (e) { if (e.target.dataset.rm !== undefined && tb.rows.length > 1) e.target.closest('tr').remove(); });
      var save = function (form, errId, build, okMsg) {
        $(form).addEventListener('submit', function (e) {
          e.preventDefault();
          api('PUT', '/api/admin/settings', build(new FormData(e.target))).then(function (cfg) { meta.config = cfg; $(errId).textContent = ''; toast(okMsg); }).catch(function (er) { $(errId).textContent = er.message; });
        });
      };
      save('#s-biz', '#biz-err', function (f) { return { business: { name: f.get('name'), whatsapp: f.get('whatsapp'), phone: f.get('phone'), hours: f.get('hours'), address: f.get('address') } }; }, 'Business details saved');
      save('#s-svc', '#svc-err', function (f) {
        return { services: $$('tr', tb).map(function (tr) { var g = function (k) { return $('[data-f="' + k + '"]', tr).value; }; return { id: g('id'), name: g('name'), unit: g('unit'), rate: Number(g('rate')), tat: g('tat'), desc: g('desc') }; }), expressPct: Number(f.get('expressPct')), minOrder: Number(f.get('minOrder')), freePickupAbove: Number(f.get('freePickupAbove')), pickupFee: Number(f.get('pickupFee')) };
      }, 'Prices saved. The website now shows them.');
      save('#s-lists', '#lists-err', function (f) { var ln = function (k) { return String(f.get(k)).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }; return { slots: ln('slots'), areas: ln('areas') }; }, 'Lists saved');
      $('#s-pw').addEventListener('submit', function (e) {
        e.preventDefault(); var f = new FormData(e.target);
        api('POST', '/api/admin/password', { current: f.get('current'), next: f.get('next') }).then(function () { toast('Password changed. Please sign in again.'); showLogin(); }).catch(function (er) { $('#pw-err').textContent = er.message; });
      });
    }).catch(function (e) { v.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  };

  // ---------- boot ----------
  function boot() {
    api('GET', '/api/admin/me').then(function (m) {
      meta = m; shell();
      return api('GET', '/api/admin/pulse?since=0').then(function (p) { pulse.maxId = p.maxId; pulse.awaiting = p.awaiting; setBadge(p.awaiting); });
    }).then(function () { route(); }).catch(function () { /* login screen already shown on 401 */ });
  }
  boot();
})();
