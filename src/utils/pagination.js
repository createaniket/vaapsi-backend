const { z } = require('zod');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function toOffsetLimit(page, limit) {
  return { offset: (page - 1) * limit, limit };
}

module.exports = { paginationSchema, toOffsetLimit };
