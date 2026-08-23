import { Router, type IRouter } from 'express';
import { posController } from './pos.controller';
import { authGuard } from '../../shared/middlewares/auth.guard';
import { roleGuard } from '../../shared/middlewares/role.guard';
import { posLimiter } from '../../shared/middlewares/rate-limit';
import { validate, validateQuery, validateParams } from '../../shared/middlewares/validate';
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  cashRegisterMovementSchema,
  createTransactionSchema,
  cancelTransactionSchema,
  batchSyncSchema,
  listTransactionsSchema,
  transactionIdParamSchema,
  createManualOnCreditSchema,
  updateOnCreditTransactionSchema,
  batchManualOnCreditSchema,
} from './pos.schema';

const router: IRouter = Router();


router.use(authGuard);
router.use(posLimiter);

// ---- Cash Register ----

router.post(
  '/cash-register/open',
  roleGuard('admin', 'operator'),
  validate(openCashRegisterSchema),
  posController.openCashRegister.bind(posController)
);

router.post(
  '/cash-register/close',
  roleGuard('admin', 'operator'),
  validate(closeCashRegisterSchema),
  posController.closeCashRegister.bind(posController)
);

router.get(
  '/cash-register/current',
  roleGuard('admin', 'operator'),
  posController.getCurrentRegister.bind(posController)
);

router.post(
  '/cash-register/movement',
  roleGuard('admin', 'operator'),
  validate(cashRegisterMovementSchema),
  posController.addMovement.bind(posController)
);

// ---- Transactions ----

router.post(
  '/transactions',
  roleGuard('admin', 'operator'),
  validate(createTransactionSchema),
  posController.createTransaction.bind(posController)
);

router.get(
  '/transactions',
  roleGuard('admin', 'operator'),
  validateQuery(listTransactionsSchema),
  posController.listTransactions.bind(posController)
);

router.get(
  '/transactions/:id',
  roleGuard('admin', 'operator'),
  validateParams(transactionIdParamSchema),
  posController.getTransaction.bind(posController)
);

router.post(
  '/transactions/:id/cancel',
  roleGuard('admin'),
  validateParams(transactionIdParamSchema),
  validate(cancelTransactionSchema),
  posController.cancelTransaction.bind(posController)
);

// ---- Offline Sync ----

router.post(
  '/transactions/batch',
  roleGuard('admin', 'operator'),
  validate(batchSyncSchema),
  posController.batchSync.bind(posController)
);

// ---- Reports ----

router.get(
  '/shift-report',
  roleGuard('admin', 'operator'),
  posController.getShiftReport.bind(posController)
);

// ---- On Credit (A Prazo / Crediário) ----

router.get(
  '/on-credit/debts',
  roleGuard('admin', 'manager', 'operator'),
  posController.listOnCreditDebts.bind(posController)
);

router.get(
  '/on-credit/debts/:studentId',
  roleGuard('admin', 'manager', 'operator'),
  posController.getStudentOnCreditDetails.bind(posController)
);

router.post(
  '/on-credit/debts/:studentId/pay',
  roleGuard('admin', 'manager', 'operator'),
  posController.settleStudentDebt.bind(posController)
);

router.get(
  '/on-credit/recent-consumers',
  roleGuard('admin', 'manager', 'operator'),
  posController.getRecentConsumers.bind(posController)
);

router.post(
  '/on-credit/manual-batch',
  roleGuard('admin', 'manager', 'operator'),
  validate(batchManualOnCreditSchema),
  posController.createBatchManualOnCredit.bind(posController)
);

router.post(
  '/on-credit/manual',
  roleGuard('admin', 'manager', 'operator'),
  validate(createManualOnCreditSchema),

  posController.createManualOnCreditDebt.bind(posController)
);


router.put(
  '/on-credit/transactions/:transactionId',
  roleGuard('admin', 'operator'),
  validate(updateOnCreditTransactionSchema),
  posController.updateOnCreditTransaction.bind(posController)
);

router.delete(
  '/on-credit/transactions/:transactionId',
  roleGuard('admin', 'operator'),
  posController.deleteOnCreditTransaction.bind(posController)
);

router.post(
  '/on-credit/scan-sheet',
  roleGuard('admin', 'manager', 'operator'),
  posController.scanSheet.bind(posController)
);

router.post(
  '/backup/run',
  roleGuard('admin'),
  posController.triggerBackup.bind(posController)
);

router.get(
  '/backup/list',
  roleGuard('admin'),
  posController.getBackups.bind(posController)
);

router.post(
  '/reset-test-sales',
  roleGuard('admin'),
  posController.resetTestSales.bind(posController)
);

export { router as posRoutes };
