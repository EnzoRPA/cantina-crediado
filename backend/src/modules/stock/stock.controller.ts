import { Request, Response, NextFunction } from 'express';
import { stockService } from './stock.service';

export class StockController {
  /** GET /api/stock/movements */
  async listMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await stockService.listMovements(req.user!.schoolId, req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/stock/movements */
  async createMovement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const movement = await stockService.createMovement(
        req.user!.schoolId,
        req.body,
        req.user!.userId
      );
      res.status(201).json({ success: true, data: { movement } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/stock/alerts */
  async getAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alerts = await stockService.getAlerts(req.user!.schoolId);
      res.json({ success: true, data: { alerts, count: alerts.length } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/stock/report/cmv */
  async getCMVReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'startDate e endDate são obrigatórios' },
        });
        return;
      }

      const report = await stockService.getCMVReport(
        req.user!.schoolId,
        startDate as string,
        endDate as string
      );
      res.json({ success: true, data: { report } });
    } catch (error) {
      next(error);
    }
  }
}

export const stockController = new StockController();
