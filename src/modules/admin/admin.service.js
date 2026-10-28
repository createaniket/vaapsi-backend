const db = require('../../db');
const { NotFoundError } = require('../../utils/errors');
const { toOffsetLimit } = require('../../utils/pagination');

const adminService = {
  // Platform analytics for the admin dashboard.
  async analytics() {
    const users = await db.one('SELECT COUNT(*)::int AS c FROM users');
    const products = await db.one('SELECT COUNT(*)::int AS c FROM products');
    const listings = await db.one('SELECT COUNT(*)::int AS c FROM listings');
    const activeListings = await db.one(`SELECT COUNT(*)::int AS c FROM listings WHERE status = 'ACTIVE'`);
    const orders = await db.one(
      `SELECT COUNT(*)::int AS c FROM orders WHERE status IN ('PAID','SHIPPED','DELIVERED')`,
    );
    const revenue = await db.one(
      `SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE status IN ('PAID','SHIPPED','DELIVERED')`,
    );
    const tickets = await db.one('SELECT COUNT(*)::int AS c FROM tickets');
    const openTickets = await db.one(
      `SELECT COUNT(*)::int AS c FROM tickets WHERE status IN ('OPEN','IN_PROGRESS','ESCALATED')`,
    );
    const points = await db.one(
      `SELECT COALESCE(SUM(points_balance),0)::int AS balance,
              COALESCE(SUM(lifetime_earned),0)::int AS earned,
              COALESCE(SUM(lifetime_redeemed),0)::int AS redeemed
       FROM loyalty_wallets`,
    );

    return {
      users: users.c,
      products: products.c,
      listings: listings.c,
      activeListings: activeListings.c,
      orders: orders.c,
      revenue: Number(revenue.s),
      tickets: { total: tickets.c, open: openTickets.c },
      loyalty: {
        outstandingPoints: points.balance,
        lifetimeEarned: points.earned,
        lifetimeRedeemed: points.redeemed,
      },
    };
  },

  // ---- User management ----
  async listUsers(args) {
    const where = [];
    const params = [];
    let i = 1;
    if (args.role) { where.push(`role = $${i++}`); params.push(args.role); }
    if (args.status) { where.push(`status = $${i++}`); params.push(args.status); }
    if (args.search) {
      where.push(`(email ILIKE $${i} OR full_name ILIKE $${i})`);
      params.push(`%${args.search}%`);
      i++;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { offset, limit } = toOffsetLimit(args.page, args.limit);
    const { rows: items } = await db.query(
      `SELECT id, email, phone, full_name, role, status, created_at
       FROM users ${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset],
    );
    const countRow = await db.one(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, params);
    return { items, total: countRow.total };
  },

  async setUserStatus(actorId, userId, status) {
    const updated = await db.one(
      'UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, status',
      [userId, status],
    );
    if (!updated) throw new NotFoundError('User not found');
    await this.audit(actorId, 'USER_STATUS_CHANGE', 'User', userId, { status });
    return updated;
  },

  async setUserRole(actorId, userId, role) {
    const updated = await db.one(
      'UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING id, role',
      [userId, role],
    );
    if (!updated) throw new NotFoundError('User not found');
    await this.audit(actorId, 'USER_ROLE_CHANGE', 'User', userId, { role });
    return updated;
  },

  // ---- Listing moderation ----
  async moderateListing(actorId, listingId, action) {
    const listing = await db.one(
      'UPDATE listings SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [listingId, action],
    );
    if (!listing) throw new NotFoundError('Listing not found');
    await this.audit(actorId, 'LISTING_MODERATION', 'Listing', listingId, { action });
    return listing;
  },

  // ---- DPP audit trail ----
  async dppAuditTrail(productId) {
    const dpp = await db.one('SELECT * FROM dpps WHERE product_id = $1', [productId]);
    if (!dpp) throw new NotFoundError('DPP not found');
    const { rows: transfers } = await db.query(
      'SELECT * FROM dpp_transfers WHERE dpp_id = $1 ORDER BY created_at ASC',
      [dpp.id],
    );
    return { serialNumber: dpp.serialNumber, status: dpp.status, transfers };
  },

  // ---- Generic audit logger ----
  async audit(actorId, action, entityType, entityId, metadata) {
    return db.one(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [db.newId(), actorId || null, action, entityType, entityId || null, JSON.stringify(metadata || {})],
    );
  },

  async auditLogs(args) {
    const where = [];
    const params = [];
    let i = 1;
    if (args.entityType) { where.push(`entity_type = $${i++}`); params.push(args.entityType); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { offset, limit } = toOffsetLimit(args.page, args.limit);
    const { rows: items } = await db.query(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset],
    );
    const countRow = await db.one(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`, params);
    return { items, total: countRow.total };
  },
};

module.exports = { adminService };
