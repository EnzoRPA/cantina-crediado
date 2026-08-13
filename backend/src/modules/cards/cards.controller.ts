import { Request, Response, NextFunction } from 'express';
import { cardsService } from './cards.service';

export class CardsController {
  /** GET /api/cards */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await cardsService.list(req.user!.schoolId, req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/cards */
  async issue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const card = await cardsService.issue(req.user!.schoolId, req.body);
      res.status(201).json({ success: true, data: { card } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/cards/:code/student */
  async getStudentByCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const student = await cardsService.getStudentByCardCode(req.params.code);
      res.json({ success: true, data: { student } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/cards/:id/block */
  async block(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const card = await cardsService.block(req.user!.schoolId, req.params.id, req.body);
      res.json({ success: true, data: { card } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/cards/:id/unblock */
  async unblock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const card = await cardsService.unblock(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { card } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/cards/:id */
  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await cardsService.deactivate(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { message: 'Cartão desativado com sucesso' } });
    } catch (error) {
      next(error);
    }
  }
}

export const cardsController = new CardsController();
