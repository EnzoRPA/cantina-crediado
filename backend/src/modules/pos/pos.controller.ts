import { Request, Response, NextFunction } from 'express';
import { posService } from './pos.service';

export class PosController {
  // ---- Cash Register ----

  async openCashRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const register = await posService.openCashRegister(
        req.user!.schoolId, req.user!.userId, req.body
      );
      res.status(201).json({ success: true, data: { register } });
    } catch (error) { next(error); }
  }

  async closeCashRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const register = await posService.closeCashRegister(
        req.user!.schoolId, req.user!.userId, req.body
      );
      res.json({ success: true, data: { register } });
    } catch (error) { next(error); }
  }

  async getCurrentRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const register = await posService.getCurrentRegister(
        req.user!.schoolId, req.user!.userId
      );
      res.json({ success: true, data: { register } });
    } catch (error) { next(error); }
  }

  async addMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movement = await posService.addCashRegisterMovement(
        req.user!.schoolId, req.user!.userId, req.body
      );
      res.status(201).json({ success: true, data: { movement } });
    } catch (error) { next(error); }
  }

  // ---- Transactions ----

  async createTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await posService.createTransaction(
        req.user!.schoolId, req.user!.userId, req.body
      );
      res.status(201).json({ success: true, data: { transaction } });
    } catch (error) { next(error); }
  }

  async listTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await posService.listTransactions(
        req.user!.schoolId, req.query as any
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await posService.getTransaction(
        req.user!.schoolId, req.params.id
      );
      res.json({ success: true, data: { transaction } });
    } catch (error) { next(error); }
  }

  async cancelTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await posService.cancelTransaction(
        req.user!.schoolId, req.params.id, req.body, req.user!.userId
      );
      res.json({ success: true, data: { transaction } });
    } catch (error) { next(error); }
  }

  async batchSync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await posService.batchSync(
        req.user!.schoolId, req.user!.userId, req.body.transactions
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getShiftReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await posService.getShiftReport(
        req.user!.schoolId, req.user!.userId
      );
      res.json({ success: true, data: { report } });
    } catch (error) { next(error); }
  }

  async listOnCreditDebts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { debts, totals } = await posService.listOnCreditDebts(req.user!.schoolId);
      res.json({ success: true, data: { debts, totals } });
    } catch (error) { next(error); }
  }

  async getStudentOnCreditDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const details = await posService.getStudentOnCreditDetails(req.user!.schoolId, req.params.studentId);
      res.json({ success: true, data: details });
    } catch (error) { next(error); }
  }

  async settleStudentDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { paymentMethod, amount, date } = req.body;
      const result = await posService.settleStudentDebt(
        req.user!.schoolId,
        req.params.studentId,
        paymentMethod,
        req.user!.userId,
        amount ? Number(amount) : undefined,
        date
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async resetTestSales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { preserveStudentNames } = req.body || {};
      const names = Array.isArray(preserveStudentNames) && preserveStudentNames.length > 0
        ? preserveStudentNames
        : ['Anna Julia', 'Alanna Xavier'];
      const result = await posService.resetTestSales(req.user!.schoolId, names);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async createManualOnCreditDebt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await posService.createManualOnCreditDebt(
        req.user!.schoolId,
        req.user!.userId,
        req.body
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async updateOnCreditTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await posService.updateOnCreditTransaction(
        req.user!.schoolId,
        req.params.transactionId,
        req.body
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async deleteOnCreditTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await posService.deleteOnCreditTransaction(
        req.user!.schoolId,
        req.params.transactionId
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getRecentConsumers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startDate = (req.query.startDate || req.query.date) as string | undefined;
      const endDate = (req.query.endDate || req.query.date) as string | undefined;
      const consumers = await posService.getRecentConsumers(req.user!.schoolId, startDate, endDate);
      res.json({ success: true, data: { consumers } });
    } catch (error) { next(error); }
  }

  async createBatchManualOnCredit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await posService.createBatchManualOnCredit(
        req.user!.schoolId,
        req.user!.userId,
        req.body
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

export const posController = new PosController();

