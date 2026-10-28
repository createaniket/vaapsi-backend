const { authService } = require('./auth.service');
const { ok, created } = require('../../utils/http');

const authController = {
  async register(req, res) { created(res, await authService.register(req.body)); },
  async login(req, res) { ok(res, await authService.login(req.body)); },
  async requestOtp(req, res) { ok(res, await authService.requestOtp(req.body.phone)); },
  async verifyOtp(req, res) { ok(res, await authService.verifyOtp(req.body.phone, req.body.code)); },
  async refresh(req, res) { ok(res, await authService.refresh(req.body.refreshToken)); },
  async logout(req, res) { ok(res, await authService.logout(req.body.refreshToken)); },
  async me(req, res) { ok(res, await authService.me(req.user.id)); },
};

module.exports = { authController };
