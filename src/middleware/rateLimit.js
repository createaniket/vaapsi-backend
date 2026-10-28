const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const disabled = env.NODE_ENV === 'test';
const passthrough = (_req, _res, next) => next();

const globalLimiter = disabled
  ? passthrough
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

// Tighter limit for auth/OTP endpoints to curb abuse (and third-party SMS cost).
const authLimiter = disabled
  ? passthrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try later' } },
    });

module.exports = { globalLimiter, authLimiter };
