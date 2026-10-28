const { passwordService } = require('./password.service');
const { ok } = require('../../utils/http');

const passwordController = {
  async forgot(req, res) {
    ok(res, await passwordService.requestReset(req.body.email));
  },
  async reset(req, res) {
    ok(res, await passwordService.resetPassword(req.body));
  },
};

module.exports = { passwordController };
