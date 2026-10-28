const { Router } = require('express');
const { ticketController } = require('./ticket.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const { raiseTicketSchema, replySchema, queueSchema, assignSchema, statusSchema } = require('./ticket.schema');

const router = Router();
router.use(authenticate);

const staff = authorize('SUPPORT_AGENT', 'ADMIN');

// Staff queue must be declared before '/:id' so it isn't captured as an id.
router.get('/queue', staff, validate(queueSchema, 'query'), asyncHandler(ticketController.queue));

// Customer-facing
router.post('/', validate(raiseTicketSchema), asyncHandler(ticketController.raise));
router.get('/mine', asyncHandler(ticketController.myTickets));
router.get('/mine/:id', asyncHandler(ticketController.myTicket));
router.post('/:id/reply', validate(replySchema), asyncHandler(ticketController.reply));

// Agent / Admin
router.get('/:id', staff, asyncHandler(ticketController.getFull));
router.post('/:id/assign', staff, validate(assignSchema), asyncHandler(ticketController.assign));
router.post('/:id/escalate', staff, asyncHandler(ticketController.escalate));
router.patch('/:id/status', staff, validate(statusSchema), asyncHandler(ticketController.setStatus));

module.exports = router;
