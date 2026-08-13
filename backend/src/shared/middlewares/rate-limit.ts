import rateLimit from 'express-rate-limit';
import { config } from '../../config';

/**
 * General rate limiter — 100 requests per minute.
 */
export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    },
  },
});

/**
 * Auth-specific rate limiter — 5 attempts per minute (brute force protection).
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Increased for development purposes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Muitas tentativas de login. Aguarde 1 minuto.',
    },
  },
});

/**
 * POS-specific rate limiter — higher limit for PDV operations.
 */
export const posLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
