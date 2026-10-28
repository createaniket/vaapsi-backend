const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const raiseTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});
const replySchema = z.object({ body: z.string().min(1), internal: z.boolean().optional() });
const queueSchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
  agentId: z.string().optional(),
});
const assignSchema = z.object({ agentId: z.string() });
const statusSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']) });

module.exports = { raiseTicketSchema, replySchema, queueSchema, assignSchema, statusSchema };
