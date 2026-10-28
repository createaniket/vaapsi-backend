const { cartService, orderService } = require('./cart.service');
const { ok, created } = require('../../utils/http');

const cartController = {
  async getCart(req, res) { ok(res, await cartService.getCart(req.user.id)); },
  async addItem(req, res) {
    created(res, await cartService.addItem(req.user.id, req.body.listingId, req.body.quantity, req.body.isDelayed));
  },
  async removeItem(req, res) { ok(res, await cartService.removeItem(req.user.id, req.params.listingId)); },
  async checkout(req, res) { created(res, await cartService.checkout(req.user.id, req.body)); },
  async listOrders(req, res) { ok(res, await orderService.listForUser(req.user.id)); },
  async getOrder(req, res) { ok(res, await orderService.getById(req.user.id, req.params.id)); },
};

module.exports = { cartController };
