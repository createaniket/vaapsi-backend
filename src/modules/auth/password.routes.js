const { Router } = require('express');
const { passwordController } = require('./password.controller');
const { validate } = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../utils/asyncHandler');
const { forgotPasswordSchema, resetPasswordSchema } = require('./password.schema');

/**
 * Password reset, mounted at /auth/password.
 *
 * Both routes sit behind `authLimiter` — the same 20-per-15-minutes window as
 * sign-in. `forgot` needs it because each call sends mail to a third party, so
 * an unlimited endpoint is a way to use us to spam someone. `reset` needs it
 * because the code is six digits: the per-code attempt cap stops a brute force
 * against one code, and the rate limit stops one that cycles through codes by
 * requesting new ones.
 */
const router = Router();

router.post('/forgot', authLimiter, validate(forgotPasswordSchema), asyncHandler(passwordController.forgot));
router.post('/reset', authLimiter, validate(resetPasswordSchema), asyncHandler(passwordController.reset));

module.exports = router;
