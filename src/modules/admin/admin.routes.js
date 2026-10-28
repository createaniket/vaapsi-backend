const { Router } = require('express');
const { adminController } = require('./admin.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const {
  listUsersSchema, userStatusSchema, userRoleSchema, moderateSchema, auditLogSchema,
} = require('./admin.schema');

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/analytics', asyncHandler(adminController.analytics));

router.get('/users', validate(listUsersSchema, 'query'), asyncHandler(adminController.listUsers));
router.patch('/users/:id/status', validate(userStatusSchema), asyncHandler(adminController.setUserStatus));
router.patch('/users/:id/role', validate(userRoleSchema), asyncHandler(adminController.setUserRole));

router.post('/listings/:id/moderate', validate(moderateSchema), asyncHandler(adminController.moderateListing));

router.get('/dpp/:productId/audit', asyncHandler(adminController.dppAudit));
router.get('/audit-logs', validate(auditLogSchema, 'query'), asyncHandler(adminController.auditLogs));

module.exports = router;
