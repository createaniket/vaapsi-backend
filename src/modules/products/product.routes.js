const { Router } = require('express');
const { productController } = require('./product.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const { createProductSchema, listProductSchema } = require('./product.schema');

const router = Router();

router.get('/', validate(listProductSchema, 'query'), asyncHandler(productController.list));
router.get('/:id', asyncHandler(productController.getById));
// Cross-listing: similar pre-loved products for a given (brand-new) product.
router.get('/:id/similar-preloved', asyncHandler(productController.similar));

router.post('/', authenticate, validate(createProductSchema), asyncHandler(productController.create));

module.exports = router;
