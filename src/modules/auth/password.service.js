const db = require('../../db');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { sendMail } = require('../../config/mailer');
const { renderEmail } = require('../notifications/email.templates');
const { hashPassword, sha256, randomOtp } = require('../../utils/crypto');
const { BadRequestError } = require('../../utils/errors');

/**
 * Forgot password, by emailed one-time code.
 *
 * ## Why a code and not a reset link
 *
 * A link in a password-reset email is the most phished pattern there is, and a
 * link that carries a token also leaks that token to every mail gateway,
 * preview fetcher and link scanner in the path. A six-digit code is typed back
 * into a page the customer opened themselves, so there is nothing to click and
 * nothing in the URL.
 *
 * The cost of six digits is guessability, which is answered by a narrow window
 * (10 minutes), an attempt cap, single use, and the rate limiter already on the
 * auth routes.
 *
 * ## Why `requestReset` always reports success
 *
 * Replying "no account with that email" would turn this endpoint into a way to
 * test an email list against the customer table. It returns the same thing
 * either way, and only sends mail when there is somewhere to send it.
 *
 * ## What a completed reset does besides change the password
 *
 * It revokes every refresh token the account holds. A reset is what someone
 * does when they think their password is known to somebody else, and leaving
 * month-long sessions alive would make it useless against exactly that. It also
 * sends a "your password changed" notice, which is the account owner's only
 * signal if the reset was not theirs.
 */

const MAX_ATTEMPTS = 5;
/** Six digits, so a brute force is cheap unless attempts are capped. */
const OTP_DIGITS = 6;

function ttlMinutes() {
  return env.PASSWORD_RESET_OTP_TTL_MINUTES;
}

const passwordService = {
  /**
   * Issue a reset code for `email`, if that address has an account.
   *
   * Returns the same shape regardless, and never reveals whether mail was sent.
   */
  async requestReset(email) {
    const user = await db.one(
      'SELECT id, email, full_name, status FROM users WHERE email = $1',
      [email],
    );

    // No account, or one that cannot be signed into anyway. Nothing is sent and
    // nothing is said — see the note above.
    if (!user || user.status !== 'ACTIVE') {
      logger.info({ email }, 'Password reset requested for unknown or inactive address');
      return { requested: true };
    }

    // Retire any code still outstanding for this address. Without this, an
    // older code keeps working alongside the new one, so every request widens
    // the window instead of replacing it.
    await db.query(
      `UPDATE otp_codes SET consumed_at = NOW()
       WHERE email = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL`,
      [email],
    );

    const code = randomOtp(OTP_DIGITS);
    const minutes = ttlMinutes();

    await db.query(
      `INSERT INTO otp_codes (id, user_id, email, code_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4, 'PASSWORD_RESET', $5)`,
      [db.newId(), user.id, email, sha256(code), new Date(Date.now() + minutes * 60_000)],
    );

    const mail = renderEmail('password_reset_otp', {
      code,
      minutes,
      name: user.fullName,
    });

    try {
      // Sent directly rather than through the notification service, which
      // honours per-channel opt-outs. A customer who turned off email
      // notifications has opted out of being marketed to, not out of being able
      // to recover their own account.
      await sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (err) {
      // The code is already stored, so a transient relay failure would strand
      // the customer with an invisible outstanding code and no mail. Retire it
      // and let them ask again.
      await db.query(
        `UPDATE otp_codes SET consumed_at = NOW()
         WHERE email = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL`,
        [email],
      );
      logger.error({ err, email }, 'Could not send password reset code');
      throw err;
    }

    return { requested: true };
  },

  /**
   * Complete a reset: verify the code, set the new password, end every session.
   *
   * One deliberately vague error for a wrong, expired, missing or already-used
   * code. Telling them apart would say whether a code was ever issued for an
   * address, which is the enumeration `requestReset` avoids.
   */
  async resetPassword({ email, code, password }) {
    const otp = await db.one(
      `SELECT * FROM otp_codes
       WHERE email = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );

    const invalid = () => new BadRequestError('That code is not valid. Ask for a new one.');

    if (!otp) throw invalid();
    if (new Date(otp.expiresAt) < new Date()) throw invalid();

    if (otp.attempts >= MAX_ATTEMPTS) {
      // Burn it. Leaving an exhausted code unconsumed lets a caller keep
      // probing it forever, with the cap rejecting each try but never closing.
      await db.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [otp.id]);
      throw invalid();
    }

    if (otp.codeHash !== sha256(code)) {
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      throw invalid();
    }

    const user = await db.one('SELECT id, email, full_name FROM users WHERE id = $1', [otp.userId]);
    if (!user) throw invalid();

    const passwordHash = await hashPassword(password);

    // One transaction: the password change and the session revocation have to
    // land together. A password changed without the old sessions dropped is the
    // exact failure this flow exists to prevent.
    await db.transaction(async (client) => {
      await db.query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [
        user.id,
        passwordHash,
      ], client);

      await db.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1', [otp.id], client);

      await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id],
        client,
      );
    });

    // Best effort, and after the commit: the reset has succeeded whether or not
    // this notice goes out, and failing the request now would tell the customer
    // their password did not change when it did.
    try {
      const mail = renderEmail('password_changed', {
        name: user.fullName,
        when: new Date().toUTCString(),
      });
      await sendMail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Password changed but confirmation mail failed');
    }

    logger.info({ userId: user.id }, 'Password reset completed; all sessions revoked');
    return { reset: true };
  },
};

module.exports = { passwordService };
