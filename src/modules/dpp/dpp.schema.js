const { z } = require('zod');

const createDppSchema = z.object({
  productId: z.string(),
  material: z.string().optional(),
  originCountry: z.string().optional(),
  manufactureDate: z.coerce.date().optional(),
  careInstructions: z.string().optional(),
  externalProvider: z.string().optional(),
});

const updateDppSchema = z.object({
  material: z.string().optional(),
  originCountry: z.string().optional(),
  manufactureDate: z.coerce.date().optional(),
  careInstructions: z.string().optional(),
});

module.exports = { createDppSchema, updateDppSchema };
