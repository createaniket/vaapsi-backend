const { listingService } = require('./listing.service');
const { ok, created, paginated } = require('../../utils/http');

const listingController = {
  async create(req, res) { created(res, await listingService.create(req.user.id, req.body)); },
  async list(req, res) {
    const { page, limit } = req.query;
    const { items, total } = await listingService.list(req.query);
    paginated(res, items, { page, limit, total });
  },
  async getById(req, res) { ok(res, await listingService.getById(req.params.id)); },
  async withdraw(req, res) { ok(res, await listingService.withdraw(req.user.id, req.params.id)); },
  async setShippingDate(req, res) {
    ok(res, await listingService.setShippingDate(req.user.id, req.params.id, req.body.shippingDate));
  },
};

module.exports = { listingController };
