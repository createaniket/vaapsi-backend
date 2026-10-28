const { z } = require('zod');

/**
 * Password strength, enforced server-side.
 *
 * The client validates the same rules for immediate feedback, but this is the
 * copy that counts — a client can be bypassed with a single curl call.
 * Length does most of the work; the character classes stop the handful of
 * trivially guessable 8-character passwords ("password", "12345678").
 */
const PASSWORD = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

/** E.164-ish. Optional at signup — email+password is the only credential. */
const PHONE = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number');

const registerSchema = z.object({
  // Normalised so "Alex@x.com" and "alex@x.com" cannot become two accounts.
  email: z.string().trim().toLowerCase().email(),
  password: PASSWORD,
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: PHONE.optional(),
  marketingOptIn: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Not PASSWORD: strength rules belong at the point a password is *set*.
  // Applying them here would reject a valid legacy password and, worse, leak
  // which passwords could never exist on the system.
  password: z.string().min(1),
});

const requestOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/),
  code: z.string().length(6),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

module.exports = { registerSchema, loginSchema, requestOtpSchema, verifyOtpSchema, refreshSchema };
