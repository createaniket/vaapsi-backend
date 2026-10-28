const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const listUsersSchema = paginationSchema.extend({
  role: z.enum(['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
  search: z.string().optional(),
});
const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']) });
const userRoleSchema = z.object({ role: z.enum(['CUSTOMER', 'SUPPORT_AGENT', 'ADMIN']) });
const moderateSchema = z.object({ action: z.enum(['WITHDRAWN', 'ACTIVE']) });
const auditLogSchema = paginationSchema.extend({ entityType: z.string().optional() });

module.exports = { listUsersSchema, userStatusSchema, userRoleSchema, moderateSchema, auditLogSchema };
