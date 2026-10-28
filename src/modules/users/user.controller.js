const { userService } = require('./user.service');
const { ok } = require('../../utils/http');

const userController = {
  async profile(req, res) { ok(res, await userService.getProfile(req.user.id)); },
  async updateProfile(req, res) { ok(res, await userService.updateProfile(req.user.id, req.body)); },
  async getPrefs(req, res) { ok(res, await userService.getPreferences(req.user.id)); },
  async updatePrefs(req, res) { ok(res, await userService.updatePreferences(req.user.id, req.body)); },
};

module.exports = { userController };
