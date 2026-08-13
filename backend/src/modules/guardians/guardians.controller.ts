import { Request, Response, NextFunction } from 'express';
import { guardiansService } from './guardians.service';

export class GuardiansController {
  /** GET /api/guardians */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await guardiansService.list(req.user!.schoolId, req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/guardians/:id */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const guardian = await guardiansService.getById(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { guardian } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/guardians */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const guardian = await guardiansService.create(req.user!.schoolId, req.body);
      res.status(201).json({ success: true, data: { guardian } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/guardians/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const guardian = await guardiansService.update(req.user!.schoolId, req.params.id, req.body);
      res.json({ success: true, data: { guardian } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/guardians/:id/students */
  async linkStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await guardiansService.linkStudent(req.user!.schoolId, req.params.id, req.body);
      res.status(201).json({
        success: true,
        data: { message: 'Aluno vinculado com sucesso' },
      });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/guardians/:id/students/:studentId */
  async unlinkStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await guardiansService.unlinkStudent(
        req.user!.schoolId,
        req.params.id,
        req.params.studentId
      );
      res.json({
        success: true,
        data: { message: 'Vínculo removido com sucesso' },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/guardians/me/students */
  async myStudents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const students = await guardiansService.myStudents(req.user!.userId, req.user!.schoolId);
      res.json({ success: true, data: { students } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/guardians/me/students */
  async linkStudentSelfService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { enrollmentNumber, birthDate } = req.body;
      await guardiansService.linkStudentSelfService(
        req.user!.userId,
        req.user!.schoolId,
        enrollmentNumber,
        birthDate
      );
      res.status(201).json({
        success: true,
        data: { message: 'Estudante vinculado com sucesso' }
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/guardians/me/students/:studentId/transactions */
  async studentTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await guardiansService.studentTransactions(
        req.user!.userId,
        req.user!.schoolId,
        req.params.studentId,
        page,
        limit
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const guardiansController = new GuardiansController();
