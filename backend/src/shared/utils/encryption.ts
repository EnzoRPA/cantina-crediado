import crypto from 'crypto';
import { config } from '../../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Returns the 32-byte encryption key derived from the hex env var.
 */
function getKey(): Buffer {
  const hexKey = config.encryption.key;
  if (hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts data using AES-256-GCM.
 * Returns { encrypted, iv, authTag } as Buffers.
 */
export function encrypt(data: Buffer | string): {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
} {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { encrypted, iv, authTag };
}

/**
 * Decrypts data encrypted with AES-256-GCM.
 */
export function decrypt(
  encrypted: Buffer,
  iv: Buffer,
  authTag: Buffer
): Buffer {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Hashes a string using SHA-256 (for refresh token storage).
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure random token.
 */
export function generateToken(length: number = 48): string {
  return crypto.randomBytes(length).toString('hex');
}
