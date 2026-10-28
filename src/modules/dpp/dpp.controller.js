const { dppService } = require('./dpp.service');
const { ok, created } = require('../../utils/http');

const dppController = {
  async create(req, res) { created(res, await dppService.create(req.body)); },
  async getBySerial(req, res) { ok(res, await dppService.getBySerial(req.params.serial)); },
  async getByProduct(req, res) { ok(res, await dppService.getByProduct(req.params.productId)); },
  async update(req, res) { ok(res, await dppService.update(req.params.productId, req.body)); },
  async markEndOfLife(req, res) { ok(res, await dppService.markEndOfLife(req.params.productId)); },
};

module.exports = { dppController };
