const { z } = require('zod');

const addItemSchema = z.object({
  listingId: z.string(),
  quantity: z.number().int().positive().default(1),
  isDelayed: z.boolean().optional(),
});

const checkoutSchema = z.object({
  redeemPoints: z.number().int().positive().optional(),
  redeemBucket: z.enum(['VAAPSI', 'EXTERNAL_PARTNER']).optional(),
});

module.exports = { addItemSchema, checkoutSchema };
