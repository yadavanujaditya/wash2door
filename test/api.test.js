'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const L = require('../server/lib');

let base, app, cookie = '';
const call = async (method, url, body, extra = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ww', ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
};

test.before(async () => {
  app = createApp({ dbPath: ':memory:', adminPassword: 'test-password-1' });
  await new Promise((r) => app.server.listen(0, r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
test.after(() => app.server.close());

test('pricing is computed on the server and honours minimum, express and pickup fee', () => {
  const cfg = require('../server/db').DEFAULT_SETTINGS;
  const small = L.priceOrder(cfg, [{ service: 'wash_fold', qty: 1 }]);
  assert.equal(small.subtotal, 150); // minimum order top up
  assert.equal(small.pickupFee, 30);
  const big = L.priceOrder(cfg, [{ service: 'wash_fold', qty: 10 }], { express: true });
  assert.equal(big.subtotal, 600);
  assert.equal(big.expressFee, 180);
  assert.equal(big.pickupFee, 0);
  assert.equal(big.total, 780);
  assert.throws(() => L.priceOrder(cfg, [{ service: 'wash_fold', qty: 0.3 }]));
  assert.throws(() => L.priceOrder(cfg, [{ service: 'nope', qty: 1 }]));
});

test('admin routes need a session', async () => {
  assert.equal((await call('GET', '/api/admin/summary')).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { password: 'wrong' })).status, 401);
});

test('booking, tracking, payments and cash book work end to end', async () => {
  const bad = await call('POST', '/api/orders', { name: 'A', phone: '123', address: 'x', items: [{ service: 'wash_fold', qty: 2 }] });
  assert.equal(bad.status, 400);

  const created = await call('POST', '/api/orders', {
    name: 'Meera Joshi', phone: '+91 98765 43210', address: 'Near Ganga Ghat, Tapovan', area: 'Tapovan',
    items: [{ service: 'wash_fold', qty: 5 }, { service: 'dry_clean', qty: 2 }], express: false, slot: '8 to 11 am',
  });
  assert.equal(created.status, 201);
  assert.match(created.json.code, /^WW-\d{6}-001$/);
  assert.equal(created.json.total, 5 * 60 + 2 * 160);

  const track = await call('GET', `/api/track?code=${created.json.code}&phone=3210`);
  assert.equal(track.status, 200);
  assert.equal(track.json.status, 'new');
  assert.equal((await call('GET', `/api/track?code=${created.json.code}&phone=0000`)).status, 404);

  const login = await call('POST', '/api/admin/login', { password: 'test-password-1' });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('POST', '/api/admin/expenses', { amount: 100, category: 'Fuel', method: 'cash' }, { 'X-Requested-With': '' })).status, 403);

  assert.equal((await call('POST', '/api/admin/cash-adjustments', { kind: 'opening', amount: 1000 })).status, 201);
  const list = await call('GET', '/api/admin/orders');
  const id = list.json.orders[0].id;

  assert.equal((await call('PATCH', `/api/admin/orders/${id}`, { status: 'delivered' })).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${id}/payments`, { amount: 9999, method: 'cash' })).status, 400); // overpay blocked
  assert.equal((await call('POST', `/api/admin/orders/${id}/payments`, { amount: 400, method: 'cash' })).status, 201);
  const second = await call('POST', `/api/admin/orders/${id}/payments`, { amount: 220, method: 'upi' });
  assert.equal(second.json.pay_status, 'paid');
  assert.equal((await call('PATCH', `/api/admin/orders/${id}`, { status: 'cancelled' })).status, 400); // has payments

  assert.equal((await call('POST', '/api/admin/expenses', { amount: 150, category: 'Fuel', method: 'cash' })).status, 201);
  const sum = (await call('GET', '/api/admin/summary')).json;
  assert.equal(sum.kpi.sales, 620);
  assert.equal(sum.kpi.collected, 620);
  assert.equal(sum.kpi.byMethod.cash, 400);
  assert.equal(sum.kpi.expenses, 150);
  assert.equal(sum.kpi.net, 470);
  assert.equal(sum.kpi.outstanding, 0);
  assert.equal(sum.kpi.cashInHand, 1000 + 400 - 150);

  const book = (await call('GET', '/api/admin/cashbook')).json;
  assert.equal(book.closing, 1250);
  assert.equal(book.entries.at(-1).balance, 1250);

  const close = await call('POST', '/api/admin/day-close', { counted: 1200, fix: true });
  assert.equal(close.json.difference, -50);
  assert.equal((await call('GET', '/api/admin/summary')).json.kpi.cashInHand, 1200);

  const csv = await call('GET', '/api/admin/export/orders.csv');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
});

test('settings validation and csv injection guard', async () => {
  const bad = await call('PUT', '/api/admin/settings', { services: [{ id: 'x', name: 'X', unit: 'kg', rate: 10 }] });
  assert.equal(bad.status, 400);
  assert.equal(L.toCsv(['a'], [['=HYPERLINK("x")']]).includes("'=HYPERLINK"), true);
});
