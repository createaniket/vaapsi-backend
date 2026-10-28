// Seeds demo data. Safe to re-run — clears seeded rows first.
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');
const argon2 = require('argon2');
const db = require('./index');
const { pool } = require('./index');

async function makeUser(email, fullName, role, passwordHash) {
  const user = await db.one(
    `INSERT INTO users (id, email, password_hash, full_name, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING *`,
    [db.newId(), email, passwordHash, fullName, role],
  );
  await db.query(
    `INSERT INTO loyalty_wallets (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [db.newId(), user.id],
  );
  await db.query(
    `INSERT INTO notification_preferences (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [db.newId(), user.id],
  );
  return user;
}

async function makeDpp(productId, material, origin) {
  const serialNumber = `VAAPSI-${nanoid(12).toUpperCase()}`;
  const qrPayload = `https://dpp.vaapsi.com/p/${serialNumber}`;
  const qrCodeUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });
  return db.one(
    `INSERT INTO dpps (id, product_id, serial_number, qr_code_url, qr_payload,
                       material, origin_country, external_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'external-dpp-provider') RETURNING *`,
    [db.newId(), productId, serialNumber, qrCodeUrl, qrPayload, material, origin],
  );
}

async function seed() {
  const passwordHash = await argon2.hash('Password@123');

  const admin = await makeUser('admin@vaapsi.com', 'Vaapsi Admin', 'ADMIN', passwordHash);
  const agent = await makeUser('agent@vaapsi.com', 'Support Agent', 'SUPPORT_AGENT', passwordHash);
  const customer = await makeUser('customer@vaapsi.com', 'Test Customer', 'CUSTOMER', passwordHash);

  // Avoid duplicating demo products on re-run.
  await db.query(`DELETE FROM products WHERE title IN ($1, $2)`, [
    'Everyday Canvas Backpack',
    'Pre-loved Canvas Backpack',
  ]);

  // Brand-new product (owned by Vaapsi/admin)
  const backpack = await db.one(
    `INSERT INTO products (id, title, brand, category, description, base_price, condition, is_pre_loved, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'NEW', FALSE, $7) RETURNING *`,
    [db.newId(), 'Everyday Canvas Backpack', 'Vaapsi Basics', 'Bags',
     'Durable 20L canvas backpack.', 2499, admin.id],
  );
  await makeDpp(backpack.id, 'Recycled canvas', 'India');

  // Pre-loved product in the same category → powers cross-listing
  const preLoved = await db.one(
    `INSERT INTO products (id, title, brand, category, description, base_price, condition, is_pre_loved, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'GOOD', TRUE, $7) RETURNING *`,
    [db.newId(), 'Pre-loved Canvas Backpack', 'Vaapsi Basics', 'Bags',
     'Gently used, great condition.', 1299, customer.id],
  );
  const dpp2 = await makeDpp(preLoved.id, 'Recycled canvas', 'India');

  const listing = await db.one(
    `INSERT INTO listings (id, product_id, seller_id, price, delay_days, status)
     VALUES ($1, $2, $3, $4, 30, 'ACTIVE') RETURNING *`,
    [db.newId(), preLoved.id, customer.id, 1299],
  );

  // Give the test customer 150 points so redemption (gated at 100) is unlocked.
  const wallet = await db.one('SELECT * FROM loyalty_wallets WHERE user_id = $1', [customer.id]);
  await db.query('DELETE FROM loyalty_transactions WHERE wallet_id = $1 AND reason = $2',
    [wallet.id, 'Seed earn']);
  await db.query(
    `INSERT INTO loyalty_transactions (id, wallet_id, type, points, reason)
     VALUES ($1, $2, 'EARN_PURCHASE', 150, 'Seed earn')`,
    [db.newId(), wallet.id],
  );
  await db.query(
    'UPDATE loyalty_wallets SET points_balance = 150, lifetime_earned = 150, lifetime_redeemed = 0 WHERE id = $1',
    [wallet.id],
  );

  // eslint-disable-next-line no-console
  console.log('✅ Seed complete');
  // eslint-disable-next-line no-console
  console.log({
    users: [admin.email, agent.email, customer.email],
    password: 'Password@123',
    newProductId: backpack.id,
    preLovedProductId: preLoved.id,
    listingId: listing.id,
    dppSerial: dpp2.serialNumber,
    customerPoints: 150,
  });

  await pool.end();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
