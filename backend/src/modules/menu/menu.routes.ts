import { Router, type IRouter } from 'express';
import { menuController } from './menu.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate } from '../../shared/middlewares/validate';
import { updateMenuAvailabilitySchema } from './menu.schema';

const router: IRouter = Router();

router.use(authGuard);

router.get(
  '/today',
  roleGuard('admin', 'operator', 'student', 'guardian'),
  menuController.getToday.bind(menuController)
);

router.put(
  '/availability',
  roleGuard('admin', 'operator'),
  validate(updateMenuAvailabilitySchema),
  menuController.updateAvailability.bind(menuController)
);

router.get(
  '/promotions',
  roleGuard('admin', 'operator', 'student', 'guardian'),
  menuController.getPromotions.bind(menuController)
);

export { router as menuRoutes };
