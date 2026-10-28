const { z } = require('zod');

const redeemSchema = z.object({
  points: z.number().int().positive(),
  bucket: z.enum(['VAAPSI', 'EXTERNAL_PARTNER']),
  orderId: z.string().optional(),
});
const donateSchema = z.object({ points: z.number().int().positive() });
const earnAnyBrandSchema = z.object({
  userId: z.string(),
  points: z.number().int().positive(),
  reason: z.string().optional(),
});
const poolRequestSchema = z.object({ memberId: z.string() });
const poolRespondSchema = z.object({ linkId: z.string(), approve: z.boolean() });

module.exports = { redeemSchema, donateSchema, earnAnyBrandSchema, poolRequestSchema, poolRespondSchema };
