import { Router, type IRouter } from 'express';
import { usersController } from './users.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate } from '../../shared/middlewares/validate';
import { validateQuery, validateParams } from '../../shared/middlewares/validate';
import { createUserSchema, updateUserSchema, listUsersSchema, userIdParamSchema } from './users.schema';

const router: IRouter = Router();

// All routes require authentication + admin role
router.use(authGuard);
router.use(roleGuard('admin'));

router.get(
  '/',
  validateQuery(listUsersSchema),
  usersController.list.bind(usersController)
);

router.get(
  '/:id',
  validateParams(userIdParamSchema),
  usersController.getById.bind(usersController)
);

router.post(
  '/',
  validate(createUserSchema),
  usersController.create.bind(usersController)
);

router.put(
  '/:id',
  validateParams(userIdParamSchema),
  validate(updateUserSchema),
  usersController.update.bind(usersController)
);

router.delete(
  '/:id',
  validateParams(userIdParamSchema),
  usersController.deactivate.bind(usersController)
);

export { router as usersRoutes };
