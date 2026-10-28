const { Router } = require('express');
const { dppController } = require('./dpp.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const { createDppSchema, updateDppSchema } = require('./dpp.schema');

const router = Router();

// Public passport lookup by QR serial (a scanned QR resolves here).
router.get('/serial/:serial', asyncHandler(dppController.getBySerial));

router.use(authenticate);
router.get('/product/:productId', asyncHandler(dppController.getByProduct));
router.post('/', validate(createDppSchema), asyncHandler(dppController.create));
router.patch('/product/:productId', validate(updateDppSchema), asyncHandler(dppController.update));
router.post('/product/:productId/end-of-life', authorize('ADMIN', 'SUPPORT_AGENT'),
  asyncHandler(dppController.markEndOfLife));

module.exports = router;
