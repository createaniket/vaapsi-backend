require('dotenv/config');
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

  // Loyalty rules (Phase 1 confirmed scope)
  POINTS_PER_RUPEE: z.coerce.number().default(1),
  MIN_REDEEM_POINTS: z.coerce.number().default(100),
  POINT_VALUE_RUPEES: z.coerce.number().default(1),
  REDEEM_SPLIT_VAAPSI: z.coerce.number().default(0.7),
  REDEEM_SPLIT_EXTERNAL: z.coerce.number().default(0.3),
  REPAIR_EARN_RATE: z.coerce.number().default(0.05),
  RETURN_EOL_EARN_RATE: z.coerce.number().default(0.02),

  // Third-party gateways (client-owned accounts; billed at actuals)
  SMS_PROVIDER_KEY: z.string().optional(),
  WHATSAPP_PROVIDER_KEY: z.string().optional(),
  EMAIL_PROVIDER_KEY: z.string().optional(),
  DPP_PROVIDER_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().default('*'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

module.exports = { env, isProd };
