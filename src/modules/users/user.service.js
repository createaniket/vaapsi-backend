const db = require('../../db');
const { NotFoundError } = require('../../utils/errors');
const { sanitize } = require('../auth/auth.service');

const userService = {
  async getProfile(userId) {
    const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundError('User not found');
    const wallet = await db.one('SELECT * FROM loyalty_wallets WHERE user_id = $1', [userId]);
    const notifPrefs = await db.one('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    return { ...sanitize(user), wallet, notifPrefs };
  },

  async updateProfile(userId, data) {
    const user = await db.one(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         marketing_opt_in = COALESCE($3, marketing_opt_in),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [userId, data.fullName !== undefined ? data.fullName : null,
       data.marketingOptIn !== undefined ? data.marketingOptIn : null],
    );
    if (!user) throw new NotFoundError('User not found');
    return sanitize(user);
  },

  async getPreferences(userId) {
    let prefs = await db.one('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    if (!prefs) {
      prefs = await db.one(
        'INSERT INTO notification_preferences (id, user_id) VALUES ($1, $2) RETURNING *',
        [db.newId(), userId],
      );
    }
    return prefs;
  },

  async updatePreferences(userId, data) {
    await this.getPreferences(userId); // ensure row exists
    return db.one(
      `UPDATE notification_preferences SET
         email = COALESCE($2, email),
         sms = COALESCE($3, sms),
         whatsapp = COALESCE($4, whatsapp),
         push = COALESCE($5, push),
         marketing = COALESCE($6, marketing),
         updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [
        userId,
        data.email !== undefined ? data.email : null,
        data.sms !== undefined ? data.sms : null,
        data.whatsapp !== undefined ? data.whatsapp : null,
        data.push !== undefined ? data.push : null,
        data.marketing !== undefined ? data.marketing : null,
      ],
    );
  },
};

module.exports = { userService };
