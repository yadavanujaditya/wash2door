'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_SETTINGS = {
  business: {
    name: 'Wash Wala',
    whatsapp: '916388871965',
    phone: '+91 63888 71965',
    address: 'Rishikesh, Uttarakhand',
    hours: '8 am to 8 pm, every day',
  },
  // Prices are placeholders. Change them in Admin > Settings before launch.
  services: [
    { id: 'wash_fold', name: 'Wash & Fold', unit: 'kg', rate: 60, tat: '24 to 48 hours', desc: 'Everyday clothes, machine washed, tumble dried, folded.' },
    { id: 'wash_iron', name: 'Wash & Iron', unit: 'kg', rate: 85, tat: '24 to 48 hours', desc: 'Washed, steam pressed and hung or folded.' },
    { id: 'premium_care', name: 'Premium Care', unit: 'kg', rate: 140, tat: '48 hours', desc: 'Delicates, woollens and silks, hand finished with gentle detergent.' },
    { id: 'dry_clean', name: 'Dry Clean', unit: 'piece', rate: 160, tat: '48 to 72 hours', desc: 'Suits, sarees, jackets, lehengas. Priced per piece.' },
    { id: 'bedding', name: 'Blankets & Bedding', unit: 'piece', rate: 260, tat: '72 hours', desc: 'Blankets, quilts, comforters, curtains. Priced per piece.' },
  ],
  expressPct: 30,
  minOrder: 150,
  freePickupAbove: 300,
  pickupFee: 30,
  slots: ['8 to 11 am', '11 am to 2 pm', '2 to 5 pm', '5 to 8 pm'],
  areas: [
    'Tapovan', 'Laxman Jhula', 'Ram Jhula', 'Swarg Ashram', 'Muni Ki Reti',
    'Dehradun Road (Shivaji Nagar)', 'AIIMS Road', 'Virbhadra', 'Other (tell us)',
  ],
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  express INTEGER NOT NULL DEFAULT 0,
  slot TEXT NOT NULL DEFAULT '',
  pickup_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'website',
  subtotal INTEGER NOT NULL,
  express_fee INTEGER NOT NULL DEFAULT 0,
  pickup_fee INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','upi','card')),
  note TEXT NOT NULL DEFAULT '',
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_at ON payments(received_at);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','upi','bank')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- Manual cash movements: opening balance, bank deposits, owner withdrawals, float top ups.
CREATE TABLE IF NOT EXISTS cash_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  kind TEXT NOT NULL DEFAULT 'other',
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cashadj_date ON cash_adjustments(date);

-- End of day cash count compared with what the books say should be in the drawer.
CREATE TABLE IF NOT EXISTS day_closes (
  date TEXT PRIMARY KEY,
  expected INTEGER NOT NULL,
  counted INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  closed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

function getSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(value));
}

function getConfig(db) {
  const cfg = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) cfg[key] = getSetting(db, key, DEFAULT_SETTINGS[key]);
  return cfg;
}

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { openDb, getSetting, setSetting, getConfig, transaction, DEFAULT_SETTINGS };
