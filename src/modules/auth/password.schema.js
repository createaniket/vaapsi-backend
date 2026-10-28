const { z } = require('zod');

/**
 * Forgot/reset validation.
 *
 * The password rules are the same ones `auth.schema.js` applies at signup —
 * a reset is a password being *set*, so it is held to the same bar. They are
 * restated rather than imported to keep this module self-contained; if they
 * drift, signup is the one to match.
 */
const PASSWORD = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

const EMAIL = z.string().trim().toLowerCase().email();

const forgotPasswordSchema = z.object({
  email: EMAIL,
});

const resetPasswordSchema = z.object({
  email: EMAIL,
  // Exactly six digits. A length check here keeps obvious junk away from the
  // attempt counter, so a typo does not spend one of five tries.
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
  password: PASSWORD,
});

module.exports = { forgotPasswordSchema, resetPasswordSchema };
