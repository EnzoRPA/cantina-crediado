import { Router, type IRouter } from 'express';
import { paymentsController } from './payments.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { validate, validateQuery, validateParams } from '../../shared/middlewares/validate';
import {
  createPixSchema,
  createCardPaymentSchema,
  webhookSchema,
  rechargeSchema,
  paymentHistorySchema,
  studentIdParamSchema,
} from './payments.schema';

const router: IRouter = Router();

// Webhook is public (called by Mercado Pago)
router.post(
  '/webhook',
  validate(webhookSchema),
  paymentsController.webhook.bind(paymentsController)
);

// Webhook is public (called by InfinitePay)
router.post(
  '/webhook/infinitepay',
  paymentsController.infinitePayWebhook.bind(paymentsController)
);

// All other routes require auth
router.use(authGuard);

router.post(
  '/pix',
  roleGuard('admin', 'operator'),
  validate(createPixSchema),
  paymentsController.createPix.bind(paymentsController)
);

router.post(
  '/card',
  roleGuard('admin', 'operator'),
  validate(createCardPaymentSchema),
  paymentsController.createCardPayment.bind(paymentsController)
);

router.post(
  '/recharge',
  roleGuard('admin', 'guardian'),
  validate(rechargeSchema),
  paymentsController.recharge.bind(paymentsController)
);

router.get(
  '/history/:studentId',
  roleGuard('admin', 'guardian'),
  validateParams(studentIdParamSchema),
  validateQuery(paymentHistorySchema),
  paymentsController.getHistory.bind(paymentsController)
);

router.post(
  '/transactions/:transactionId/approve',
  roleGuard('admin', 'operator'),
  paymentsController.approvePayment.bind(paymentsController)
);

export { router as paymentsRoutes };
