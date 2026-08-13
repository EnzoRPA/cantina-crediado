import { Router, type IRouter } from 'express';
import { authController } from './auth.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { authLimiter } from '../../shared/middlewares/rate-limit';
import { validate } from '../../shared/middlewares/validate';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  verify2FASchema,
  changePasswordSchema,
  registerGuardianSchema,
} from './auth.schema';

const router: IRouter = Router();

// ---- Public routes (with auth rate limiter) ----

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login.bind(authController)
);

router.post(
  '/refresh',
  authLimiter,
  validate(refreshTokenSchema),
  authController.refresh.bind(authController)
);

router.post(
  '/register-guardian',
  authLimiter,
  validate(registerGuardianSchema),
  authController.registerGuardian.bind(authController)
);

// ---- Protected routes ----

router.post(
  '/register',
  authGuard,
  roleGuard('admin'),
  validate(registerSchema),
  authController.register.bind(authController)
);

router.post(
  '/logout',
  validate(refreshTokenSchema),
  authController.logout.bind(authController)
);

router.post(
  '/logout-all',
  authGuard,
  authController.logoutAll.bind(authController)
);

router.get(
  '/profile',
  authGuard,
  authController.getProfile.bind(authController)
);

router.post(
  '/change-password',
  authGuard,
  validate(changePasswordSchema),
  authController.changePassword.bind(authController)
);

// ---- 2FA routes ----

router.post(
  '/2fa/setup',
  authGuard,
  authController.setup2FA.bind(authController)
);

router.post(
  '/2fa/confirm',
  authGuard,
  validate(verify2FASchema),
  authController.confirm2FA.bind(authController)
);

router.post(
  '/2fa/verify',
  authGuard,
  authLimiter,
  validate(verify2FASchema),
  authController.verify2FA.bind(authController)
);

router.post(
  '/2fa/disable',
  authGuard,
  authController.disable2FA.bind(authController)
);

export { router as authRoutes };
