const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const createListingSchema = z.object({
  productId: z.string(),
  price: z.number().positive(),
  shippingDate: z.coerce.date().optional(),
  delayDays: z.number().int().min(0).max(90).optional(),
});

const listListingsSchema = paginationSchema.extend({
  category: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SOLD', 'WITHDRAWN']).optional(),
});

const shippingDateSchema = z.object({ shippingDate: z.coerce.date() });

module.exports = { createListingSchema, listListingsSchema, shippingDateSchema };
