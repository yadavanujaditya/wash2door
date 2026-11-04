# Wash Wala

Laundry pickup and delivery in Rishikesh. A public website with online booking and order tracking, plus an admin panel for orders, sales and cash.

No npm packages to install. It needs **Node 22.5 or newer** (it uses the built-in `node:sqlite`).

## Run it

```bash
npm start            # http://localhost:3000   admin at /admin/
```

On the first run an admin password is generated and printed once in the terminal. To choose your own, set `ADMIN_PASSWORD` (8+ characters) before the first run. You can change it later in Admin > Settings.

```bash
npm run seed         # optional: fill an empty database with DEMO orders, payments and expenses
npm test             # API tests (pricing, bookings, payments, cash book, day close)
```

Copy `.env.example` for the other options (`PORT`, `DB_PATH`, `TRUST_PROXY`).

## What is in it

**Public site** (`public/`)
- Animated Rishikesh scene, scroll-drawn "how it works", English and Hindi.
- Live price estimate that reads prices from the admin settings.
- Booking form that saves the order and gives the customer a code, with a WhatsApp hand-off.
- Order tracker (code plus last 4 digits of the phone).
- Area finder, FAQ, partner section for stays and camps. A reviews block appears only when `public/reviews.json` has real reviews: `[{"name":"…","where":"…","text":"…"}]`.

**Admin** (`admin/`, sign in at `/admin/`)
- Dashboard: cash in drawer, today, sales vs collected vs expenses chart, payment mix, order pipeline, top services and areas.
- Orders: filter and search, status workflow, record or remove payments, edit, cancel, WhatsApp message templates, walk-in orders.
- Cash book: running balance of cash in and out, manual movements (opening balance, bank deposit, withdrawal), end of day close with shortage tracking.
- Expenses, customers, profit and loss report, CSV exports, activity log.
- Settings: services and prices, express, minimum order, pickup fee, slots, areas, business details, password.

## Money rules
- Prices are always calculated on the server from Settings. The browser cannot set a price.
- Amounts are whole rupees. Payments cannot exceed the balance. An order with payments cannot be cancelled until the payment is removed.
- Cash in hand = cash payments − cash expenses + cash movements. Day close compares a physical count with this number.
- Dates and "today" use India time (IST).

## Before you launch
1. **Replace the placeholder prices** in Admin > Settings. The defaults are examples only.
2. Confirm the **service areas**, hours and the WhatsApp number.
3. Check the website copy against how you actually work (for example, "each customer's clothes are washed as their own batch").
4. Add real photos and genuine reviews when you have them.

## Deploying
This is a Node server with a SQLite file, so it needs a host that runs Node and keeps a disk (Render, Railway, Fly.io, a VPS). Static hosts like Netlify or Vercel will not run the booking or admin.
- Point `DB_PATH` at a persistent disk (the Dockerfile uses `/data`) and back that file up.
- Put it behind HTTPS and set `TRUST_PROXY=1` so cookies are marked Secure and rate limits see the real client IP.
- Sessions are held in memory, so a restart signs the admin out.

## Security notes
Password hashed with scrypt, HttpOnly SameSite=Strict session cookie, login and booking rate limits, server-side validation, CSP and security headers, CSV export guarded against formula injection. Online payments are not built in: customers pay on delivery and staff record it.
