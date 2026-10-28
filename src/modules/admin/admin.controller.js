const { adminService } = require('./admin.service');
const { ok, paginated } = require('../../utils/http');

const adminController = {
  async analytics(_req, res) { ok(res, await adminService.analytics()); },
  async listUsers(req, res) {
    const { page, limit } = req.query;
    const { items, total } = await adminService.listUsers(req.query);
    paginated(res, items, { page, limit, total });
  },
  async setUserStatus(req, res) {
    ok(res, await adminService.setUserStatus(req.user.id, req.params.id, req.body.status));
  },
  async setUserRole(req, res) {
    ok(res, await adminService.setUserRole(req.user.id, req.params.id, req.body.role));
  },
  async moderateListing(req, res) {
    ok(res, await adminService.moderateListing(req.user.id, req.params.id, req.body.action));
  },
  async dppAudit(req, res) { ok(res, await adminService.dppAuditTrail(req.params.productId)); },
  async auditLogs(req, res) {
    const { page, limit } = req.query;
    const { items, total } = await adminService.auditLogs(req.query);
    paginated(res, items, { page, limit, total });
  },
};

module.exports = { adminController };
