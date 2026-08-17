import { Router, type IRouter } from 'express';
import { studentsController } from './students.controller';
import multer from 'multer';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateQuery, validateParams } from '../../shared/middlewares/validate';
import {
  listStudentsSchema,
  createStudentSchema,
  updateStudentSchema,
  adjustBalanceSchema,
  studentIdParamSchema,
} from './students.schema';

const upload = multer({ storage: multer.memoryStorage() });

const router: IRouter = Router();

// All routes require authentication
router.use(authGuard);

router.get(
  '/',
  roleGuard('admin', 'manager', 'operator'),
  validateQuery(listStudentsSchema),
  studentsController.list.bind(studentsController)
);

router.post(
  '/import',
  roleGuard('admin', 'manager'),
  upload.single('file'),
  studentsController.importSpreadsheet.bind(studentsController)
);

router.delete(
  '/import/revert',
  roleGuard('admin', 'manager'),
  studentsController.revertSpreadsheet.bind(studentsController)
);

router.get(
  '/:id',
  roleGuard('admin', 'manager', 'operator'),
  validateParams(studentIdParamSchema),
  studentsController.getById.bind(studentsController)
);

router.post(
  '/',
  roleGuard('admin', 'manager'),
  validate(createStudentSchema),
  studentsController.create.bind(studentsController)
);

router.put(
  '/:id',
  roleGuard('admin', 'manager'),
  validateParams(studentIdParamSchema),
  validate(updateStudentSchema),
  studentsController.update.bind(studentsController)
);

router.delete(
  '/:id',
  roleGuard('admin', 'manager'),
  validateParams(studentIdParamSchema),
  studentsController.delete.bind(studentsController)
);

router.put(
  '/:id/marketing',
  roleGuard('admin', 'manager'),
  validateParams(studentIdParamSchema),
  studentsController.updateMarketingStatus.bind(studentsController)
);

router.get(
  '/:id/balance',
  roleGuard('admin', 'manager', 'operator', 'guardian'),
  validateParams(studentIdParamSchema),
  studentsController.getBalance.bind(studentsController)
);

router.post(
  '/:id/balance',
  roleGuard('admin', 'manager', 'guardian'),
  validateParams(studentIdParamSchema),
  validate(adjustBalanceSchema),
  studentsController.adjustBalance.bind(studentsController)
);

router.get(
  '/:id/transactions',
  roleGuard('admin', 'manager', 'operator', 'guardian'),

  validateParams(studentIdParamSchema),
  studentsController.getTransactions.bind(studentsController)
);

export { router as studentsRoutes };
