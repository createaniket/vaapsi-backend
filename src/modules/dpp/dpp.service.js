const QRCode = require('qrcode');
const { nanoid } = require('nanoid');
const db = require('../../db');
const { NotFoundError, ConflictError } = require('../../utils/errors');

/**
 * Digital Product Passport (DPP) — Phase 1 scope:
 *  - Static QR code (external provider reference), rendered at creation.
 *  - Passport data maintained manually (updated at listing time).
 *  - Transferred on ownership change, with an audit trail.
 *  - Live ERP-driven updates are explicitly out of Phase-1 scope.
 */
const dppService = {
  async create(input) {
    const product = await db.one('SELECT id FROM products WHERE id = $1', [input.productId]);
    if (!product) throw new NotFoundError('Product not found');

    const existing = await db.one('SELECT id FROM dpps WHERE product_id = $1', [input.productId]);
    if (existing) throw new ConflictError('DPP already exists for this product');

    const serialNumber = `VAAPSI-${nanoid(12).toUpperCase()}`;
    const qrPayload = `https://dpp.vaapsi.com/p/${serialNumber}`;
    const qrCodeUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 });

    return db.one(
      `INSERT INTO dpps (id, product_id, serial_number, qr_code_url, qr_payload,
                         material, origin_country, manufacture_date, care_instructions, external_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        db.newId(), input.productId, serialNumber, qrCodeUrl, qrPayload,
        input.material || null, input.originCountry || null, input.manufactureDate || null,
        input.careInstructions || null, input.externalProvider || 'external-dpp-provider',
      ],
    );
  },

  async getBySerial(serialNumber) {
    const dpp = await db.one('SELECT * FROM dpps WHERE serial_number = $1', [serialNumber]);
    if (!dpp) throw new NotFoundError('DPP not found');
    const product = await db.one('SELECT * FROM products WHERE id = $1', [dpp.productId]);
    const { rows: transfers } = await db.query(
      'SELECT * FROM dpp_transfers WHERE dpp_id = $1 ORDER BY created_at DESC',
      [dpp.id],
    );
    return { ...dpp, product, transfers };
  },

  async getByProduct(productId) {
    const dpp = await db.one('SELECT * FROM dpps WHERE product_id = $1', [productId]);
    if (!dpp) throw new NotFoundError('DPP not found');
    const { rows: transfers } = await db.query(
      'SELECT * FROM dpp_transfers WHERE dpp_id = $1 ORDER BY created_at ASC',
      [dpp.id],
    );
    return { ...dpp, transfers };
  },

  // Manual passport update (Phase 1: no live ERP feed).
  async update(productId, data) {
    await this.getByProduct(productId);
    return db.one(
      `UPDATE dpps SET
         material = COALESCE($2, material),
         origin_country = COALESCE($3, origin_country),
         manufacture_date = COALESCE($4, manufacture_date),
         care_instructions = COALESCE($5, care_instructions),
         updated_at = NOW()
       WHERE product_id = $1 RETURNING *`,
      [productId, data.material || null, data.originCountry || null,
       data.manufactureDate || null, data.careInstructions || null],
    );
  },

  /**
   * Transfer the DPP as the product moves to a new owner.
   * Pass the transaction client when called from checkout.
   */
  async transfer(productId, toUserId, orderId, client = null) {
    const dpp = await db.one('SELECT * FROM dpps WHERE product_id = $1', [productId], client);
    if (!dpp) throw new NotFoundError('DPP not found');

    const product = await db.one('SELECT owner_id FROM products WHERE id = $1', [productId], client);
    const fromUserId = product ? product.ownerId : null;

    await db.query(
      `INSERT INTO dpp_transfers (id, dpp_id, from_user_id, to_user_id, order_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [db.newId(), dpp.id, fromUserId, toUserId, orderId || null],
      client,
    );
    await db.query('UPDATE products SET owner_id = $2, updated_at = NOW() WHERE id = $1',
      [productId, toUserId], client);
    await db.query(`UPDATE dpps SET status = 'TRANSFERRED', updated_at = NOW() WHERE id = $1`,
      [dpp.id], client);

    return { transferred: true, from: fromUserId, to: toUserId };
  },

  async markEndOfLife(productId) {
    await this.getByProduct(productId);
    return db.one(
      `UPDATE dpps SET status = 'END_OF_LIFE', updated_at = NOW() WHERE product_id = $1 RETURNING *`,
      [productId],
    );
  },
};

module.exports = { dppService };
