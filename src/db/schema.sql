-- Vaapsi Platform — Phase 1 schema (PostgreSQL)
-- Covers: users/auth, DPP, products, marketplace/resell, loyalty (earn+redeem),
-- cart, orders, notifications, customer-service tickets, admin/audit.

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('CUSTOMER', 'SUPPORT_AGENT', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE otp_purpose AS ENUM ('LOGIN', 'PHONE_VERIFY', 'PASSWORD_RESET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_condition AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'END_OF_LIFE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dpp_status AS ENUM ('ACTIVE', 'TRANSFERRED', 'END_OF_LIFE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('DRAFT', 'ACTIVE', 'SOLD', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE loyalty_txn_type AS ENUM (
    'EARN_PURCHASE', 'EARN_REPAIR', 'EARN_RETURN_EOL', 'EARN_RETURN_ANY_BRAND',
    'REDEEM', 'DONATE', 'POOL_IN', 'POOL_OUT', 'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE redeem_bucket AS ENUM ('VAAPSI', 'EXTERNAL_PARTNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pool_link_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('QUEUED', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- USERS & AUTH
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE,
  phone           TEXT UNIQUE,
  password_hash   TEXT,
  full_name       TEXT,
  role            user_role   NOT NULL DEFAULT 'CUSTOMER',
  status          user_status NOT NULL DEFAULT 'ACTIVE',
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  phone_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  marketing_opt_in BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  purpose     otp_purpose NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose ON otp_codes(phone, purpose);

-- ---------------------------------------------------------------------------
-- PRODUCTS & DPP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  brand        TEXT,
  category     TEXT NOT NULL,
  description  TEXT,
  image_urls   TEXT[] NOT NULL DEFAULT '{}',
  is_pre_loved BOOLEAN NOT NULL DEFAULT FALSE,
  condition    product_condition NOT NULL DEFAULT 'NEW',
  base_price   NUMERIC(12,2) NOT NULL,
  owner_id     TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_preloved ON products(is_pre_loved);

-- Static QR-code DPP from an external provider, manually updated at listing,
-- transferred on ownership change. Live ERP updates are out of Phase-1 scope.
CREATE TABLE IF NOT EXISTS dpps (
  id                TEXT PRIMARY KEY,
  product_id        TEXT NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  serial_number     TEXT NOT NULL UNIQUE,
  qr_code_url       TEXT NOT NULL,
  qr_payload        TEXT NOT NULL,
  status            dpp_status NOT NULL DEFAULT 'ACTIVE',
  material          TEXT,
  origin_country    TEXT,
  manufacture_date  TIMESTAMPTZ,
  care_instructions TEXT,
  external_provider TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dpp_status ON dpps(status);

CREATE TABLE IF NOT EXISTS dpp_transfers (
  id           TEXT PRIMARY KEY,
  dpp_id       TEXT NOT NULL REFERENCES dpps(id) ON DELETE CASCADE,
  from_user_id TEXT,
  to_user_id   TEXT NOT NULL,
  order_id     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dpp_transfers_dpp ON dpp_transfers(dpp_id);

-- ---------------------------------------------------------------------------
-- MARKETPLACE LISTINGS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id     TEXT NOT NULL REFERENCES users(id),
  price         NUMERIC(12,2) NOT NULL,
  status        listing_status NOT NULL DEFAULT 'ACTIVE',
  shipping_date TIMESTAMPTZ,
  delay_days    INTEGER NOT NULL DEFAULT 30,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);

-- ---------------------------------------------------------------------------
-- CART & ORDERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         TEXT PRIMARY KEY,
  cart_id    TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  is_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, listing_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  buyer_id        TEXT NOT NULL REFERENCES users(id),
  status          order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  subtotal        NUMERIC(12,2) NOT NULL,
  points_redeemed INTEGER NOT NULL DEFAULT 0,
  points_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  is_delayed      BOOLEAN NOT NULL DEFAULT FALSE,
  shipping_date   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  price      NUMERIC(12,2) NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------------
-- LOYALTY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_wallets (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  points_balance    INTEGER NOT NULL DEFAULT 0,
  lifetime_earned   INTEGER NOT NULL DEFAULT 0,
  lifetime_redeemed INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id         TEXT PRIMARY KEY,
  wallet_id  TEXT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE CASCADE,
  type       loyalty_txn_type NOT NULL,
  points     INTEGER NOT NULL,
  bucket     redeem_bucket,
  reason     TEXT,
  order_id   TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_wallet ON loyalty_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_type ON loyalty_transactions(type);

-- Approval-based pooling: owner adds registered family/friends' points.
CREATE TABLE IF NOT EXISTS point_pool_links (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     pool_link_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, member_id)
);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel    notification_channel NOT NULL,
  template   TEXT NOT NULL,
  payload    JSONB,
  status     notification_status NOT NULL DEFAULT 'QUEUED',
  error      TEXT,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email      BOOLEAN NOT NULL DEFAULT TRUE,
  sms        BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp   BOOLEAN NOT NULL DEFAULT TRUE,
  push       BOOLEAN NOT NULL DEFAULT TRUE,
  marketing  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CUSTOMER SERVICE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  status      ticket_status NOT NULL DEFAULT 'OPEN',
  priority    ticket_priority NOT NULL DEFAULT 'MEDIUM',
  customer_id TEXT NOT NULL REFERENCES users(id),
  agent_id    TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(agent_id);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  internal   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- ---------------------------------------------------------------------------
-- ADMIN / AUDIT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
