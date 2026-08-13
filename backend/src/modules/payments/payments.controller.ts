import { Request, Response, NextFunction } from 'express';
import { paymentsService } from './payments.service';

export class PaymentsController {
  async createPix(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentsService.createPix(req.user!.schoolId, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async createCardPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentsService.createCardPayment(req.user!.schoolId, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await paymentsService.handleWebhook(req.body);
      res.status(200).json({ success: true });
    } catch (error) { next(error); }
  }

  async infinitePayWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await paymentsService.handleInfinitePayWebhook(req.body);
      res.status(200).json({ success: true });
    } catch (error) { next(error); }
  }

  async recharge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentsService.recharge(req.user!.schoolId, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await paymentsService.getHistory(
        req.user!.schoolId,
        req.params.studentId,
        req.query as any
      );
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async approvePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await paymentsService.approvePaymentManually(req.user!.schoolId, req.params.transactionId);
      res.json({ success: true, message: 'Pagamento aprovado manualmente com sucesso' });
    } catch (error) { next(error); }
  }
}

export const paymentsController = new PaymentsController();
