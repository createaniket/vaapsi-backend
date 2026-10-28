const { Router } = require('express');
const { cartController } = require('./cart.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const { addItemSchema, checkoutSchema } = require('./cart.schema');

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(cartController.getCart));
router.post('/items', validate(addItemSchema), asyncHandler(cartController.addItem));
router.delete('/items/:listingId', asyncHandler(cartController.removeItem));
router.post('/checkout', validate(checkoutSchema), asyncHandler(cartController.checkout));

// Orders (buyer view)
router.get('/orders', asyncHandler(cartController.listOrders));
router.get('/orders/:id', asyncHandler(cartController.getOrder));

module.exports = router;
