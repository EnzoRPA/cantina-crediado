import { Request, Response, NextFunction } from 'express';
import { studentsService } from './students.service';
import * as xlsx from 'xlsx';

export class StudentsController {
  /** GET /api/students */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await studentsService.list(req.user!.schoolId, req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/students/:id */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const student = await studentsService.getById(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: { student } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/students */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const student = await studentsService.create(req.user!.schoolId, req.body);
      res.status(201).json({ success: true, data: { student } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/students/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const student = await studentsService.update(req.user!.schoolId, req.params.id, req.body);
      res.json({ success: true, data: { student } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/students/:id/balance */
  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await studentsService.getBalance(req.user!.schoolId, req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/students/:id/balance */
  async adjustBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await studentsService.adjustBalance(
        req.user!.schoolId,
        req.params.id,
        req.body,
        req.user!.userId
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/students/:id/transactions */
  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await studentsService.getTransactions(
        req.user!.schoolId,
        req.params.id,
        page,
        limit
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/students/import */
  async importSpreadsheet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
         res.status(400).json({ success: false, error: { message: 'Nenhum arquivo enviado' } });
         return;
      }

      const schoolId = req.user!.schoolId;
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      const result = await studentsService.importStudents(schoolId, rows);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/students/import/revert */
  async revertSpreadsheet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const revertedCount = await studentsService.revertLastImport(schoolId);
      res.json({ success: true, data: { reverted: revertedCount } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/students/:id/marketing */
  async updateMarketingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const student = await studentsService.updateMarketingStatus(
        req.user!.schoolId,
        req.params.id,
        req.body.isMarketingSent
      );
      res.json({ success: true, data: { student } });
    } catch (error) {
      next(error);
    }
  }
}

export const studentsController = new StudentsController();
