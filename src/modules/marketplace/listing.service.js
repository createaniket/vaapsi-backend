const db = require('../../db');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { toOffsetLimit } = require('../../utils/pagination');

const listingService = {
  async create(sellerId, input) {
    const product = await db.one('SELECT * FROM products WHERE id = $1', [input.productId]);
    if (!product) throw new NotFoundError('Product not found');
    if (product.ownerId !== sellerId) throw new ForbiddenError('You do not own this product');

    return db.one(
      `INSERT INTO listings (id, product_id, seller_id, price, shipping_date, delay_days, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE') RETURNING *`,
      [
        db.newId(), input.productId, sellerId, input.price,
        input.shippingDate || null,
        input.delayDays !== undefined ? input.delayDays : 30, // standard delayed-purchase window
      ],
    );
  },

  async list(args) {
    const where = ['l.status = $1'];
    const params = [args.status || 'ACTIVE'];
    let i = 2;

    if (args.category) { where.push(`p.category = $${i++}`); params.push(args.category); }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { offset, limit } = toOffsetLimit(args.page, args.limit);
    const { rows: items } = await db.query(
      `SELECT l.*,
              p.title AS product_title, p.brand AS product_brand, p.category AS product_category,
              p.condition AS product_condition, p.is_pre_loved AS product_is_pre_loved,
              u.full_name AS seller_name
       FROM listings l
       JOIN products p ON p.id = l.product_id
       JOIN users u ON u.id = l.seller_id
       ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset],
    );
    const countRow = await db.one(
      `SELECT COUNT(*)::int AS total FROM listings l JOIN products p ON p.id = l.product_id ${whereSql}`,
      params,
    );
    return { items, total: countRow.total };
  },

  async getById(id) {
    const listing = await db.one('SELECT * FROM listings WHERE id = $1', [id]);
    if (!listing) throw new NotFoundError('Listing not found');
    const product = await db.one('SELECT * FROM products WHERE id = $1', [listing.productId]);
    const dpp = await db.one('SELECT * FROM dpps WHERE product_id = $1', [listing.productId]);
    const seller = await db.one('SELECT id, full_name FROM users WHERE id = $1', [listing.sellerId]);
    return { ...listing, product: { ...product, dpp }, seller };
  },

  async withdraw(sellerId, id) {
    const listing = await db.one('SELECT * FROM listings WHERE id = $1', [id]);
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenError('Not your listing');
    return db.one(
      `UPDATE listings SET status = 'WITHDRAWN', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
  },

  // Shipping date is adjustable at/after listing time (Phase-1 scope).
  async setShippingDate(sellerId, id, shippingDate) {
    const listing = await db.one('SELECT * FROM listings WHERE id = $1', [id]);
    if (!listing) throw new NotFoundError('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenError('Not your listing');
    return db.one(
      'UPDATE listings SET shipping_date = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id, shippingDate],
    );
  },
};

module.exports = { listingService };
