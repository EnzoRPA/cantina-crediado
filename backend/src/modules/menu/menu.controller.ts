import { Request, Response, NextFunction } from 'express';
import { menuService } from './menu.service';

export class MenuController {
  async getToday(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menu = await menuService.getToday(req.user!.schoolId);
      res.json({ success: true, data: { menu } });
    } catch (error) { next(error); }
  }

  async updateAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await menuService.updateAvailability(req.user!.schoolId, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async getPromotions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const promotions = await menuService.getPromotions(req.user!.schoolId);
      res.json({ success: true, data: { promotions } });
    } catch (error) { next(error); }
  }
}

export const menuController = new MenuController();
