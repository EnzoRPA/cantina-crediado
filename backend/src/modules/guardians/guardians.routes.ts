import { Router, type IRouter } from 'express';
import { guardiansController } from './guardians.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateQuery, validateParams } from '../../shared/middlewares/validate';
import {
  listGuardiansSchema,
  createGuardianSchema,
  updateGuardianSchema,
  linkStudentSchema,
  guardianIdParamSchema,
  linkStudentSelfServiceSchema,
} from './guardians.schema';

const router: IRouter = Router();

router.use(authGuard);

// ===== SELF-SERVICE GUARDIAN ROUTES (must come BEFORE /:id routes) =====
// These routes allow a logged-in guardian or admin to see their own data
router.get(
  '/me/students',
  roleGuard('admin', 'guardian'),
  guardiansController.myStudents.bind(guardiansController)
);

router.post(
  '/me/students',
  roleGuard('admin', 'guardian'),
  validate(linkStudentSelfServiceSchema),
  guardiansController.linkStudentSelfService.bind(guardiansController)
);

router.get(
  '/me/students/:studentId/transactions',
  roleGuard('admin', 'guardian'),
  guardiansController.studentTransactions.bind(guardiansController)
);

// ===== ADMIN ROUTES =====
router.get(
  '/',
  roleGuard('admin'),
  validateQuery(listGuardiansSchema),
  guardiansController.list.bind(guardiansController)
);

router.get(
  '/:id',
  roleGuard('admin'),
  validateParams(guardianIdParamSchema),
  guardiansController.getById.bind(guardiansController)
);

router.post(
  '/',
  roleGuard('admin'),
  validate(createGuardianSchema),
  guardiansController.create.bind(guardiansController)
);

router.put(
  '/:id',
  roleGuard('admin'),
  validateParams(guardianIdParamSchema),
  validate(updateGuardianSchema),
  guardiansController.update.bind(guardiansController)
);

router.post(
  '/:id/students',
  roleGuard('admin'),
  validateParams(guardianIdParamSchema),
  validate(linkStudentSchema),
  guardiansController.linkStudent.bind(guardiansController)
);

router.delete(
  '/:id/students/:studentId',
  roleGuard('admin'),
  guardiansController.unlinkStudent.bind(guardiansController)
);

export { router as guardiansRoutes };
