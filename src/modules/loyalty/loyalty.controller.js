const { loyaltyService } = require('./loyalty.service');
const { ok } = require('../../utils/http');

const loyaltyController = {
  async wallet(req, res) { ok(res, await loyaltyService.getWallet(req.user.id)); },
  async redeem(req, res) {
    ok(res, await loyaltyService.redeem(req.user.id, req.body.points, req.body.bucket, req.body.orderId));
  },
  async donate(req, res) { ok(res, await loyaltyService.donate(req.user.id, req.body.points)); },
  async pooledBalance(req, res) { ok(res, await loyaltyService.pooledBalance(req.user.id)); },
  async requestPool(req, res) { ok(res, await loyaltyService.requestPoolLink(req.user.id, req.body.memberId)); },
  async respondPool(req, res) {
    ok(res, await loyaltyService.respondPoolLink(req.user.id, req.body.linkId, req.body.approve));
  },
  async earnAnyBrand(req, res) {
    ok(res, await loyaltyService.earnOnAnyBrandReturn(req.body.userId, req.body.points, req.body.reason));
  },
};

module.exports = { loyaltyController };
