import { Router, type IRouter } from 'express';
import { cardsController } from './cards.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateQuery, validateParams } from '../../shared/middlewares/validate';
import {
  listCardsSchema,
  issueCardSchema,
  blockCardSchema,
  cardIdParamSchema,
  cardCodeParamSchema,
} from './cards.schema';

const router: IRouter = Router();

router.use(authGuard);

router.get(
  '/',
  roleGuard('admin', 'manager', 'operator'),
  validateQuery(listCardsSchema),
  cardsController.list.bind(cardsController)
);

router.post(
  '/',
  roleGuard('admin', 'manager'),
  validate(issueCardSchema),
  cardsController.issue.bind(cardsController)
);

// PDV uses this to identify student — operators need access
router.get(
  '/:code/student',
  roleGuard('admin', 'manager', 'operator'),
  validateParams(cardCodeParamSchema),
  cardsController.getStudentByCard.bind(cardsController)
);

router.post(
  '/:id/block',
  roleGuard('admin', 'manager'),
  validateParams(cardIdParamSchema),
  validate(blockCardSchema),
  cardsController.block.bind(cardsController)
);

router.post(
  '/:id/unblock',
  roleGuard('admin', 'manager'),
  validateParams(cardIdParamSchema),
  cardsController.unblock.bind(cardsController)
);

router.delete(
  '/:id',
  roleGuard('admin', 'manager'),

  validateParams(cardIdParamSchema),
  cardsController.deactivate.bind(cardsController)
);

export { router as cardsRoutes };
