'use strict';
const crypto = require('node:crypto');

const IST_MS = 330 * 60000;
const STATUSES = ['new', 'confirmed', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
const STATUS_LABEL = {
  new: 'Received', confirmed: 'Confirmed', picked_up: 'Picked up', processing: 'Washing',
  ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
};
const EXPENSE_CATEGORIES = [
  'Detergent & chemicals', 'Fuel', 'Rider & staff wages', 'Rent', 'Electricity & water',
  'Packaging', 'Machine upkeep', 'Marketing', 'Other',
];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const istDate = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const dayStartMs = (dateStr) => Date.parse(dateStr + 'T00:00:00Z') - IST_MS;
const addDays = (dateStr, n) => new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

function cleanStr(v, max, { required = false, field = 'Field' } = {}) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : '';
  if (required && !s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`);
  return s;
}

function cleanPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) throw new HttpError(400, 'Enter a valid 10 digit mobile number.');
  return d;
}

function cleanMoney(v, { min = 1, max = 500000, field = 'Amount' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number of rupees.`);
  if (n < min || n > max) throw new HttpError(400, `${field} must be between ₹${min} and ₹${max}.`);
  return n;
}

/**
 * Prices an order on the server so the browser can never set its own price.
 * items: [{ service, qty }]; discount is an admin only rupee amount.
 */
function priceOrder(cfg, rawItems, { express = false, discount = 0 } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(400, 'Add at least one item.');
  if (rawItems.length > 12) throw new HttpError(400, 'Too many lines in one order.');
  const byId = new Map(cfg.services.map((s) => [s.id, s]));
  const items = [];
  const seen = new Set();
  for (const it of rawItems) {
    const svc = byId.get(it && it.service);
    if (!svc) throw new HttpError(400, 'Unknown service selected.');
    if (seen.has(svc.id)) throw new HttpError(400, `${svc.name} is added twice. Combine the quantity.`);
    seen.add(svc.id);
    const qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, `Enter a quantity for ${svc.name}.`);
    if (svc.unit === 'kg') {
      if (qty < 0.5 || qty > 60 || Math.round(qty * 2) !== qty * 2) throw new HttpError(400, `${svc.name} weight must be 0.5 to 60 kg, in steps of 0.5.`);
    } else if (!Number.isInteger(qty) || qty > 60) {
      throw new HttpError(400, `${svc.name} pieces must be a whole number up to 60.`);
    }
    items.push({ service: svc.id, name: svc.name, unit: svc.unit, qty, rate: svc.rate, amount: Math.round(qty * svc.rate) });
  }
  let subtotal = items.reduce((a, i) => a + i.amount, 0);
  const minTopUp = subtotal < cfg.minOrder ? cfg.minOrder - subtotal : 0;
  subtotal += minTopUp;
  const expressFee = express ? Math.round((subtotal * cfg.expressPct) / 100) : 0;
  const pickupFee = subtotal + expressFee >= cfg.freePickupAbove ? 0 : cfg.pickupFee;
  const disc = Math.max(0, Math.min(Number(discount) || 0, subtotal + expressFee + pickupFee));
  const total = subtotal + expressFee + pickupFee - disc;
  return { items, subtotal, minTopUp, expressFee, pickupFee, discount: disc, total };
}

// Passwords: scrypt with a per-password salt.
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

// Sliding window limiter held in memory. Good enough for one small server.
function makeLimiter() {
  const hits = new Map();
  return function hit(key, limit, windowMs) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) { hits.set(key, arr); return false; }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stops spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

module.exports = {
  IST_MS, STATUSES, STATUS_LABEL, EXPENSE_CATEGORIES, HttpError,
  istDate, isDate, dayStartMs, addDays, cleanStr, cleanPhone, cleanMoney,
  priceOrder, hashPassword, verifyPassword, makeLimiter, toCsv,
};
