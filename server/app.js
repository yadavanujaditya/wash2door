'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  openDb, getSetting, setSetting, getConfig, transaction, DEFAULT_SETTINGS,
} = require('./db');
const L = require('./lib');
const { HttpError } = L;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function createApp(opts = {}) {
  const root = path.resolve(__dirname, '..');
  const publicDir = path.join(root, 'public');
  const adminDir = path.join(root, 'admin');
  const db = openDb(opts.dbPath || process.env.DB_PATH || path.join(root, 'data', 'washwala.db'));
  const trustProxy = opts.trustProxy ?? process.env.TRUST_PROXY === '1';
  const limiter = L.makeLimiter();
  const sessions = new Map(); // token -> expiry ms
  const SESSION_MS = 12 * 3600 * 1000;
  let generatedPassword = null;

  // First run: create the admin password.
  if (!getSetting(db, 'admin_hash', null)) {
    const pw = opts.adminPassword || process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    if (!opts.adminPassword && !process.env.ADMIN_PASSWORD) generatedPassword = pw;
    if (pw.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
    setSetting(db, 'admin_hash', L.hashPassword(pw));
  }

  const audit = (action, detail = '') => db.prepare('INSERT INTO audit(at,action,detail) VALUES(?,?,?)').run(Date.now(), action, String(detail).slice(0, 300));

  // ---------- order helpers ----------
  const ORDER_SELECT = `SELECT o.*, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id = o.id),0) AS paid FROM orders o`;

  function shapeOrder(r) {
    if (!r) return null;
    const paid = Number(r.paid || 0);
    const balance = r.status === 'cancelled' ? 0 : Math.max(0, r.total - paid);
    return {
      id: r.id, code: r.code, name: r.name, phone: r.phone, address: r.address, area: r.area,
      items: JSON.parse(r.items), express: !!r.express, slot: r.slot, pickup_date: r.pickup_date, notes: r.notes,
      status: r.status, source: r.source, subtotal: r.subtotal, express_fee: r.express_fee, pickup_fee: r.pickup_fee,
      discount: r.discount, total: r.total, paid, balance,
      pay_status: r.status === 'cancelled' ? 'void' : paid >= r.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      created_at: r.created_at, updated_at: r.updated_at,
    };
  }
  const getOrder = (id) => shapeOrder(db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id));

  function nextCode(now) {
    const ymd = L.istDate(now).slice(2).replace(/-/g, '');
    const row = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE code LIKE ?").get(`WW-${ymd}-%`);
    return `WW-${ymd}-${String(Number(row.n) + 1).padStart(3, '0')}`;
  }

  function createOrder(input, { source, admin = false }) {
    const cfg = getConfig(db);
    const name = L.cleanStr(input.name, 80, { required: true, field: 'Name' });
    const phone = L.cleanPhone(input.phone);
    const address = L.cleanStr(input.address, 300, { required: true, field: 'Address' });
    const area = L.cleanStr(input.area, 80, { field: 'Area' });
    const notes = L.cleanStr(input.notes, 400, { field: 'Notes' });
    const slot = L.cleanStr(input.slot, 40, { field: 'Slot' });
    if (slot && !cfg.slots.includes(slot)) throw new HttpError(400, 'Pick one of the pickup slots.');
    const today = L.istDate();
    let pickup = input.pickup_date ? String(input.pickup_date) : today;
    if (!L.isDate(pickup)) throw new HttpError(400, 'Pickup date is not valid.');
    if (!admin && (pickup < today || pickup > L.addDays(today, 14))) throw new HttpError(400, 'Choose a pickup date within the next 14 days.');
    const priced = L.priceOrder(cfg, input.items, { express: !!input.express, discount: admin ? input.discount : 0 });
    const status = admin && L.STATUSES.includes(input.status) ? input.status : 'new';

    return transaction(db, () => {
      const now = Date.now();
      const code = nextCode(now);
      const res = db.prepare(`INSERT INTO orders(code,name,phone,address,area,items,express,slot,pickup_date,notes,status,source,
        subtotal,express_fee,pickup_fee,discount,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, name, phone, address, area, JSON.stringify(priced.items), input.express ? 1 : 0, slot, pickup, notes, status, source,
          priced.subtotal + 0, priced.expressFee, priced.pickupFee, priced.discount, priced.total, now, now);
      const id = Number(res.lastInsertRowid);
      db.prepare('INSERT INTO order_events(order_id,status,note,at) VALUES(?,?,?,?)').run(id, status, source === 'website' ? 'Booked on the website' : 'Created by staff', now);
      if (admin && input.payment && Number(input.payment.amount) > 0) addPayment(id, input.payment, now);
      if (admin) audit('order.create', `${code} ${name} ₹${priced.total}`);
      return { id, code, priced };
    });
  }

  function addPayment(orderId, input, now = Date.now()) {
    const order = getOrder(orderId);
    if (!order) throw new HttpError(404, 'Order not found.');
    if (order.status === 'cancelled') throw new HttpError(400, 'This order is cancelled.');
    const amount = L.cleanMoney(input.amount, { field: 'Payment' });
    const method = ['cash', 'upi', 'card'].includes(input.method) ? input.method : null;
    if (!method) throw new HttpError(400, 'Choose cash, UPI or card.');
    if (amount > order.balance) throw new HttpError(400, `Only ₹${order.balance} is due on this order.`);
    const note = L.cleanStr(input.note, 120, { field: 'Note' });
    const r = db.prepare('INSERT INTO payments(order_id,amount,method,note,received_at) VALUES(?,?,?,?,?)').run(orderId, amount, method, note, now);
    audit('payment.add', `${order.code} ₹${amount} ${method}`);
    return Number(r.lastInsertRowid);
  }

  // ---------- money ----------
  function cashBalance({ beforeDate = null, throughDate = null } = {}) {
    let payCond = "method = 'cash'", expCond = "method = 'cash'", adjCond = '1=1';
    const pArgs = [], eArgs = [], aArgs = [];
    if (beforeDate) {
      payCond += ' AND received_at < ?'; pArgs.push(L.dayStartMs(beforeDate));
      expCond += ' AND date < ?'; eArgs.push(beforeDate);
      adjCond += ' AND date < ?'; aArgs.push(beforeDate);
    } else if (throughDate) {
      payCond += ' AND received_at < ?'; pArgs.push(L.dayStartMs(L.addDays(throughDate, 1)));
      expCond += ' AND date <= ?'; eArgs.push(throughDate);
      adjCond += ' AND date <= ?'; aArgs.push(throughDate);
    }
    const p = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE ${payCond}`).get(...pArgs).s;
    const e = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE ${expCond}`).get(...eArgs).s;
    const ai = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM cash_adjustments WHERE direction='in' AND ${adjCond}`).get(...aArgs).s;
    const ao = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM cash_adjustments WHERE direction='out' AND ${adjCond}`).get(...aArgs).s;
    return Number(p) - Number(e) + Number(ai) - Number(ao);
  }

  function rangeArgs(q, defDays = 30) {
    const today = L.istDate();
    let to = L.isDate(q.get('to')) ? q.get('to') : today;
    let from = L.isDate(q.get('from')) ? q.get('from') : L.addDays(to, -(defDays - 1));
    if (from > to) [from, to] = [to, from];
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new HttpError(400, 'Choose a range of at most 400 days.');
    return { from, to, fromMs: L.dayStartMs(from), toMs: L.dayStartMs(L.addDays(to, 1)) };
  }

  function summary(q) {
    const { from, to, fromMs, toMs } = rangeArgs(q);
    const days = [];
    for (let d = from; d <= to; d = L.addDays(d, 1)) days.push(d);
    const series = new Map(days.map((d) => [d, { date: d, sales: 0, collected: 0, expenses: 0, orders: 0 }]));

    const orders = db.prepare('SELECT created_at,total,status,area,items,source FROM orders WHERE created_at >= ? AND created_at < ?').all(fromMs, toMs);
    const pays = db.prepare('SELECT amount,method,received_at FROM payments WHERE received_at >= ? AND received_at < ?').all(fromMs, toMs);
    const exps = db.prepare('SELECT date,category,amount,method FROM expenses WHERE date >= ? AND date <= ?').all(from, to);

    let sales = 0, orderCount = 0;
    const services = {}, areas = {}, sources = {};
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const s = series.get(L.istDate(o.created_at));
      if (s) { s.sales += o.total; s.orders += 1; }
      sales += o.total; orderCount += 1;
      areas[o.area || 'Not given'] = (areas[o.area || 'Not given'] || 0) + 1;
      sources[o.source] = (sources[o.source] || 0) + 1;
      for (const it of JSON.parse(o.items)) {
        const k = it.name; services[k] = services[k] || { name: k, amount: 0, orders: 0 };
        services[k].amount += it.amount; services[k].orders += 1;
      }
    }
    const byMethod = { cash: 0, upi: 0, card: 0 };
    let collected = 0;
    for (const p of pays) {
      byMethod[p.method] += p.amount; collected += p.amount;
      const s = series.get(L.istDate(p.received_at)); if (s) s.collected += p.amount;
    }
    const byCategory = {};
    let spent = 0;
    for (const e of exps) {
      spent += e.amount; byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      const s = series.get(e.date); if (s) s.expenses += e.amount;
    }

    const open = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total - paid),0) AS due FROM (${ORDER_SELECT.replace('SELECT o.*,', 'SELECT o.total, o.status,')} WHERE o.status != 'cancelled') WHERE total > paid`).get();
    const statusRows = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
    const statusCounts = Object.fromEntries(L.STATUSES.map((s) => [s, 0]));
    for (const r of statusRows) statusCounts[r.status] = r.n;

    const today = L.istDate();
    const t0 = L.dayStartMs(today), t1 = L.dayStartMs(L.addDays(today, 1));
    const tOrders = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS s FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'").get(t0, t1);
    const tCollected = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE received_at >= ? AND received_at < ?').get(t0, t1).s;
    const tCash = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE method='cash' AND received_at >= ? AND received_at < ?").get(t0, t1).s;
    const tExp = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE date = ?').get(today).s;
    const pickupsToday = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE pickup_date = ? AND status IN ('new','confirmed')").get(today).n;
    const lastClose = db.prepare('SELECT * FROM day_closes ORDER BY date DESC LIMIT 1').get() || null;

    return {
      range: { from, to },
      kpi: {
        sales, orders: orderCount, avgOrder: orderCount ? Math.round(sales / orderCount) : 0,
        collected, byMethod, expenses: spent, net: collected - spent,
        outstanding: Number(open.due), outstandingOrders: Number(open.n),
        cashInHand: cashBalance(),
      },
      today: {
        date: today, orders: Number(tOrders.n), sales: Number(tOrders.s), collected: Number(tCollected),
        cash: Number(tCash), expenses: Number(tExp), pickupsDue: Number(pickupsToday),
      },
      series: days.map((d) => series.get(d)),
      statusCounts,
      byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      topServices: Object.values(services).sort((a, b) => b.amount - a.amount),
      topAreas: Object.entries(areas).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 6),
      sources,
      lastClose,
    };
  }

  function listOrders(q) {
    const where = [], args = [];
    const status = q.get('status');
    if (status && L.STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
    if (status === 'active') { where.push("status NOT IN ('delivered','cancelled')"); }
    const pay = q.get('pay');
    if (pay === 'unpaid') where.push("status != 'cancelled' AND paid = 0");
    if (pay === 'partial') where.push("status != 'cancelled' AND paid > 0 AND paid < total");
    if (pay === 'paid') where.push('paid >= total');
    if (pay === 'due') where.push("status != 'cancelled' AND paid < total");
    const text = (q.get('q') || '').trim().slice(0, 60);
    if (text) {
      where.push("(code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");
      const like = '%' + text.replace(/[\\%_]/g, '\\$&') + '%';
      args.push(like, like, like);
    }
    if (L.isDate(q.get('from'))) { where.push('created_at >= ?'); args.push(L.dayStartMs(q.get('from'))); }
    if (L.isDate(q.get('to'))) { where.push('created_at < ?'); args.push(L.dayStartMs(L.addDays(q.get('to'), 1))); }
    const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 50));
    const offset = Math.max(0, Number(q.get('offset')) || 0);
    const base = `FROM (${ORDER_SELECT}) ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...args).n;
    const rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { total: Number(total), orders: rows.map(shapeOrder) };
  }

  function orderDetail(id) {
    const order = getOrder(id);
    if (!order) throw new HttpError(404, 'Order not found.');
    order.events = db.prepare('SELECT status,note,at FROM order_events WHERE order_id = ? ORDER BY at, id').all(id);
    order.payments = db.prepare('SELECT id,amount,method,note,received_at FROM payments WHERE order_id = ? ORDER BY received_at, id').all(id);
    return order;
  }

  function patchOrder(id, b) {
    const cur = getOrder(id);
    if (!cur) throw new HttpError(404, 'Order not found.');
    return transaction(db, () => {
      const now = Date.now();
      const cfg = getConfig(db);
      const set = {};
      if (b.name !== undefined) set.name = L.cleanStr(b.name, 80, { required: true, field: 'Name' });
      if (b.phone !== undefined) set.phone = L.cleanPhone(b.phone);
      if (b.address !== undefined) set.address = L.cleanStr(b.address, 300, { required: true, field: 'Address' });
      if (b.area !== undefined) set.area = L.cleanStr(b.area, 80);
      if (b.notes !== undefined) set.notes = L.cleanStr(b.notes, 400);
      if (b.slot !== undefined) { set.slot = L.cleanStr(b.slot, 40); if (set.slot && !cfg.slots.includes(set.slot)) throw new HttpError(400, 'Pick one of the pickup slots.'); }
      if (b.pickup_date !== undefined) { if (!L.isDate(b.pickup_date)) throw new HttpError(400, 'Pickup date is not valid.'); set.pickup_date = b.pickup_date; }

      const reprice = b.items !== undefined || b.express !== undefined || b.discount !== undefined;
      if (reprice) {
        if (['delivered', 'cancelled'].includes(cur.status)) throw new HttpError(400, 'Delivered or cancelled orders cannot be repriced.');
        const items = b.items !== undefined ? b.items : cur.items.map((i) => ({ service: i.service, qty: i.qty }));
        const express = b.express !== undefined ? !!b.express : cur.express;
        const discount = b.discount !== undefined ? L.cleanMoney(b.discount, { min: 0, field: 'Discount' }) : cur.discount;
        const p = L.priceOrder(cfg, items, { express, discount });
        if (p.total < cur.paid) throw new HttpError(400, `₹${cur.paid} is already paid. The new total ₹${p.total} is lower. Remove a payment first.`);
        Object.assign(set, {
          items: JSON.stringify(p.items), express: express ? 1 : 0, subtotal: p.subtotal, express_fee: p.expressFee,
          pickup_fee: p.pickupFee, discount: p.discount, total: p.total,
        });
      }

      let statusChanged = false;
      if (b.status !== undefined && b.status !== cur.status) {
        if (!L.STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status.');
        if (b.status === 'cancelled' && cur.paid > 0) throw new HttpError(400, 'This order has payments. Remove them (refund) before cancelling.');
        set.status = b.status; statusChanged = true;
      }
      const keys = Object.keys(set);
      if (keys.length) {
        db.prepare(`UPDATE orders SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => set[k]), now, id);
      }
      if (statusChanged) {
        db.prepare('INSERT INTO order_events(order_id,status,note,at) VALUES(?,?,?,?)').run(id, set.status, L.cleanStr(b.status_note, 120), now);
        audit('order.status', `${cur.code} ${cur.status} to ${set.status}`);
      } else if (keys.length) audit('order.edit', `${cur.code} ${keys.join(',')}`);
      return orderDetail(id);
    });
  }

  function cashbook(q) {
    const { from, to, fromMs, toMs } = rangeArgs(q, 14);
    const opening = cashBalance({ beforeDate: from });
    const entries = [];
    for (const p of db.prepare(`SELECT p.id,p.amount,p.note,p.received_at,o.code,o.name FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.method='cash' AND p.received_at >= ? AND p.received_at < ?`).all(fromMs, toMs)) {
      entries.push({ ts: p.received_at, date: L.istDate(p.received_at), type: 'payment', ref: `pay-${p.id}`, desc: `Order ${p.code} · ${p.name}`, note: p.note, in: p.amount, out: 0 });
    }
    for (const e of db.prepare("SELECT * FROM expenses WHERE method='cash' AND date >= ? AND date <= ?").all(from, to)) {
      entries.push({ ts: e.created_at, date: e.date, type: 'expense', ref: `exp-${e.id}`, id: e.id, desc: e.category, note: e.note, in: 0, out: e.amount });
    }
    for (const a of db.prepare('SELECT * FROM cash_adjustments WHERE date >= ? AND date <= ?').all(from, to)) {
      entries.push({ ts: a.created_at, date: a.date, type: 'adjustment', ref: `adj-${a.id}`, id: a.id, desc: ({ opening: 'Opening balance', deposit: 'Deposited to bank', withdrawal: 'Owner withdrawal', float: 'Float added', count_fix: 'Day close correction' })[a.kind] || 'Cash adjustment', note: a.note, in: a.direction === 'in' ? a.amount : 0, out: a.direction === 'out' ? a.amount : 0 });
    }
    entries.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.ts - y.ts));
    let bal = opening, totalIn = 0, totalOut = 0;
    for (const e of entries) { bal += e.in - e.out; e.balance = bal; totalIn += e.in; totalOut += e.out; }
    return { from, to, opening, closing: bal, totalIn, totalOut, entries, today: cashBalance({ throughDate: L.istDate() }) };
  }

  function customers() {
    const rows = db.prepare(`SELECT phone, MAX(name) AS name, COUNT(*) AS orders, MAX(created_at) AS last_order, MIN(created_at) AS first_order,
      SUM(total) AS spent, SUM(CASE WHEN total > paid THEN total - paid ELSE 0 END) AS due, MAX(area) AS area
      FROM (${ORDER_SELECT}) WHERE status != 'cancelled' GROUP BY phone ORDER BY MAX(created_at) DESC LIMIT 1000`).all();
    return rows.map((r) => ({ ...r, orders: Number(r.orders), spent: Number(r.spent), due: Number(r.due) }));
  }

  // ---------- settings validation ----------
  function validateSettings(b) {
    const out = {};
    if (b.business) {
      const x = b.business;
      out.business = {
        name: L.cleanStr(x.name, 60, { required: true, field: 'Business name' }),
        whatsapp: String(x.whatsapp || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1'),
        phone: L.cleanStr(x.phone, 30), address: L.cleanStr(x.address, 160), hours: L.cleanStr(x.hours, 80),
      };
      if (!/^\d{11,14}$/.test(out.business.whatsapp)) throw new HttpError(400, 'WhatsApp number must include the country code, e.g. 916388871965.');
    }
    if (b.services) {
      if (!Array.isArray(b.services) || b.services.length < 1 || b.services.length > 20) throw new HttpError(400, 'Add between 1 and 20 services.');
      const ids = new Set();
      out.services = b.services.map((s) => {
        const id = String(s.id || '').toLowerCase();
        if (!/^[a-z0-9_]{2,24}$/.test(id) || ids.has(id)) throw new HttpError(400, 'Each service needs a unique id of letters, numbers or underscores.');
        ids.add(id);
        if (!['kg', 'piece'].includes(s.unit)) throw new HttpError(400, 'Unit must be kg or piece.');
        return {
          id, name: L.cleanStr(s.name, 40, { required: true, field: 'Service name' }), unit: s.unit,
          rate: L.cleanMoney(s.rate, { min: 1, max: 5000, field: 'Rate' }), tat: L.cleanStr(s.tat, 40), desc: L.cleanStr(s.desc, 160),
        };
      });
    }
    for (const [k, min, max] of [['expressPct', 0, 200], ['minOrder', 0, 5000], ['freePickupAbove', 0, 20000], ['pickupFee', 0, 1000]]) {
      if (b[k] !== undefined) out[k] = L.cleanMoney(b[k], { min, max, field: k });
    }
    for (const k of ['slots', 'areas']) {
      if (b[k] !== undefined) {
        if (!Array.isArray(b[k]) || b[k].length > 30) throw new HttpError(400, `${k} must be a short list.`);
        out[k] = b[k].map((x) => L.cleanStr(x, 50)).filter(Boolean);
        if (k === 'slots' && out[k].length === 0) throw new HttpError(400, 'Keep at least one pickup slot.');
      }
    }
    return out;
  }

  // ---------- HTTP plumbing ----------
  function clientIp(req) {
    if (trustProxy) {
      const xf = req.headers['x-forwarded-for'];
      if (xf) return String(xf).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }
  function send(res, status, body, headers = {}) {
    const isObj = typeof body === 'object' && !Buffer.isBuffer(body) && body !== null;
    const data = isObj ? JSON.stringify(body) : body ?? '';
    res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(data);
  }
  function readJson(req) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers['content-type'] || '');
      if (!type.startsWith('application/json')) return reject(new HttpError(415, 'Send JSON.'));
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 100 * 1024) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'Invalid JSON.')); } });
      req.on('error', reject);
    });
  }
  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  const isAuthed = (req) => {
    const t = parseCookies(req).ww_sid;
    if (!t) return false;
    const exp = sessions.get(t);
    if (!exp) return false;
    if (exp < Date.now()) { sessions.delete(t); return false; }
    return true;
  };
  const cookieFlags = (req) => `Path=/; HttpOnly; SameSite=Strict${trustProxy || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, handler, { admin = false } = {}) => routes.push({ method, re: new RegExp('^' + pattern + '$'), handler, admin });

  route('GET', '/api/config', async () => {
    const c = getConfig(db);
    return { status: 200, body: { business: { name: c.business.name, whatsapp: c.business.whatsapp, phone: c.business.phone, address: c.business.address, hours: c.business.hours }, services: c.services, expressPct: c.expressPct, minOrder: c.minOrder, freePickupAbove: c.freePickupAbove, pickupFee: c.pickupFee, slots: c.slots, areas: c.areas } };
  });

  route('POST', '/api/quote', async ({ req, ip }) => {
    if (!limiter(`quote:${ip}`, 120, 600000)) throw new HttpError(429, 'Slow down a little.');
    const b = await readJson(req);
    const p = L.priceOrder(getConfig(db), b.items, { express: !!b.express });
    return { status: 200, body: p };
  });

  route('POST', '/api/orders', async ({ req, ip }) => {
    if (!limiter(`order:${ip}`, 6, 3600000)) throw new HttpError(429, 'Too many bookings from this device. Please WhatsApp us instead.');
    const b = await readJson(req);
    if (b.website) return { status: 200, body: { ok: true } }; // honeypot field, bots only
    const phone = L.cleanPhone(b.phone);
    if (!limiter(`orderphone:${phone}`, 4, 3600000)) throw new HttpError(429, 'This number has booked several times already. Please WhatsApp us.');
    const { code, priced } = createOrder({ ...b, phone }, { source: 'website' });
    return { status: 201, body: { code, total: priced.total, breakdown: priced } };
  });

  route('GET', '/api/track', async ({ url, ip }) => {
    if (!limiter(`track:${ip}`, 30, 600000)) throw new HttpError(429, 'Too many lookups. Try again in a few minutes.');
    const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
    const last4 = String(url.searchParams.get('phone') || '').replace(/\D/g, '').slice(-4);
    const row = db.prepare('SELECT id FROM orders WHERE code = ?').get(code);
    const order = row && getOrder(row.id);
    if (!order || last4.length !== 4 || !order.phone.endsWith(last4)) throw new HttpError(404, 'No order found for that code and number.');
    const events = db.prepare('SELECT status,at FROM order_events WHERE order_id = ? ORDER BY at, id').all(order.id);
    return { status: 200, body: { code: order.code, status: order.status, label: L.STATUS_LABEL[order.status], first_name: order.name.split(' ')[0], items: order.items.map((i) => ({ name: i.name, qty: i.qty, unit: i.unit })), total: order.total, paid: order.paid, balance: order.balance, slot: order.slot, pickup_date: order.pickup_date, express: order.express, events: events.map((e) => ({ status: e.status, label: L.STATUS_LABEL[e.status], at: e.at })) } };
  });

  // admin auth
  route('POST', '/api/admin/login', async ({ req, ip, res }) => {
    if (!limiter(`login:${ip}`, 6, 600000)) throw new HttpError(429, 'Too many attempts. Wait 10 minutes.');
    const b = await readJson(req);
    if (!L.verifyPassword(b.password, getSetting(db, 'admin_hash', ''))) { audit('login.fail', ip); throw new HttpError(401, 'Wrong password.'); }
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_MS);
    audit('login', ip);
    res.setHeader('Set-Cookie', `ww_sid=${token}; Max-Age=${SESSION_MS / 1000}; ${cookieFlags(req)}`);
    return { status: 200, body: { ok: true } };
  });
  route('POST', '/api/admin/logout', async ({ req, res }) => {
    const t = parseCookies(req).ww_sid; if (t) sessions.delete(t);
    res.setHeader('Set-Cookie', `ww_sid=; Max-Age=0; ${cookieFlags(req)}`);
    return { status: 200, body: { ok: true } };
  });
  route('GET', '/api/admin/me', async () => ({ status: 200, body: { ok: true, config: getConfig(db), statuses: L.STATUSES, statusLabels: L.STATUS_LABEL, expenseCategories: L.EXPENSE_CATEGORIES } }), { admin: true });
  route('POST', '/api/admin/password', async ({ req }) => {
    const b = await readJson(req);
    if (!L.verifyPassword(b.current, getSetting(db, 'admin_hash', ''))) throw new HttpError(400, 'Current password is wrong.');
    if (typeof b.next !== 'string' || b.next.length < 8 || b.next.length > 100) throw new HttpError(400, 'New password must be at least 8 characters.');
    setSetting(db, 'admin_hash', L.hashPassword(b.next));
    sessions.clear(); audit('password.change');
    return { status: 200, body: { ok: true } };
  }, { admin: true });

  route('GET', '/api/admin/pulse', async ({ url }) => {
    const since = Number(url.searchParams.get('since')) || 0;
    const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(id),0) AS maxId FROM orders WHERE id > ? AND source = 'website'").get(since);
    const row = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").get();
    return { status: 200, body: { newSince: Number(r.n), maxId: Number(db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM orders').get().m), awaiting: Number(row.n) } };
  }, { admin: true });

  route('GET', '/api/admin/summary', async ({ url }) => ({ status: 200, body: summary(url.searchParams) }), { admin: true });
  route('GET', '/api/admin/orders', async ({ url }) => ({ status: 200, body: listOrders(url.searchParams) }), { admin: true });
  route('GET', '/api/admin/orders/(\\d+)', async ({ m }) => ({ status: 200, body: orderDetail(Number(m[1])) }), { admin: true });
  route('POST', '/api/admin/orders', async ({ req }) => {
    const b = await readJson(req);
    const { id } = createOrder(b, { source: ['walk_in', 'whatsapp', 'phone'].includes(b.source) ? b.source : 'walk_in', admin: true });
    return { status: 201, body: orderDetail(id) };
  }, { admin: true });
  route('PATCH', '/api/admin/orders/(\\d+)', async ({ req, m }) => ({ status: 200, body: patchOrder(Number(m[1]), await readJson(req)) }), { admin: true });
  route('POST', '/api/admin/orders/(\\d+)/payments', async ({ req, m }) => {
    const b = await readJson(req);
    transaction(db, () => addPayment(Number(m[1]), b));
    return { status: 201, body: orderDetail(Number(m[1])) };
  }, { admin: true });
  route('DELETE', '/api/admin/payments/(\\d+)', async ({ m }) => {
    const p = db.prepare('SELECT p.*, o.code FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id = ?').get(Number(m[1]));
    if (!p) throw new HttpError(404, 'Payment not found.');
    db.prepare('DELETE FROM payments WHERE id = ?').run(p.id);
    audit('payment.delete', `${p.code} ₹${p.amount} ${p.method}`);
    return { status: 200, body: orderDetail(p.order_id) };
  }, { admin: true });

  route('GET', '/api/admin/expenses', async ({ url }) => {
    const { from, to } = rangeArgs(url.searchParams);
    const rows = db.prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC').all(from, to);
    return { status: 200, body: { from, to, total: rows.reduce((a, r) => a + r.amount, 0), expenses: rows } };
  }, { admin: true });
  route('POST', '/api/admin/expenses', async ({ req }) => {
    const b = await readJson(req);
    const date = L.isDate(b.date) ? b.date : L.istDate();
    if (date > L.addDays(L.istDate(), 1)) throw new HttpError(400, 'Expense date is in the future.');
    const category = L.EXPENSE_CATEGORIES.includes(b.category) ? b.category : 'Other';
    const method = ['cash', 'upi', 'bank'].includes(b.method) ? b.method : 'cash';
    const amount = L.cleanMoney(b.amount, { field: 'Expense' });
    const note = L.cleanStr(b.note, 160);
    const r = db.prepare('INSERT INTO expenses(date,category,amount,method,note,created_at) VALUES(?,?,?,?,?,?)').run(date, category, amount, method, note, Date.now());
    audit('expense.add', `${category} ₹${amount} ${method}`);
    return { status: 201, body: { id: Number(r.lastInsertRowid) } };
  }, { admin: true });
  route('DELETE', '/api/admin/expenses/(\\d+)', async ({ m }) => {
    const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(m[1]));
    if (!e) throw new HttpError(404, 'Expense not found.');
    db.prepare('DELETE FROM expenses WHERE id = ?').run(e.id);
    audit('expense.delete', `${e.category} ₹${e.amount}`);
    return { status: 200, body: { ok: true } };
  }, { admin: true });

  route('GET', '/api/admin/cashbook', async ({ url }) => ({ status: 200, body: cashbook(url.searchParams) }), { admin: true });
  route('POST', '/api/admin/cash-adjustments', async ({ req }) => {
    const b = await readJson(req);
    const kinds = { opening: 'in', float: 'in', deposit: 'out', withdrawal: 'out', other_in: 'in', other_out: 'out' };
    if (!(b.kind in kinds)) throw new HttpError(400, 'Choose a kind of cash movement.');
    const date = L.isDate(b.date) ? b.date : L.istDate();
    const amount = L.cleanMoney(b.amount, { field: 'Amount' });
    const direction = kinds[b.kind];
    if (direction === 'out' && amount > cashBalance({ throughDate: date })) throw new HttpError(400, 'That is more cash than the books show in the drawer.');
    db.prepare('INSERT INTO cash_adjustments(date,direction,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)').run(date, direction, b.kind.startsWith('other') ? 'other' : b.kind, amount, L.cleanStr(b.note, 160), Date.now());
    audit('cash.adjust', `${b.kind} ₹${amount}`);
    return { status: 201, body: { ok: true } };
  }, { admin: true });
  route('DELETE', '/api/admin/cash-adjustments/(\\d+)', async ({ m }) => {
    const a = db.prepare('SELECT * FROM cash_adjustments WHERE id = ?').get(Number(m[1]));
    if (!a) throw new HttpError(404, 'Entry not found.');
    db.prepare('DELETE FROM cash_adjustments WHERE id = ?').run(a.id);
    audit('cash.adjust.delete', `${a.kind} ₹${a.amount}`);
    return { status: 200, body: { ok: true } };
  }, { admin: true });
  route('GET', '/api/admin/day-closes', async () => ({ status: 200, body: { closes: db.prepare('SELECT * FROM day_closes ORDER BY date DESC LIMIT 60').all() } }), { admin: true });
  route('POST', '/api/admin/day-close', async ({ req }) => {
    const b = await readJson(req);
    const date = L.isDate(b.date) ? b.date : L.istDate();
    if (date > L.istDate()) throw new HttpError(400, 'You cannot close a future day.');
    const counted = L.cleanMoney(b.counted, { min: 0, field: 'Counted cash' });
    const out = transaction(db, () => {
      const expected = cashBalance({ throughDate: date });
      const difference = counted - expected;
      db.prepare(`INSERT INTO day_closes(date,expected,counted,difference,note,closed_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(date) DO UPDATE SET expected=excluded.expected, counted=excluded.counted, difference=excluded.difference, note=excluded.note, closed_at=excluded.closed_at`)
        .run(date, expected, counted, difference, L.cleanStr(b.note, 160), Date.now());
      if (b.fix && difference !== 0) {
        db.prepare('INSERT INTO cash_adjustments(date,direction,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)')
          .run(date, difference > 0 ? 'in' : 'out', 'count_fix', Math.abs(difference), `Day close ${date}`, Date.now());
      }
      audit('day.close', `${date} expected ₹${expected} counted ₹${counted}`);
      return { date, expected, counted, difference, fixed: !!(b.fix && difference !== 0) };
    });
    return { status: 201, body: out };
  }, { admin: true });

  route('GET', '/api/admin/customers', async () => ({ status: 200, body: { customers: customers() } }), { admin: true });
  route('GET', '/api/admin/settings', async () => ({ status: 200, body: getConfig(db) }), { admin: true });
  route('PUT', '/api/admin/settings', async ({ req }) => {
    const clean = validateSettings(await readJson(req));
    transaction(db, () => { for (const [k, v] of Object.entries(clean)) setSetting(db, k, v); });
    audit('settings.update', Object.keys(clean).join(','));
    return { status: 200, body: getConfig(db) };
  }, { admin: true });
  route('GET', '/api/admin/audit', async () => ({ status: 200, body: { log: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 80').all() } }), { admin: true });

  route('GET', '/api/admin/export/(orders|payments|expenses)\\.csv', async ({ url, m }) => {
    const { from, to, fromMs, toMs } = rangeArgs(url.searchParams, 31);
    let csv;
    if (m[1] === 'orders') {
      const rows = db.prepare(`SELECT * FROM (${ORDER_SELECT}) WHERE created_at >= ? AND created_at < ? ORDER BY created_at`).all(fromMs, toMs).map(shapeOrder);
      csv = L.toCsv(['Code', 'Date', 'Customer', 'Phone', 'Area', 'Items', 'Express', 'Status', 'Source', 'Subtotal', 'Express fee', 'Pickup fee', 'Discount', 'Total', 'Paid', 'Balance'],
        rows.map((o) => [o.code, L.istDate(o.created_at), o.name, o.phone, o.area, o.items.map((i) => `${i.name} ${i.qty}${i.unit === 'kg' ? 'kg' : 'pc'}`).join('; '), o.express ? 'Yes' : 'No', o.status, o.source, o.subtotal, o.express_fee, o.pickup_fee, o.discount, o.total, o.paid, o.balance]));
    } else if (m[1] === 'payments') {
      const rows = db.prepare('SELECT p.*, o.code, o.name FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.received_at >= ? AND p.received_at < ? ORDER BY p.received_at').all(fromMs, toMs);
      csv = L.toCsv(['Date', 'Order', 'Customer', 'Method', 'Amount', 'Note'], rows.map((p) => [L.istDate(p.received_at), p.code, p.name, p.method, p.amount, p.note]));
    } else {
      const rows = db.prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date').all(from, to);
      csv = L.toCsv(['Date', 'Category', 'Method', 'Amount', 'Note'], rows.map((e) => [e.date, e.category, e.method, e.amount, e.note]));
    }
    return { status: 200, raw: csv, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="wash-wala-${m[1]}-${from}_to_${to}.csv"` } };
  }, { admin: true });

  // ---------- static files ----------
  function serveStatic(req, res, urlPath) {
    let base = publicDir, rel = urlPath;
    if (urlPath === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
    if (urlPath.startsWith('/admin/')) { base = adminDir; rel = urlPath.slice(6); }
    if (rel.endsWith('/')) rel += 'index.html';
    let decoded;
    try { decoded = decodeURIComponent(rel); } catch { return send(res, 400, 'Bad path'); }
    const file = path.normalize(path.join(base, decoded));
    if (!file.startsWith(base + path.sep) || decoded.includes('\0')) return send(res, 403, 'Forbidden');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        if (!path.extname(decoded)) return serveStatic(req, res, urlPath.endsWith('/') ? '/404.html' : urlPath + '/');
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      const ext = path.extname(file).toLowerCase();
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
        'Cache-Control': ext === '.html' || base === adminDir ? 'no-cache' : 'public, max-age=3600',
      };
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (trustProxy) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    try {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      if (p.startsWith('/admin')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (!p.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed');
        return serveStatic(req, res, p);
      }
      const ip = clientIp(req);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(p);
        if (!m) continue;
        if (r.admin) {
          if (!isAuthed(req)) throw new HttpError(401, 'Please sign in.');
          if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'ww') throw new HttpError(403, 'Blocked request.');
        }
        const out = await r.handler({ req, res, url, m, ip });
        if (out.raw !== undefined) return send(res, out.status, out.raw, out.headers);
        return send(res, out.status, out.body);
      }
      throw new HttpError(404, 'Not found.');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e && /UNIQUE constraint/.test(e.message)) return send(res, 409, { error: 'That already exists. Try again.' });
      console.error(e);
      return send(res, 500, { error: 'Something went wrong on our side.' });
    }
  });

  return { server, db, generatedPassword, sessions };
}

module.exports = { createApp };
