import { Router, type IRouter } from 'express';
import { facialController } from './facial.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateParams } from '../../shared/middlewares/validate';
import {
  registerFacialSchema,
  recognizeFacialSchema,
  studentIdParamSchema,
} from './facial.schema';

const router: IRouter = Router();

router.use(authGuard);

router.post(
  '/register',
  roleGuard('admin', 'manager'),
  validate(registerFacialSchema),
  facialController.register.bind(facialController)
);

router.post(
  '/recognize',
  roleGuard('admin', 'manager', 'operator'),
  validate(recognizeFacialSchema),
  facialController.recognize.bind(facialController)
);

router.delete(
  '/:studentId',
  roleGuard('admin', 'manager'),

  validateParams(studentIdParamSchema),
  facialController.delete.bind(facialController)
);

export { router as facialRoutes };
