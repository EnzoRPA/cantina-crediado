import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../../config';

export type UserRole = 'admin' | 'manager' | 'operator' | 'student' | 'guardian';


export interface AccessTokenPayload extends JwtPayload {
  userId: string;
  schoolId: string;
  role: UserRole;
  email: string;
}

/**
 * Signs an access token (short-lived).
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as string,
    issuer: 'cantina-escolar',
    audience: 'cantina-api',
  } as jwt.SignOptions);
}

/**
 * Verifies and decodes an access token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.secret, {
    issuer: 'cantina-escolar',
    audience: 'cantina-api',
  }) as AccessTokenPayload;
}

/**
 * Parses the expiry string (e.g. '15m', '7d') to milliseconds.
 */
export function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}
