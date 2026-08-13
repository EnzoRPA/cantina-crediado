import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';

export class UsersController {
  /** GET /api/users */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.list(req.user!.schoolId, req.query as any);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/users/:id */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.getById(req.user!.schoolId, req.params.id);

      res.json({ success: true, data: { user } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/users */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.create(req.user!.schoolId, req.body);

      res.status(201).json({ success: true, data: { user } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/users/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.update(req.user!.schoolId, req.params.id, req.body);

      res.json({ success: true, data: { user } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/users/:id */
  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await usersService.deactivate(req.user!.schoolId, req.params.id);

      res.json({ success: true, data: { message: 'Usuário desativado com sucesso' } });
    } catch (error) {
      next(error);
    }
  }
}

export const usersController = new UsersController();
