const nodemailer = require('nodemailer');
const { env, isProd } = require('./env');
const { logger } = require('./logger');

/**
 * SMTP transport.
 *
 * ## Configured vs not
 *
 * With `SMTP_HOST` set, mail goes out over SMTP. Without it, `sendMail` logs
 * the rendered message and reports success — the same shape the notification
 * stub had, so a developer with no mail server can still run the whole
 * password-reset flow end to end.
 *
 * That fallback is **refused in production**. A production deployment that
 * silently logs password-reset codes instead of sending them looks healthy
 * while locking every customer out of their account, so an unconfigured
 * production process fails loudly at the first send instead.
 *
 * ## One lazily-created transport
 *
 * Nodemailer pools connections, so the transport is created once and reused.
 * It is created on first use rather than at import time so requiring this
 * module never opens a socket — tests and the migration script both load the
 * config tree without wanting a mail connection.
 */

let transport = null;
let verified = false;

function isConfigured() {
  return typeof env.SMTP_HOST === 'string' && env.SMTP_HOST.trim() !== '';
}

function getTransport() {
  if (transport !== null) return transport;

  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Implicit TLS on 465; STARTTLS upgrade on 587 and 25. `secure: true` on a
    // STARTTLS port makes the connection hang rather than fail, which is a
    // miserable thing to debug, so it is derived from the port unless the
    // operator overrides it.
    secure: env.SMTP_SECURE === undefined ? env.SMTP_PORT === 465 : env.SMTP_SECURE,
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
    // Keep a slow or black-holed relay from pinning a request open. The caller
    // treats a failure as "could not send" and the customer is told to retry.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: true,
    maxConnections: 3,
  });

  return transport;
}

/**
 * Check the relay once, on the first send.
 *
 * Verifying eagerly at boot would couple process start to a third party being
 * reachable; verifying on every send would double the round trips. Once, lazily,
 * is the useful middle: the first password reset after a bad deploy logs a clear
 * reason instead of a generic failure.
 */
async function verifyOnce() {
  if (verified) return;
  try {
    await getTransport().verify();
    logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP relay reachable');
  } catch (err) {
    logger.error({ err, host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP relay unreachable');
  }
  // Set regardless: a failed verify must not retry on every subsequent send.
  verified = true;
}

/**
 * Send one message.
 *
 * Throws on failure so the caller can decide what the customer is told. It
 * deliberately does not swallow errors — a password reset that reports success
 * while the mail never left is the worst outcome available here.
 */
async function sendMail({ to, subject, text, html }) {
  if (!isConfigured()) {
    if (isProd) {
      throw new Error(
        'SMTP is not configured (SMTP_HOST is empty) and this is a production process. ' +
          'Refusing to pretend mail was sent.',
      );
    }
    // Development convenience. The body is logged in full, including any code
    // it carries, which is exactly why this branch cannot run in production.
    logger.warn({ to, subject, text }, 'SMTP not configured — logging mail instead of sending');
    return { delivered: false, logged: true };
  }

  await verifyOnce();

  const info = await getTransport().sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    ...(html === undefined ? {} : { html }),
  });

  logger.info({ to, subject, messageId: info.messageId }, 'Mail sent');
  return { delivered: true, messageId: info.messageId };
}

module.exports = { sendMail, isConfigured };
