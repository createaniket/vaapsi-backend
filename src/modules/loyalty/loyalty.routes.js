const { Router } = require('express');
const { loyaltyController } = require('./loyalty.controller');
const { validate } = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const {
  redeemSchema, donateSchema, earnAnyBrandSchema, poolRequestSchema, poolRespondSchema,
} = require('./loyalty.schema');

const router = Router();
router.use(authenticate);

router.get('/wallet', asyncHandler(loyaltyController.wallet));
router.post('/redeem', validate(redeemSchema), asyncHandler(loyaltyController.redeem));
router.post('/donate', validate(donateSchema), asyncHandler(loyaltyController.donate));

router.get('/pool/balance', asyncHandler(loyaltyController.pooledBalance));
router.post('/pool/request', validate(poolRequestSchema), asyncHandler(loyaltyController.requestPool));
router.post('/pool/respond', validate(poolRespondSchema), asyncHandler(loyaltyController.respondPool));

router.post(
  '/earn/any-brand',
  authorize('ADMIN', 'SUPPORT_AGENT'),
  validate(earnAnyBrandSchema),
  asyncHandler(loyaltyController.earnAnyBrand),
);

module.exports = router;
