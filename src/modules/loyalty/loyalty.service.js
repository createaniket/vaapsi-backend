const db = require('../../db');
const { env } = require('../../config/env');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * Loyalty engine — Phase 1 confirmed rules:
 *  - Earn: ₹1 = 1 point on purchases; ~5% on repair (one repair per product);
 *    up to 2% on end-of-life/damaged Vaapsi returns; any-brand textile returns
 *    via a pre-defined point table (school programs).
 *  - Redeem: allowed only after MIN_REDEEM_POINTS (100) lifetime points earned.
 *  - Usage split enforced: 70% Vaapsi shopping, 30% external partner essentials.
 *  - Pooling: owner can combine approved family/friends' points.
 *  - Donation: points can be donated to the Vaapsi wallet for redistribution.
 */

async function getWalletOrThrow(userId, client = null) {
  const wallet = await db.one('SELECT * FROM loyalty_wallets WHERE user_id = $1', [userId], client);
  if (!wallet) throw new NotFoundError('Loyalty wallet not found');
  return wallet;
}

// Credit points + write the ledger entry, inside the given transaction client.
async function credit(client, walletId, points, type, reason, orderId) {
  await db.query(
    `INSERT INTO loyalty_transactions (id, wallet_id, type, points, reason, order_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [db.newId(), walletId, type, points, reason || null, orderId || null],
    client,
  );
  await db.query(
    `UPDATE loyalty_wallets
     SET points_balance = points_balance + $2,
         lifetime_earned = lifetime_earned + GREATEST($2, 0),
         updated_at = NOW()
     WHERE id = $1`,
    [walletId, points],
    client,
  );
}

const loyaltyService = {
  async getWallet(userId) {
    const wallet = await getWalletOrThrow(userId);
    const { rows: transactions } = await db.query(
      'SELECT * FROM loyalty_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 50',
      [wallet.id],
    );
    return { ...wallet, transactions };
  },

  // ₹1 = 1 point on a completed purchase.
  async earnOnPurchase(userId, purchaseAmount, orderId) {
    const points = Math.floor(purchaseAmount * env.POINTS_PER_RUPEE);
    return db.transaction(async (client) => {
      const wallet = await getWalletOrThrow(userId, client);
      await credit(client, wallet.id, points, 'EARN_PURCHASE', 'Purchase reward', orderId);
      return { earned: points };
    });
  },

  // ~5% of sale value on a repair — capped to one repair reward per product.
  async earnOnRepair(userId, saleValue, productId) {
    const already = await db.one(
      `SELECT id FROM loyalty_transactions WHERE type = 'EARN_REPAIR' AND reason LIKE $1`,
      [`%${productId}%`],
    );
    if (already) throw new BadRequestError('Repair reward already claimed for this product');

    const points = Math.floor(saleValue * env.REPAIR_EARN_RATE);
    return db.transaction(async (client) => {
      const wallet = await getWalletOrThrow(userId, client);
      await credit(client, wallet.id, points, 'EARN_REPAIR', `Repair reward:${productId}`);
      return { earned: points };
    });
  },

  // Up to 2% of purchase value on returning an end-of-life / damaged Vaapsi product.
  async earnOnEolReturn(userId, purchaseValue, productId) {
    const points = Math.floor(purchaseValue * env.RETURN_EOL_EARN_RATE);
    return db.transaction(async (client) => {
      const wallet = await getWalletOrThrow(userId, client);
      await credit(client, wallet.id, points, 'EARN_RETURN_EOL', `EOL return:${productId}`);
      return { earned: points };
    });
  },

  // Any-brand return (textiles first) via a pre-defined point table.
  async earnOnAnyBrandReturn(userId, points, reason = 'Any-brand textile return') {
    if (points <= 0) throw new BadRequestError('Points must be positive');
    return db.transaction(async (client) => {
      const wallet = await getWalletOrThrow(userId, client);
      await credit(client, wallet.id, points, 'EARN_RETURN_ANY_BRAND', reason);
      return { earned: points };
    });
  },

  /**
   * Redeem points. Gated at MIN_REDEEM_POINTS lifetime earned, and the
   * external-partner bucket is capped at REDEEM_SPLIT_EXTERNAL (30%) of all
   * points ever redeemed.
   */
  async redeem(userId, points, bucket, orderId) {
    if (points <= 0) throw new BadRequestError('Points must be positive');

    return db.transaction(async (client) => {
      // Lock the wallet row for the duration of the transaction.
      const wallet = await db.one(
        'SELECT * FROM loyalty_wallets WHERE user_id = $1 FOR UPDATE',
        [userId],
        client,
      );
      if (!wallet) throw new NotFoundError('Loyalty wallet not found');

      if (wallet.lifetimeEarned < env.MIN_REDEEM_POINTS) {
        throw new BadRequestError(`Redemption unlocks after earning ${env.MIN_REDEEM_POINTS} points`);
      }
      if (wallet.pointsBalance < points) throw new BadRequestError('Insufficient points');

      // Enforce the 70/30 split across lifetime redemptions.
      const { rows } = await db.query(
        `SELECT bucket, COALESCE(SUM(points), 0) AS total
         FROM loyalty_transactions
         WHERE wallet_id = $1 AND type = 'REDEEM'
         GROUP BY bucket`,
        [wallet.id],
        client,
      );
      const redeemed = { VAAPSI: 0, EXTERNAL_PARTNER: 0 };
      for (const row of rows) {
        if (row.bucket) redeemed[row.bucket] = Math.abs(Number(row.total));
      }
      const totalAfter = redeemed.VAAPSI + redeemed.EXTERNAL_PARTNER + points;
      const externalAfter = redeemed.EXTERNAL_PARTNER + (bucket === 'EXTERNAL_PARTNER' ? points : 0);
      if (externalAfter / totalAfter > env.REDEEM_SPLIT_EXTERNAL + 1e-9) {
        throw new BadRequestError(
          `External-partner redemption capped at ${env.REDEEM_SPLIT_EXTERNAL * 100}% of points`,
        );
      }

      await db.query(
        `INSERT INTO loyalty_transactions (id, wallet_id, type, points, bucket, order_id)
         VALUES ($1, $2, 'REDEEM', $3, $4, $5)`,
        [db.newId(), wallet.id, -points, bucket, orderId || null],
        client,
      );
      await db.query(
        `UPDATE loyalty_wallets
         SET points_balance = points_balance - $2,
             lifetime_redeemed = lifetime_redeemed + $2,
             updated_at = NOW()
         WHERE id = $1`,
        [wallet.id, points],
        client,
      );

      return { redeemed: points, valueRupees: points * env.POINT_VALUE_RUPEES, bucket };
    });
  },

  // Donate points into the Vaapsi wallet pool for redistribution.
  async donate(userId, points) {
    if (points <= 0) throw new BadRequestError('Points must be positive');
    return db.transaction(async (client) => {
      const wallet = await db.one(
        'SELECT * FROM loyalty_wallets WHERE user_id = $1 FOR UPDATE',
        [userId],
        client,
      );
      if (!wallet) throw new NotFoundError('Loyalty wallet not found');
      if (wallet.pointsBalance < points) throw new BadRequestError('Insufficient points');

      await db.query(
        `INSERT INTO loyalty_transactions (id, wallet_id, type, points, reason)
         VALUES ($1, $2, 'DONATE', $3, 'Donation to Vaapsi wallet')`,
        [db.newId(), wallet.id, -points],
        client,
      );
      await db.query(
        'UPDATE loyalty_wallets SET points_balance = points_balance - $2, updated_at = NOW() WHERE id = $1',
        [wallet.id, points],
        client,
      );
      return { donated: points };
    });
  },

  // ---- Pooling (approval-based) ----

  async requestPoolLink(ownerId, memberId) {
    if (ownerId === memberId) throw new BadRequestError('Cannot pool with yourself');
    const member = await db.one('SELECT id FROM users WHERE id = $1', [memberId]);
    if (!member) throw new NotFoundError('Member not found');

    return db.one(
      `INSERT INTO point_pool_links (id, owner_id, member_id, status)
       VALUES ($1, $2, $3, 'PENDING')
       ON CONFLICT (owner_id, member_id)
       DO UPDATE SET status = 'PENDING', updated_at = NOW()
       RETURNING *`,
      [db.newId(), ownerId, memberId],
    );
  },

  async respondPoolLink(memberId, linkId, approve) {
    const link = await db.one('SELECT * FROM point_pool_links WHERE id = $1', [linkId]);
    if (!link) throw new NotFoundError('Pool link not found');
    if (link.memberId !== memberId) throw new ForbiddenError('Not your pool request');

    return db.one(
      'UPDATE point_pool_links SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [linkId, approve ? 'APPROVED' : 'REJECTED'],
    );
  },

  // Combined redeemable balance = own balance + approved members' balances.
  async pooledBalance(ownerId) {
    const { rows: links } = await db.query(
      `SELECT member_id FROM point_pool_links WHERE owner_id = $1 AND status = 'APPROVED'`,
      [ownerId],
    );
    const memberIds = links.map((l) => l.memberId);
    const ids = [ownerId, ...memberIds];

    const { rows: wallets } = await db.query(
      'SELECT user_id, points_balance FROM loyalty_wallets WHERE user_id = ANY($1)',
      [ids],
    );
    const combined = wallets.reduce((sum, w) => sum + w.pointsBalance, 0);
    return { ownerId, members: memberIds, combinedPoints: combined, wallets };
  },
};

module.exports = { loyaltyService };
