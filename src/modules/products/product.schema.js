const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const createProductSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1),
  basePrice: z.number().positive(),
  brand: z.string().optional(),
  description: z.string().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  isPreLoved: z.boolean().optional(),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'END_OF_LIFE']).optional(),
});

const listProductSchema = paginationSchema.extend({
  category: z.string().optional(),
  brand: z.string().optional(),
  isPreLoved: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

module.exports = { createProductSchema, listProductSchema };
