const { ticketService } = require('./ticket.service');
const { ok, created, paginated } = require('../../utils/http');

const ticketController = {
  async raise(req, res) {
    created(res, await ticketService.raise(req.user.id, req.body.subject, req.body.body, req.body.priority));
  },
  async myTickets(req, res) { ok(res, await ticketService.listForCustomer(req.user.id)); },
  async myTicket(req, res) { ok(res, await ticketService.getForCustomer(req.user.id, req.params.id)); },
  async reply(req, res) {
    created(res, await ticketService.reply(req.user.id, req.user.role, req.params.id, req.body.body, req.body.internal));
  },
  async queue(req, res) {
    const { page, limit } = req.query;
    const { items, total } = await ticketService.queue(req.query);
    paginated(res, items, { page, limit, total });
  },
  async getFull(req, res) { ok(res, await ticketService.getFull(req.params.id)); },
  async assign(req, res) { ok(res, await ticketService.assign(req.params.id, req.body.agentId)); },
  async escalate(req, res) { ok(res, await ticketService.escalate(req.params.id)); },
  async setStatus(req, res) { ok(res, await ticketService.setStatus(req.params.id, req.body.status)); },
};

module.exports = { ticketController };
