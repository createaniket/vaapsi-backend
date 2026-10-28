const { productService } = require('./product.service');
const { ok, created, paginated } = require('../../utils/http');

const productController = {
  async create(req, res) { created(res, await productService.create(req.user.id, req.body)); },
  async list(req, res) {
    const { page, limit } = req.query;
    const { items, total } = await productService.list(req.query);
    paginated(res, items, { page, limit, total });
  },
  async getById(req, res) { ok(res, await productService.getById(req.params.id)); },
  async similar(req, res) { ok(res, await productService.similarPreLoved(req.params.id)); },
};

module.exports = { productController };
