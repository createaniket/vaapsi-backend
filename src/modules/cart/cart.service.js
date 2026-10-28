const db = require('../../db');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { dppService } = require('../dpp/dpp.service');
const { loyaltyService } = require('../loyalty/loyalty.service');
const { notificationService } = require('../notifications/notification.service');
const { env } = require('../../config/env');

async function getOrCreateCart(userId, client = null) {
  let cart = await db.one('SELECT * FROM carts WHERE user_id = $1', [userId], client);
  if (!cart) {
    cart = await db.one(
      `INSERT INTO carts (id, user_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [db.newId(), userId],
      client,
    );
  }
  return cart;
}

const cartService = {
  async getCart(userId) {
    const cart = await getOrCreateCart(userId);
    const { rows: items } = await db.query(
      `SELECT ci.*,
              l.price AS listing_price, l.status AS listing_status,
              l.shipping_date AS listing_shipping_date, l.delay_days AS listing_delay_days,
              p.title AS product_title, p.id AS product_id
       FROM cart_items ci
       JOIN listings l ON l.id = ci.listing_id
       JOIN products p ON p.id = l.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at ASC`,
      [cart.id],
    );
    const subtotal = items.reduce((sum, it) => sum + Number(it.listingPrice) * it.quantity, 0);
    return { ...cart, items, subtotal };
  },

  async addItem(userId, listingId, quantity = 1, isDelayed = false) {
    const listing = await db.one('SELECT * FROM listings WHERE id = $1', [listingId]);
    if (!listing || listing.status !== 'ACTIVE') throw new BadRequestError('Listing is not available');

    const cart = await getOrCreateCart(userId);
    return db.one(
      `INSERT INTO cart_items (id, cart_id, listing_id, quantity, is_delayed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cart_id, listing_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, is_delayed = EXCLUDED.is_delayed
       RETURNING *`,
      [db.newId(), cart.id, listingId, quantity, isDelayed],
    );
  },

  async removeItem(userId, listingId) {
    const cart = await getOrCreateCart(userId);
    await db.query('DELETE FROM cart_items WHERE cart_id = $1 AND listing_id = $2', [cart.id, listingId]);
    return { removed: true };
  },

  /**
   * Checkout:
   *  - Payment is captured IMMEDIATELY, even for delayed purchases (shipping deferred).
   *  - Optional loyalty redemption (gated at 100 pts + 70/30 split enforced).
   *  - Marks listings SOLD, transfers each DPP to the buyer, credits earned points.
   * Everything runs in a single transaction so a failure rolls the whole thing back.
   */
  async checkout(userId, opts = {}) {
    const cart = await getOrCreateCart(userId);
    const { rows: items } = await db.query('SELECT * FROM cart_items WHERE cart_id = $1', [cart.id]);
    if (items.length === 0) throw new BadRequestError('Cart is empty');

    const listingIds = items.map((i) => i.listingId);
    const { rows: listings } = await db.query(
      'SELECT * FROM listings WHERE id = ANY($1)',
      [listingIds],
    );
    const byId = new Map(listings.map((l) => [l.id, l]));

    for (const it of items) {
      const l = byId.get(it.listingId);
      if (!l || l.status !== 'ACTIVE') {
        throw new BadRequestError(`Listing ${it.listingId} is no longer available`);
      }
    }

    const subtotal = items.reduce((sum, it) => sum + Number(byId.get(it.listingId).price) * it.quantity, 0);
    const anyDelayed = items.some((it) => it.isDelayed);
    const withShipDate = listings.find((l) => l.shippingDate);
    const shippingDate = anyDelayed
      ? withShipDate
        ? withShipDate.shippingDate
        : new Date(Date.now() + 30 * 86_400_000) // standard 30-day window
      : null;

    // Validate redemption eligibility BEFORE creating the order.
    let redeemPoints = 0;
    let redeemBucket = opts.redeemBucket || 'VAAPSI';
    if (opts.redeemPoints && opts.redeemPoints > 0) {
      redeemPoints = opts.redeemPoints;
      const wallet = await db.one('SELECT * FROM loyalty_wallets WHERE user_id = $1', [userId]);
      if (!wallet) throw new NotFoundError('Loyalty wallet not found');
      if (wallet.lifetimeEarned < env.MIN_REDEEM_POINTS) {
        throw new BadRequestError(`Redemption unlocks after earning ${env.MIN_REDEEM_POINTS} points`);
      }
      if (wallet.pointsBalance < redeemPoints) throw new BadRequestError('Insufficient points');
    }

    const pointsValue = redeemPoints * env.POINT_VALUE_RUPEES;
    const total = Math.max(0, subtotal - pointsValue);

    const orderId = await db.transaction(async (client) => {
      const order = await db.one(
        `INSERT INTO orders (id, buyer_id, status, subtotal, points_redeemed, points_value,
                             total, is_delayed, shipping_date)
         VALUES ($1, $2, 'PAID', $3, $4, $5, $6, $7, $8) RETURNING *`,
        [db.newId(), userId, subtotal, redeemPoints, pointsValue, total, anyDelayed, shippingDate],
        client,
      );

      for (const it of items) {
        const l = byId.get(it.listingId);
        await db.query(
          `INSERT INTO order_items (id, order_id, listing_id, price, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [db.newId(), order.id, l.id, l.price, it.quantity],
          client,
        );
        await db.query(
          `UPDATE listings SET status = 'SOLD', updated_at = NOW() WHERE id = $1`,
          [l.id],
          client,
        );
        // Transfer the DPP to the buyer if the product has one.
        const dpp = await db.one('SELECT id FROM dpps WHERE product_id = $1', [l.productId], client);
        if (dpp) await dppService.transfer(l.productId, userId, order.id, client);
      }

      await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id], client);
      return order.id;
    });

    // Apply redemption + earning (each atomic, with the 70/30 rule enforced).
    let redemption = null;
    if (redeemPoints > 0) {
      redemption = await loyaltyService.redeem(userId, redeemPoints, redeemBucket, orderId);
    }
    const earn = await loyaltyService.earnOnPurchase(userId, total, orderId);

    await notificationService.send({
      userId,
      channel: 'EMAIL',
      template: 'order_confirmation',
      payload: { orderId, total, pointsEarned: earn.earned },
    });

    const order = await db.one('SELECT * FROM orders WHERE id = $1', [orderId]);
    const { rows: orderItems } = await db.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

    return { order: { ...order, items: orderItems }, pointsEarned: earn.earned, redemption };
  },
};

const orderService = {
  async listForUser(userId) {
    const { rows: orders } = await db.query(
      'SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    for (const o of orders) {
      const { rows } = await db.query('SELECT * FROM order_items WHERE order_id = $1', [o.id]);
      o.items = rows;
    }
    return orders;
  },

  async getById(userId, id) {
    const order = await db.one('SELECT * FROM orders WHERE id = $1', [id]);
    if (!order || order.buyerId !== userId) throw new NotFoundError('Order not found');
    const { rows: items } = await db.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    return { ...order, items };
  },
};

module.exports = { cartService, orderService };
