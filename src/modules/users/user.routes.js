const { Router } = require('express');
const { userController } = require('./user.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/asyncHandler');
const { updateProfileSchema, updatePrefsSchema } = require('./user.schema');

const router = Router();
router.use(authenticate);

router.get('/me', asyncHandler(userController.profile));
router.patch('/me', validate(updateProfileSchema), asyncHandler(userController.updateProfile));
router.get('/me/notification-preferences', asyncHandler(userController.getPrefs));
router.patch('/me/notification-preferences', validate(updatePrefsSchema), asyncHandler(userController.updatePrefs));

module.exports = router;
