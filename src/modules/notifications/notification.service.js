const db = require('../../db');
const { logger } = require('../../config/logger');

/**
 * Notification service.
 *
 * Delivery goes through third-party gateways (email / SMS / WhatsApp / push) on the
 * client's own accounts, billed per-message at actuals. Swap the `deliver` stub for
 * real SDK calls (Twilio, MSG91, SES, FCM) without touching callers.
 */
async function deliver(channel, to, template, payload) {
  // TODO: integrate real provider SDKs.
  logger.info({ channel, to, template, payload }, 'Dispatching notification (stub adapter)');
}

const notificationService = {
  async send({ userId, channel, template, payload }) {
    const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) return null;

    const prefs = await db.one('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);

    // Respect opt-out preferences.
    const allowed =
      !prefs ||
      (channel === 'EMAIL' && prefs.email) ||
      (channel === 'SMS' && prefs.sms) ||
      (channel === 'WHATSAPP' && prefs.whatsapp) ||
      (channel === 'PUSH' && prefs.push);

    const record = await db.one(
      `INSERT INTO notifications (id, user_id, channel, template, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'QUEUED') RETURNING *`,
      [db.newId(), userId, channel, template, JSON.stringify(payload || {})],
    );

    if (!allowed) {
      return db.one(
        `UPDATE notifications SET status = 'FAILED', error = $2 WHERE id = $1 RETURNING *`,
        [record.id, 'User opted out of channel'],
      );
    }

    try {
      const to = channel === 'EMAIL' ? user.email || '' : user.phone || '';
      await deliver(channel, to, template, payload);
      return db.one(
        `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE id = $1 RETURNING *`,
        [record.id],
      );
    } catch (e) {
      return db.one(`UPDATE notifications SET status = 'FAILED', error = $2 WHERE id = $1 RETURNING *`, [
        record.id,
        e.message,
      ]);
    }
  },
};

module.exports = { notificationService };
