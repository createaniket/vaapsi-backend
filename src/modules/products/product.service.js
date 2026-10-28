const db = require('../../db');
const { NotFoundError } = require('../../utils/errors');
const { toOffsetLimit } = require('../../utils/pagination');

const productService = {
  async create(ownerId, data) {
    return db.one(
      `INSERT INTO products (id, title, category, base_price, brand, description,
                             image_urls, is_pre_loved, condition, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        db.newId(), data.title, data.category, data.basePrice, data.brand || null,
        data.description || null, data.imageUrls || [], data.isPreLoved || false,
        data.condition || 'NEW', ownerId,
      ],
    );
  },

  async list(args) {
    const where = [];
    const params = [];
    let i = 1;

    if (args.category) { where.push(`category = $${i++}`); params.push(args.category); }
    if (args.brand) { where.push(`brand = $${i++}`); params.push(args.brand); }
    if (args.isPreLoved !== undefined) { where.push(`is_pre_loved = $${i++}`); params.push(args.isPreLoved); }
    if (args.search) {
      where.push(`(title ILIKE $${i} OR description ILIKE $${i})`);
      params.push(`%${args.search}%`);
      i++;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { offset, limit } = toOffsetLimit(args.page, args.limit);
    const { rows: items } = await db.query(
      `SELECT * FROM products ${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset],
    );
    const countRow = await db.one(`SELECT COUNT(*)::int AS total FROM products ${whereSql}`, params);
    return { items, total: countRow.total };
  },

  async getById(id) {
    const product = await db.one('SELECT * FROM products WHERE id = $1', [id]);
    if (!product) throw new NotFoundError('Product not found');
    const dpp = await db.one('SELECT * FROM dpps WHERE product_id = $1', [id]);
    return { ...product, dpp };
  },

  /**
   * Cross-listing: for a brand-new product, surface similar PRE-LOVED products
   * that have an active listing, so buyers see resale options alongside new.
   */
  async similarPreLoved(productId, limit = 8) {
    const product = await this.getById(productId);
    const { rows } = await db.query(
      `SELECT p.*,
              l.id AS listing_id, l.price AS listing_price, l.shipping_date AS listing_shipping_date
       FROM products p
       JOIN LATERAL (
         SELECT id, price, shipping_date FROM listings
         WHERE product_id = p.id AND status = 'ACTIVE'
         ORDER BY price ASC LIMIT 1
       ) l ON TRUE
       WHERE p.id <> $1 AND p.is_pre_loved = TRUE AND p.category = $2
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [productId, product.category, limit],
    );
    return rows;
  },
};

module.exports = { productService };
