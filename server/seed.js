'use strict';
// Fills the database with realistic DEMO data so the admin dashboard has something to show.
// Run: npm run seed   (refuses to run if orders already exist, unless SEED_FORCE=1)
const path = require('node:path');
const { createApp } = require('./app');
const L = require('./lib');

const { db } = createApp({ dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'washwala.db') });
if (db.prepare('SELECT COUNT(*) AS n FROM orders').get().n > 0 && process.env.SEED_FORCE !== '1') {
  console.log('Orders already exist. Set SEED_FORCE=1 to add demo data anyway.');
  process.exit(0);
}
let s = 7;
const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const names = ['Aarav Sharma', 'Meera Joshi', 'Liam Carter', 'Sofia Rossi', 'Rohit Negi', 'Anita Rawat', 'Tobias Meyer', 'Kavya Nair', 'Yuki Tanaka', 'Deepak Bisht', 'Priya Singh', 'Noah Evans', 'Sunita Devi', 'Karan Thakur', 'Ella Brown'];
const areas = ['Tapovan', 'Laxman Jhula', 'Ram Jhula', 'Swarg Ashram', 'Muni Ki Reti', 'AIIMS Road', 'Virbhadra'];
const services = [['wash_fold', 'kg', 2, 9], ['wash_iron', 'kg', 2, 8], ['premium_care', 'kg', 1, 4], ['dry_clean', 'piece', 1, 5], ['bedding', 'piece', 1, 2]];
const cfg = require('./db').getConfig(db);
const flow = ['new', 'confirmed', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'];
const now = Date.now();
const insOrder = db.prepare(`INSERT INTO orders(code,name,phone,address,area,items,express,slot,pickup_date,notes,status,source,subtotal,express_fee,pickup_fee,discount,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insEv = db.prepare('INSERT INTO order_events(order_id,status,note,at) VALUES(?,?,?,?)');
const insPay = db.prepare('INSERT INTO payments(order_id,amount,method,note,received_at) VALUES(?,?,?,?,?)');
db.exec('BEGIN');
const seq = {};
for (let d = 30; d >= 0; d--) {
  const n = 2 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const at = now - d * 86400000 - Math.floor(rnd() * 8 * 3600000);
    const day = L.istDate(at);
    seq[day] = (seq[day] || 0) + 1;
    const code = `WW-${day.slice(2).replace(/-/g, '')}-${String(seq[day]).padStart(3, '0')}`;
    const picks = [];
    const k = 1 + Math.floor(rnd() * 2);
    const chosen = new Set();
    while (picks.length < k) {
      const [id, unit, lo, hi] = pick(services);
      if (chosen.has(id)) continue; chosen.add(id);
      picks.push({ service: id, qty: unit === 'kg' ? Math.round((lo + rnd() * (hi - lo)) * 2) / 2 : Math.ceil(lo + rnd() * (hi - lo)) });
    }
    const express = rnd() < 0.2;
    const p = L.priceOrder(cfg, picks, { express });
    const name = pick(names);
    const phone = '9' + String(Math.floor(100000000 + (names.indexOf(name) + 1) * 51731234 % 899999999)).padStart(9, '0');
    const ageDays = d;
    const stage = ageDays >= 3 ? 6 : Math.min(6, Math.max(0, 6 - Math.floor(rnd() * 5)));
    const status = rnd() < 0.04 && ageDays > 2 ? 'cancelled' : flow[ageDays === 0 ? Math.floor(rnd() * 4) : stage];
    const source = pick(['website', 'website', 'whatsapp', 'walk_in']);
    const r = insOrder.run(code, name, phone, `${pick(['Near', 'Behind', 'Opp.'])} ${pick(['Ganga Ghat', 'German Bakery', 'Parmarth Niketan', 'Zostel', 'Bridge Gate'])}, ${pick(areas)}`, pick(areas), JSON.stringify(p.items), express ? 1 : 0, pick(cfg.slots), day, '', status, source, p.subtotal, p.expressFee, p.pickupFee, 0, p.total, at, at);
    const id = Number(r.lastInsertRowid);
    const upto = status === 'cancelled' ? 0 : flow.indexOf(status);
    for (let j = 0; j <= upto; j++) insEv.run(id, flow[j], '', at + j * 5400000);
    if (status === 'cancelled') insEv.run(id, 'cancelled', 'Customer cancelled', at + 3600000);
    if (status === 'delivered') {
      const method = pick(['cash', 'upi', 'upi', 'cash']);
      if (rnd() < 0.12) { insPay.run(id, Math.round(p.total / 2), method, 'Advance', at + 7200000); }
      else insPay.run(id, p.total, method, '', at + 6 * 5400000);
    } else if (status !== 'cancelled' && flow.indexOf(status) >= 3 && rnd() < 0.3) insPay.run(id, Math.round(p.total / 2), 'upi', 'Advance', at + 7200000);
  }
}
const insExp = db.prepare('INSERT INTO expenses(date,category,amount,method,note,created_at) VALUES(?,?,?,?,?,?)');
for (let d = 30; d >= 0; d--) {
  const day = L.istDate(now - d * 86400000);
  if (d % 3 === 0) insExp.run(day, 'Fuel', 200 + Math.floor(rnd() * 150), 'cash', 'Scooter petrol', now - d * 86400000);
  if (d % 7 === 0) insExp.run(day, 'Detergent & chemicals', 900 + Math.floor(rnd() * 600), 'upi', 'Bulk detergent', now - d * 86400000);
  if (d % 10 === 4) insExp.run(day, 'Packaging', 350, 'cash', 'Bags and tags', now - d * 86400000);
}
insExp.run(L.istDate(now - 29 * 86400000), 'Rent', 6000, 'bank', 'Shop rent', now - 29 * 86400000);
insExp.run(L.istDate(now - 27 * 86400000), 'Rider & staff wages', 7500, 'cash', 'Rider salary', now - 27 * 86400000);
db.prepare("INSERT INTO cash_adjustments(date,direction,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)").run(L.istDate(now - 31 * 86400000), 'in', 'opening', 3000, 'Opening float', now - 31 * 86400000);
db.prepare("INSERT INTO cash_adjustments(date,direction,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)").run(L.istDate(now - 12 * 86400000), 'out', 'deposit', 5000, 'Deposited to bank', now - 12 * 86400000);
db.exec('COMMIT');
console.log('Demo data added. This is sample data, delete data/washwala.db to start clean.');
