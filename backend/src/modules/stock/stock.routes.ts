import { Router, type IRouter } from 'express';
import { stockController } from './stock.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateQuery } from '../../shared/middlewares/validate';
import { listMovementsSchema, createMovementSchema } from './stock.schema';

const router: IRouter = Router();

router.use(authGuard);

router.get(
  '/movements',
  roleGuard('admin', 'manager', 'operator'),
  validateQuery(listMovementsSchema),
  stockController.listMovements.bind(stockController)
);

router.post(
  '/movements',
  roleGuard('admin', 'manager'),
  validate(createMovementSchema),
  stockController.createMovement.bind(stockController)
);

router.get(
  '/alerts',
  roleGuard('admin', 'manager', 'operator'),
  stockController.getAlerts.bind(stockController)
);

router.get(
  '/report/cmv',
  roleGuard('admin'),

  stockController.getCMVReport.bind(stockController)
);

export { router as stockRoutes };
