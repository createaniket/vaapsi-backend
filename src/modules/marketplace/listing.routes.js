const { Router } = require('express');
const { listingController } = require('./listing.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const { createListingSchema, listListingsSchema, shippingDateSchema } = require('./listing.schema');

const router = Router();

router.get('/', validate(listListingsSchema, 'query'), asyncHandler(listingController.list));
router.get('/:id', asyncHandler(listingController.getById));

router.use(authenticate);
router.post('/', validate(createListingSchema), asyncHandler(listingController.create));
router.post('/:id/withdraw', asyncHandler(listingController.withdraw));
router.patch('/:id/shipping-date', validate(shippingDateSchema), asyncHandler(listingController.setShippingDate));

module.exports = router;
