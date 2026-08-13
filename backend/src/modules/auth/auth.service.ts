import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { db } from '../../shared/database/knex';
import { signAccessToken, parseExpiry } from '../../shared/utils/jwt';
import { hashToken, generateToken } from '../../shared/utils/encryption';
import { AppError, Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import { config } from '../../config';
import type { RegisterInput, LoginInput, Verify2FAInput, ChangePasswordInput, RegisterGuardianInput } from './auth.schema';

const SALT_ROUNDS = 10;

export class AuthService {
  /**
   * Register a new user.
   * Only admins can create users (enforced by controller).
   */
  async register(input: RegisterInput): Promise<{ user: Record<string, any> }> {
    // Check if email already exists for this school
    const existing = await db('users')
      .where({ email: input.email, school_id: input.schoolId })
      .first();

    if (existing) {
      throw Errors.conflict('Email já cadastrado nesta escola');
    }

    // Verify school exists
    const school = await db('schools').where({ id: input.schoolId }).first();
    if (!school) {
      throw Errors.notFound('Escola');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const [user] = await db('users')
      .insert({
        email: input.email,
        password_hash: passwordHash,
        name: input.name,
        role: input.role,
        phone: input.phone || null,
        school_id: input.schoolId,
      })
      .returning(['id', 'email', 'name', 'role', 'school_id', 'created_at']);

    logger.info({ userId: user.id, role: input.role }, 'User registered');

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        school_id: user.school_id,
        created_at: user.created_at,
      },
    };
  }

  /**
   * Register a new guardian and link to a student.
   * Auto-logs the user in and returns tokens.
   */
  async registerGuardian(
    input: RegisterGuardianInput,
    deviceInfo?: Record<string, unknown>
  ): Promise<{
    user: Record<string, any>;
    accessToken: string;
    refreshToken: string;
  }> {
    // 1. Verify school exists
    const school = await db('schools').where({ id: input.schoolId }).first();
    if (!school) {
      throw Errors.notFound('Escola não encontrada');
    }

    // 2. Verify student exists by enrollment number and birth date
    const formattedBirthDate = new Date(input.studentBirthDate).toISOString().split('T')[0];
    const student = await db('students')
      .where({
        enrollment_number: input.studentEnrollment,
        school_id: input.schoolId
      })
      .andWhere(db.raw('DATE(birth_date) = ?', [formattedBirthDate]))
      .first();

    if (!student) {
      throw Errors.notFound('Estudante não encontrado com a matrícula e data de nascimento informadas');
    }

    // 3. Check if email already exists
    const existing = await db('users')
      .where({ email: input.email, school_id: input.schoolId })
      .first();

    if (existing) {
      throw Errors.conflict('E-mail já cadastrado nesta escola');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const result = await db.transaction(async (trx) => {
      // 4. Create user
      const [user] = await trx('users')
        .insert({
          email: input.email,
          password_hash: passwordHash,
          name: input.name,
          role: 'guardian',
          phone: input.phone || null,
          school_id: input.schoolId,
        })
        .returning(['id', 'email', 'name', 'role', 'school_id', 'created_at']);

      // 5. Create guardian
      const [guardian] = await trx('guardians')
        .insert({
          user_id: user.id,
        })
        .returning(['id']);

      // 6. Link to student
      await trx('student_guardians').insert({
        student_id: student.id,
        guardian_id: guardian.id,
        relationship: 'parent',
        is_primary: true,
      });

      return user;
    });

    // 7. Auto-login: generate tokens
    const tokens = await this.generateTokens(result, deviceInfo);

    logger.info({ userId: result.id, studentId: student.id }, 'Guardian registered self-service');

    return {
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        school_id: result.school_id,
        created_at: result.created_at,
      },
      ...tokens,
    };
  }

  /**
   * Login with email and password.
   * Returns access token and refresh token.
   */
  async login(input: LoginInput, deviceInfo?: Record<string, unknown>): Promise<{
    user: Record<string, any>;
    accessToken: string;
    refreshToken: string;
    requiresTwoFactor: boolean;
  }> {
    const cleanEmail = input.email.trim().toLowerCase();
    const user = await db('users')
      .whereRaw('LOWER(email) = ?', [cleanEmail])
      .first();

    if (!user) {
      throw Errors.unauthorized('Email ou senha inválidos');
    }

    if (!user.is_active) {
      throw Errors.unauthorized('Conta desativada. Contate o administrador.');
    }

    const passwordValid = await bcrypt.compare(input.password, user.password_hash);
    if (!passwordValid) {
      throw Errors.unauthorized('Email ou senha inválidos');
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled) {
      // Return a temporary token for 2FA verification
      const tempToken = signAccessToken({
        userId: user.id,
        schoolId: user.school_id,
        role: user.role,
        email: user.email,
      });

      return {
        user: this.sanitizeUser(user),
        accessToken: tempToken,
        refreshToken: '',
        requiresTwoFactor: true,
      };
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user, deviceInfo);

    // Update last login
    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    logger.info({ userId: user.id }, 'User logged in');

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
      requiresTwoFactor: false,
    };
  }

  /**
   * Verify 2FA code and complete login.
   */
  async verify2FA(
    userId: string,
    input: Verify2FAInput,
    deviceInfo?: Record<string, unknown>
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await db('users').where({ id: userId }).first();

    if (!user || !user.two_factor_secret) {
      throw Errors.unauthorized('Usuário não encontrado ou 2FA não configurado');
    }

    const isValid = authenticator.verify({
      token: input.code,
      secret: user.two_factor_secret,
    });

    if (!isValid) {
      throw Errors.unauthorized('Código 2FA inválido');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user, deviceInfo);

    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    logger.info({ userId: user.id }, 'User completed 2FA');

    return { accessToken, refreshToken };
  }

  /**
   * Setup 2FA for a user. Returns the secret and QR code URI.
   */
  async setup2FA(userId: string): Promise<{
    secret: string;
    otpauthUrl: string;
  }> {
    const user = await db('users').where({ id: userId }).first();

    if (!user) {
      throw Errors.notFound('Usuário');
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Cantina Escolar', secret);

    // Store secret (not enabled yet until verified)
    await db('users').where({ id: userId }).update({
      two_factor_secret: secret,
    });

    return { secret, otpauthUrl };
  }

  /**
   * Confirm 2FA setup by verifying a code.
   */
  async confirm2FA(userId: string, code: string): Promise<void> {
    const user = await db('users').where({ id: userId }).first();

    if (!user || !user.two_factor_secret) {
      throw Errors.badRequest('2FA não foi configurado. Execute setup primeiro.');
    }

    const isValid = authenticator.verify({
      token: code,
      secret: user.two_factor_secret,
    });

    if (!isValid) {
      throw Errors.unauthorized('Código inválido. Tente novamente.');
    }

    await db('users').where({ id: userId }).update({
      two_factor_enabled: true,
    });

    logger.info({ userId }, '2FA enabled');
  }

  /**
   * Disable 2FA for a user.
   */
  async disable2FA(userId: string, password: string): Promise<void> {
    const user = await db('users').where({ id: userId }).first();

    if (!user) {
      throw Errors.notFound('Usuário');
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw Errors.unauthorized('Senha incorreta');
    }

    await db('users').where({ id: userId }).update({
      two_factor_secret: null,
      two_factor_enabled: false,
    });

    logger.info({ userId }, '2FA disabled');
  }

  /**
   * Refresh access token using a valid refresh token.
   * Implements token rotation: old refresh token is revoked, new one issued.
   */
  async refreshToken(token: string, deviceInfo?: Record<string, unknown>): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = hashToken(token);

    const storedToken = await db('refresh_tokens')
      .where({ token_hash: tokenHash, is_revoked: false })
      .first();

    if (!storedToken) {
      // Possible token reuse attack — revoke ALL tokens for this user
      logger.warn('Refresh token not found or already revoked. Possible reuse attack.');
      throw Errors.unauthorized('Refresh token inválido');
    }

    if (new Date(storedToken.expires_at) < new Date()) {
      await db('refresh_tokens').where({ id: storedToken.id }).update({ is_revoked: true });
      throw Errors.unauthorized('Refresh token expirado');
    }

    // Revoke old token (rotation)
    await db('refresh_tokens').where({ id: storedToken.id }).update({ is_revoked: true });

    const user = await db('users').where({ id: storedToken.user_id }).first();
    if (!user || !user.is_active) {
      throw Errors.unauthorized('Usuário não encontrado ou desativado');
    }

    // Generate new pair
    const result = await this.generateTokens(user, deviceInfo);

    logger.debug({ userId: user.id }, 'Token refreshed');

    return result;
  }

  /**
   * Logout by revoking the refresh token.
   */
  async logout(token: string): Promise<void> {
    const tokenHash = hashToken(token);

    await db('refresh_tokens')
      .where({ token_hash: tokenHash })
      .update({ is_revoked: true });

    logger.debug('User logged out, token revoked');
  }

  /**
   * Logout from all devices by revoking ALL refresh tokens for a user.
   */
  async logoutAll(userId: string): Promise<void> {
    await db('refresh_tokens')
      .where({ user_id: userId })
      .update({ is_revoked: true });

    logger.info({ userId }, 'All sessions revoked');
  }

  /**
   * Change password.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await db('users').where({ id: userId }).first();

    if (!user) {
      throw Errors.notFound('Usuário');
    }

    const passwordValid = await bcrypt.compare(input.currentPassword, user.password_hash);
    if (!passwordValid) {
      throw Errors.unauthorized('Senha atual incorreta');
    }

    const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);

    await db('users').where({ id: userId }).update({
      password_hash: newHash,
      updated_at: new Date(),
    });

    // Revoke all refresh tokens for security
    await this.logoutAll(userId);

    logger.info({ userId }, 'Password changed, all sessions revoked');
  }

  /**
   * Get user profile by ID.
   */
  async getProfile(userId: string): Promise<Record<string, any>> {
    const user = await db('users').where({ id: userId }).first();

    if (!user) {
      throw Errors.notFound('Usuário');
    }

    return this.sanitizeUser(user);
  }

  // ---- Private Helpers ----

  private async generateTokens(
    user: any,
    deviceInfo?: Record<string, unknown>
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessToken = signAccessToken({
      userId: user.id,
      schoolId: user.school_id,
      role: user.role,
      email: user.email,
    });

    const refreshToken = generateToken(48);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = new Date(Date.now() + parseExpiry(config.jwt.refreshExpiry));

    await db('refresh_tokens').insert({
      user_id: user.id,
      token_hash: refreshTokenHash,
      device_info: deviceInfo ? JSON.stringify(deviceInfo) : null,
      expires_at: expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any): Record<string, any> {
    const { password_hash, two_factor_secret, ...safe } = user;
    return safe;
  }
}

// Singleton export
export const authService = new AuthService();
