import { Router, type IRouter } from 'express';
import { dailyLimitsController } from './daily-limits.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateParams } from '../../shared/middlewares/validate';
import {
  upsertDailyLimitSchema,
  checkLimitSchema,
  studentIdParamSchema,
} from './daily-limits.schema';

const router: IRouter = Router();

router.use(authGuard);

router.get(
  '/:studentId',
  roleGuard('admin', 'manager', 'guardian'),
  validateParams(studentIdParamSchema),
  dailyLimitsController.getByStudentId.bind(dailyLimitsController)
);

router.put(
  '/:studentId',
  roleGuard('admin', 'manager', 'guardian'),
  validateParams(studentIdParamSchema),
  validate(upsertDailyLimitSchema),
  dailyLimitsController.upsert.bind(dailyLimitsController)
);

// Operators also need this to check during PDV sales
router.post(
  '/:studentId/check',
  roleGuard('admin', 'manager', 'operator', 'guardian'),
  validateParams(studentIdParamSchema),
  validate(checkLimitSchema),
  dailyLimitsController.checkPurchase.bind(dailyLimitsController)
);

router.delete(
  '/:studentId',
  roleGuard('admin', 'manager', 'guardian'),

  validateParams(studentIdParamSchema),
  dailyLimitsController.delete.bind(dailyLimitsController)
);

export { router as dailyLimitsRoutes };
