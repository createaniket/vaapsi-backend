# Vaapsi Platform — Backend (Phase 1)

Pure **JavaScript** (CommonJS) backend on **Node.js + Express + PostgreSQL**.
No TypeScript, no build step, no Docker, no ORM — just `node src/server.js`.

Covers: authentication, Digital Product Passport (DPP), pre-loved marketplace,
loyalty programme (earn + gated redemption + pooling), notifications,
customer service ticketing, and admin.

---

## Requirements

- Node.js 18+ (tested on 22)
- PostgreSQL 14+ running locally (or any reachable Postgres)

That's it.

---

## Setup (5 commands)

```bash
# 1. Create the database (once)
createdb vaapsi
#    …or: psql -c "CREATE DATABASE vaapsi;"

# 2. Configure
cp .env.example .env         # edit DATABASE_URL if your credentials differ

# 3. Install
npm install

# 4. Create tables + demo data
npm run setup                # = npm run migrate && npm run seed

# 5. Run
npm run dev                  # http://localhost:4000
```

Health check: `curl http://localhost:4000/health`

### Seeded logins — password `Password@123`

| Email | Role | Notes |
|---|---|---|
| `admin@vaapsi.com` | ADMIN | analytics, user management, moderation |
| `agent@vaapsi.com` | SUPPORT_AGENT | ticket queue, grant loyalty points |
| `customer@vaapsi.com` | CUSTOMER | starts with 150 points (redemption unlocked) |

The seed also creates a brand-new product, a pre-loved product in the same
category (so cross-listing returns a result), an active listing, and DPPs with
real scannable QR codes.

---

## Scripts

```bash
npm run dev       # nodemon, auto-restart on change
npm start         # plain node
npm run migrate   # apply src/db/schema.sql (idempotent — safe to re-run)
npm run seed      # demo users, products, listing, DPPs, loyalty history
npm run setup     # migrate + seed
node e2e.js       # full end-to-end test against a running server
```

---

## Project structure

```
src/
  config/         env.js (zod-validated), logger.js
  db/
    index.js      pg pool, query/one/transaction helpers, newId()
    schema.sql    full DDL — 19 tables, 14 enum types
    migrate.js    applies schema.sql
    seed.js       demo data
  middleware/     auth (JWT + role guard), validate, errorHandler, rateLimit
  utils/          jwt, crypto (argon2 + sha256 + OTP), errors, http, pagination
  modules/
    auth/  users/  dpp/  products/  marketplace/
    loyalty/  cart/  notifications/  support/  admin/
  app.js          express assembly
  server.js       bootstrap + graceful shutdown
e2e.js            104-check end-to-end suite
verify-postman.js checks every Postman endpoint resolves
Vaapsi_Phase1.postman_collection.json
Vaapsi_Phase1.postman_environment.json
```

Each module has `*.service.js` (logic + SQL), `*.controller.js`, `*.routes.js`,
`*.schema.js` (Zod validation).

### Database layer

No ORM. `src/db/index.js` gives you:

```js
const db = require('./db');

await db.query('SELECT * FROM users WHERE role = $1', ['ADMIN']);  // { rows, rowCount }
await db.one('SELECT * FROM users WHERE id = $1', [id]);           // first row or null
await db.transaction(async (client) => {                            // BEGIN/COMMIT/ROLLBACK
  await db.query('UPDATE ...', [x], client);                        // pass client to join txn
});
```

Columns are `snake_case` in Postgres and come back **camelCase** automatically,
so API responses look the same as they would from an ORM. `NUMERIC` and
`COUNT()` are parsed to real JS numbers, not strings.

---

## Phase-1 business rules implemented

**Authentication** — email + password, and phone OTP (request → verify, creates
the account if the number is new). Rotating refresh tokens: using an old refresh
token fails. Only SHA-256 hashes of OTPs and refresh tokens are stored; passwords
use Argon2. OTP goes out via a third-party SMS gateway (client account, billed at
actuals). In non-production the OTP is returned as `devCode` for easy testing.

**DPP** — static QR (real PNG data-URL) per product, passport data maintained
manually, and **ownership transferred on purchase** with a full transfer audit
trail. Live ERP-driven updates are out of Phase-1 scope by design.

**Marketplace** — pre-loved listings, seller-only withdraw, and an **adjustable
shipping date**. Cross-listing: `GET /products/:id/similar-preloved` surfaces
similar pre-loved items on a brand-new product page.

**Loyalty** — ₹1 = 1 point on purchases; ~5% on repair (one reward per product);
up to 2% on end-of-life returns; any-brand textile returns granted by staff.
Redemption is **gated at 100 lifetime points** and the **external-partner bucket
is capped at 30%** of all points redeemed (70% Vaapsi). Wallet rows are locked
`FOR UPDATE` during redemption so concurrent requests can't double-spend.
Approval-based **family/friend pooling** and **donation** are supported.

**Checkout** — payment is captured **immediately**, including for delayed
purchases (shipping deferred, standard 30-day window). One transaction creates
the order, marks listings SOLD, transfers each DPP to the buyer, and clears the
cart — any failure rolls all of it back. Points are then redeemed and earned on
the amount actually paid.

**Support** — tickets with customer/agent/admin views, assignment, escalation,
status workflow, and **internal notes that customers never see**.

**Admin** — analytics, user management (status/role), listing moderation, DPP
audit trail, and an audit log of privileged actions.

> Hosting and third-party usage (SMS/WhatsApp/OTP, DPP provider, future AI/pricing
> APIs) run on the client's own accounts and are billed at actuals.

---

## API

Base path: `/api/v1`

| Group | Endpoints |
|---|---|
| auth | `register`, `login`, `otp/request`, `otp/verify`, `refresh`, `logout`, `me` |
| users | `me` (GET/PATCH), `me/notification-preferences` (GET/PATCH) |
| dpp | `serial/:serial` (public), `product/:id` (GET/PATCH), `POST /`, `product/:id/end-of-life` |
| products | `GET /`, `GET /:id`, `GET /:id/similar-preloved`, `POST /` |
| listings | `GET /`, `GET /:id`, `POST /`, `:id/withdraw`, `:id/shipping-date` |
| loyalty | `wallet`, `redeem`, `donate`, `pool/balance`, `pool/request`, `pool/respond`, `earn/any-brand` |
| cart | `GET /`, `items`, `items/:listingId`, `checkout`, `orders`, `orders/:id` |
| support | `tickets` (+ `mine`, `:id/reply`, `queue`, `:id/assign`, `:id/escalate`, `:id/status`) |
| admin | `analytics`, `users`, `users/:id/status`, `users/:id/role`, `listings/:id/moderate`, `dpp/:id/audit`, `audit-logs` |

**Postman:** import `Vaapsi_Phase1.postman_collection.json` and
`Vaapsi_Phase1.postman_environment.json`. Run **Auth → Login (customer)** first —
tokens and IDs auto-save and chain through the rest of the requests.

Response shape:

```jsonc
{ "success": true, "data": { ... } }
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 3, "pages": 1 } }
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "...", "details": { ... } } }
```

---

## Testing

`node e2e.js` runs 104 checks against a running server — auth flows, OTP,
token rotation, cross-listing, loyalty gating and the 70/30 split, checkout
maths, DPP transfer, RBAC (403s), internal-note visibility, admin actions, and
error handling. All 104 pass on a fresh `npm run setup`.

`node verify-postman.js` confirms all 57 Postman endpoints resolve to real routes.

---

## What's stubbed (deliberately)

| Area | Current | To go live |
|---|---|---|
| Notification delivery | logs the payload | drop in Twilio / MSG91 / SES / FCM in `modules/notifications/notification.service.js` |
| DPP QR | generated locally as PNG data-URL | call the external DPP provider in `modules/dpp/dpp.service.js` |
| Payments | order marked PAID at checkout | integrate Razorpay/Stripe in `modules/cart/cart.service.js` before setting PAID |

Each has a single clear seam — callers don't change.

---

## Production notes

- Set strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (32+ chars each).
- Run `npm run migrate` on deploy; it's idempotent.
- The app is stateless — run several instances behind a load balancer.
- Rate limiting is on by default (300 req/15min global, 20/15min on auth) and
  automatically disabled when `NODE_ENV=test`.
- `helmet`, `cors`, and `compression` are enabled; set `CORS_ORIGINS` to your
  real front-end origins instead of `*`.
