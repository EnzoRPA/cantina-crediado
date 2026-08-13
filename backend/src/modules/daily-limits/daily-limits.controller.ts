import { Request, Response, NextFunction } from 'express';
import { dailyLimitsService } from './daily-limits.service';

export class DailyLimitsController {
  /** GET /api/daily-limits/:studentId */
  async getByStudentId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = await dailyLimitsService.getByStudentId(
        req.user!.schoolId,
        req.params.studentId
      );
      res.json({ success: true, data: { limit } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/daily-limits/:studentId */
  async upsert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = await dailyLimitsService.upsert(
        req.user!.schoolId,
        req.params.studentId,
        req.body,
        req.user!.userId
      );
      res.json({ success: true, data: { limit } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/daily-limits/:studentId/check */
  async checkPurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await dailyLimitsService.checkPurchase(
        req.user!.schoolId,
        req.params.studentId,
        req.body
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/daily-limits/:studentId */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await dailyLimitsService.delete(req.user!.schoolId, req.params.studentId);
      res.json({ success: true, data: { message: 'Limite diário removido' } });
    } catch (error) {
      next(error);
    }
  }
}

export const dailyLimitsController = new DailyLimitsController();
