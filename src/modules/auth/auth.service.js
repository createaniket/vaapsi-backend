const db = require('../../db');
const { env } = require('../../config/env');
const { hashPassword, verifyPassword, sha256, randomOtp } = require('../../utils/crypto');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} = require('../../utils/errors');
const { notificationService } = require('../notifications/notification.service');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function issueTokens(user) {
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, email: user.email }),
    refreshToken: signRefreshToken(user.id),
  };
}

async function persistRefreshToken(userId, refreshToken) {
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await db.query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [db.newId(), userId, sha256(refreshToken), expiresAt],
  );
}

// Every new user gets a loyalty wallet + default notification prefs.
async function bootstrapUser(userId, client = null) {
  await db.query(
    `INSERT INTO loyalty_wallets (id, user_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [db.newId(), userId],
    client,
  );
  await db.query(
    `INSERT INTO notification_preferences (id, user_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [db.newId(), userId],
    client,
  );
}

// Strip sensitive fields before returning to clients.
function sanitize(user) {
  if (!user) return user;
  const { passwordHash, ...rest } = user;
  return rest;
}

const authService = {
  async register(input) {
    const existing = await db.one('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existing) throw new ConflictError('Email already registered');

    // Phone is optional at signup but unique in the schema, so it is checked
    // here to return a 409 the form can attach to the phone field, rather than
    // letting the insert fail with a raw constraint violation.
    if (input.phone) {
      const phoneTaken = await db.one('SELECT id FROM users WHERE phone = $1', [input.phone]);
      if (phoneTaken) throw new ConflictError('Phone number already registered');
    }

    const user = await db.one(
      `INSERT INTO users (id, email, password_hash, full_name, phone, marketing_opt_in)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        db.newId(),
        input.email,
        await hashPassword(input.password),
        input.fullName || null,
        input.phone || null,
        input.marketingOptIn || false,
      ],
    );
    await bootstrapUser(user.id);

    await notificationService.send({
      userId: user.id,
      channel: 'EMAIL',
      template: 'verify_email',
      payload: { fullName: user.fullName },
    });

    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    return { user: sanitize(user), ...tokens };
  },

  async login(input) {
    const user = await db.one('SELECT * FROM users WHERE email = $1', [input.email]);
    if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedError('Account is not active');

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    return { user: sanitize(user), ...tokens };
  },

  // Request a phone OTP. Sent via third-party SMS gateway (billed at actuals).
  async requestOtp(phone) {
    const code = randomOtp(6);
    const user = await db.one('SELECT id FROM users WHERE phone = $1', [phone]);

    await db.query(
      `INSERT INTO otp_codes (id, user_id, phone, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4, 'LOGIN', $5)`,
      [db.newId(), user ? user.id : null, phone, sha256(code), new Date(Date.now() + OTP_TTL_MS)],
    );

    if (user) {
      await notificationService.send({
        userId: user.id,
        channel: 'SMS',
        template: 'login_otp',
        payload: { code },
      });
    }

    // In non-prod we return the code to ease testing; never in production.
    return env.NODE_ENV === 'production' ? { sent: true } : { sent: true, devCode: code };
  },

  // Verify OTP → logs in existing user or creates a new phone-based account.
  async verifyOtp(phone, code) {
    const otp = await db.one(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND purpose = 'LOGIN' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    if (!otp) throw new BadRequestError('No pending OTP for this number');
    if (new Date(otp.expiresAt) < new Date()) throw new BadRequestError('OTP expired');
    if (otp.attempts >= MAX_OTP_ATTEMPTS) throw new BadRequestError('Too many attempts');

    if (otp.codeHash !== sha256(code)) {
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      throw new BadRequestError('Incorrect OTP');
    }

    await db.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [otp.id]);

    let user = await db.one('SELECT * FROM users WHERE phone = $1', [phone]);
    let isNew = false;
    if (!user) {
      user = await db.one(
        'INSERT INTO users (id, phone, phone_verified) VALUES ($1, $2, TRUE) RETURNING *',
        [db.newId(), phone],
      );
      await bootstrapUser(user.id);
      isNew = true;
    } else if (!user.phoneVerified) {
      user = await db.one('UPDATE users SET phone_verified = TRUE WHERE id = $1 RETURNING *', [user.id]);
    }

    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    return { user: sanitize(user), isNew, ...tokens };
  },

  async refresh(refreshToken) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const stored = await db.one('SELECT * FROM refresh_tokens WHERE token_hash = $1', [sha256(refreshToken)]);
    if (!stored || stored.revokedAt || new Date(stored.expiresAt) < new Date()) {
      throw new UnauthorizedError('Refresh token no longer valid');
    }

    const user = await db.one('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!user) throw new NotFoundError('User not found');

    // Rotate: revoke old, issue new.
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);
    const tokens = issueTokens(user);
    await persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  },

  async logout(refreshToken) {
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [sha256(refreshToken)],
    );
    return { success: true };
  },

  async me(userId) {
    const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundError('User not found');
    const wallet = await db.one('SELECT * FROM loyalty_wallets WHERE user_id = $1', [userId]);
    const notifPrefs = await db.one('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    return { ...sanitize(user), wallet, notifPrefs };
  },
};

module.exports = { authService, bootstrapUser, sanitize };
