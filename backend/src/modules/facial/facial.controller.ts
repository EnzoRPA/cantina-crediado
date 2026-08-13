import { Request, Response, NextFunction } from 'express';
import { facialService } from './facial.service';

export class FacialController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log('[Facial] Register request:', { studentId: req.body.studentId, descriptorLen: req.body.descriptor?.length, schoolId: req.user?.schoolId });
      const result = await facialService.register(req.user!.schoolId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error: any) { console.error('[Facial] Register ERROR:', error.message, error.stack); next(error); }
  }

  async recognize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await facialService.recognize(req.user!.schoolId, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await facialService.delete(req.user!.schoolId, req.params.studentId);
      res.json({ success: true, data: { message: 'Dados faciais removidos com sucesso (LGPD)' } });
    } catch (error) { next(error); }
  }
}

export const facialController = new FacialController();
