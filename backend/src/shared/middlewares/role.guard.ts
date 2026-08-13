import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../utils/jwt';

/**
 * Factory that creates a middleware restricting access to specific roles.
 * Must be used AFTER authGuard.
 *
 * @example
 * router.get('/admin-only', authGuard, roleGuard('admin'), handler);
 * router.get('/staff', authGuard, roleGuard('admin', 'operator'), handler);
 */
export function roleGuard(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Autenticação necessária',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Acesso negado. Perfis permitidos: ${allowedRoles.join(', ')}`,
        },
      });
      return;
    }

    next();
  };
}
