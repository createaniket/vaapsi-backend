const db = require('../../db');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { toOffsetLimit } = require('../../utils/pagination');

const ticketService = {
  // ---- Customer ----
  async raise(customerId, subject, body, priority) {
    return db.transaction(async (client) => {
      const ticket = await db.one(
        `INSERT INTO tickets (id, subject, customer_id, priority)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [db.newId(), subject, customerId, priority || 'MEDIUM'],
        client,
      );
      const message = await db.one(
        `INSERT INTO ticket_messages (id, ticket_id, author_id, body)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [db.newId(), ticket.id, customerId, body],
        client,
      );
      return { ...ticket, messages: [message] };
    });
  },

  async listForCustomer(customerId) {
    const { rows: tickets } = await db.query(
      'SELECT * FROM tickets WHERE customer_id = $1 ORDER BY updated_at DESC',
      [customerId],
    );
    for (const t of tickets) {
      const { rows } = await db.query(
        'SELECT * FROM ticket_messages WHERE ticket_id = $1 AND internal = FALSE ORDER BY created_at ASC',
        [t.id],
      );
      t.messages = rows;
    }
    return tickets;
  },

  async getForCustomer(customerId, ticketId) {
    const ticket = await db.one('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket || ticket.customerId !== customerId) throw new NotFoundError('Ticket not found');
    const { rows: messages } = await db.query(
      'SELECT * FROM ticket_messages WHERE ticket_id = $1 AND internal = FALSE ORDER BY created_at ASC',
      [ticketId],
    );
    return { ...ticket, messages };
  },

  async reply(userId, role, ticketId, body, internal = false) {
    const ticket = await db.one('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) throw new NotFoundError('Ticket not found');

    const isParticipant =
      ticket.customerId === userId || ticket.agentId === userId ||
      role === 'ADMIN' || role === 'SUPPORT_AGENT';
    if (!isParticipant) throw new ForbiddenError('Not allowed on this ticket');

    // Internal notes only from staff.
    const isInternal = internal && role !== 'CUSTOMER';

    return db.transaction(async (client) => {
      const message = await db.one(
        `INSERT INTO ticket_messages (id, ticket_id, author_id, body, internal)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [db.newId(), ticketId, userId, body, isInternal],
        client,
      );
      await db.query(
        'UPDATE tickets SET status = $2, updated_at = NOW() WHERE id = $1',
        [ticketId, role === 'CUSTOMER' ? 'OPEN' : 'IN_PROGRESS'],
        client,
      );
      return message;
    });
  },

  // ---- Agent / Admin ----
  async queue(args) {
    const where = [];
    const params = [];
    let i = 1;
    if (args.status) { where.push(`t.status = $${i++}`); params.push(args.status); }
    if (args.agentId) { where.push(`t.agent_id = $${i++}`); params.push(args.agentId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { offset, limit } = toOffsetLimit(args.page, args.limit);
    const { rows: items } = await db.query(
      `SELECT t.*, u.full_name AS customer_name, u.email AS customer_email
       FROM tickets t JOIN users u ON u.id = t.customer_id
       ${whereSql}
       ORDER BY t.priority DESC, t.created_at ASC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset],
    );
    const countRow = await db.one(`SELECT COUNT(*)::int AS total FROM tickets t ${whereSql}`, params);
    return { items, total: countRow.total };
  },

  async getFull(ticketId) {
    const ticket = await db.one('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const { rows: messages } = await db.query(
      `SELECT m.*, u.full_name AS author_name, u.role AS author_role
       FROM ticket_messages m JOIN users u ON u.id = m.author_id
       WHERE m.ticket_id = $1 ORDER BY m.created_at ASC`,
      [ticketId],
    );
    const customer = await db.one('SELECT id, full_name, email FROM users WHERE id = $1', [ticket.customerId]);
    const agent = ticket.agentId
      ? await db.one('SELECT id, full_name FROM users WHERE id = $1', [ticket.agentId])
      : null;
    return { ...ticket, messages, customer, agent };
  },

  async assign(ticketId, agentId) {
    const ticket = await db.one(
      `UPDATE tickets SET agent_id = $2, status = 'IN_PROGRESS', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [ticketId, agentId],
    );
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  },

  async escalate(ticketId) {
    const ticket = await db.one(
      `UPDATE tickets SET status = 'ESCALATED', priority = 'HIGH', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  },

  async setStatus(ticketId, status) {
    const ticket = await db.one(
      'UPDATE tickets SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [ticketId, status],
    );
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  },
};

module.exports = { ticketService };
