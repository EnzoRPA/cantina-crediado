import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';

export class AuthController {
  /**
   * POST /api/auth/register
   * Admin-only: create a new user.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/register-guardian
   * Public: register a guardian self-service.
   */
  async registerGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.registerGuardian(req.body, deviceInfo);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.login(req.body, deviceInfo);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.refreshToken(refreshToken, deviceInfo);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);

      res.json({
        success: true,
        data: { message: 'Logout realizado com sucesso' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout-all
   * Revokes all sessions for the authenticated user.
   */
  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.logoutAll(req.user!.userId);

      res.json({
        success: true,
        data: { message: 'Todas as sessões foram encerradas' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/2fa/setup
   * Returns secret + QR code URI for TOTP setup.
   */
  async setup2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.setup2FA(req.user!.userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/2fa/confirm
   * Confirms 2FA setup with a verification code.
   */
  async confirm2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.confirm2FA(req.user!.userId, req.body.code);

      res.json({
        success: true,
        data: { message: 'Autenticação de dois fatores ativada com sucesso' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/2fa/verify
   * Verifies 2FA code during login.
   */
  async verify2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.verify2FA(req.user!.userId, req.body, deviceInfo);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/2fa/disable
   */
  async disable2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.disable2FA(req.user!.userId, req.body.password);

      res.json({
        success: true,
        data: { message: 'Autenticação de dois fatores desativada' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/change-password
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.changePassword(req.user!.userId, req.body);

      res.json({
        success: true,
        data: { message: 'Senha alterada com sucesso. Todas as sessões foram encerradas.' },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getProfile(req.user!.userId);

      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
