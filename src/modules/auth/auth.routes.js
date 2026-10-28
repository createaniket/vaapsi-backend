const { Router } = require('express');
const { authController } = require('./auth.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../utils/asyncHandler');
const {
  registerSchema, loginSchema, requestOtpSchema, verifyOtpSchema, refreshSchema,
} = require('./auth.schema');

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(authController.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post('/otp/request', authLimiter, validate(requestOtpSchema), asyncHandler(authController.requestOtp));
router.post('/otp/verify', authLimiter, validate(verifyOtpSchema), asyncHandler(authController.verifyOtp));
router.post('/refresh', validate(refreshSchema), asyncHandler(authController.refresh));
router.post('/logout', validate(refreshSchema), asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));

module.exports = router;
