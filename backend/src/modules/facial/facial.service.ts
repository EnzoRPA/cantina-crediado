import crypto from 'crypto';
import { db } from '../../shared/database/knex';
import { encrypt, decrypt } from '../../shared/utils/encryption';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { RegisterFacialInput, RecognizeFacialInput } from './facial.schema';

/**
 * Helper to convert database values (hex string, padded Buffer, or raw Buffer)
 * into a clean Buffer of the expected raw binary size.
 */
function toBuffer(value: any, expectedRawLength: number): Buffer {
  if (typeof value === 'string') {
    return Buffer.from(value.trim(), 'hex');
  }
  if (Buffer.isBuffer(value)) {
    if (value.length === expectedRawLength) {
      return value;
    }
    // If it's a hex string stored in a BYTEA column, its length will be twice the expected raw length
    if (value.length === expectedRawLength * 2) {
      const str = value.toString('utf8').trim();
      return Buffer.from(str, 'hex');
    }
    // Fallback/safety parser
    const str = value.toString('utf8').trim();
    if (/^[0-9a-fA-F]+$/.test(str)) {
      return Buffer.from(str, 'hex');
    }
    return value;
  }
  throw new Error(`Expected Buffer or string, got ${typeof value}`);
}

/**
 * Facial recognition service.
 * Stores encrypted facial descriptors (128-dim float arrays) in PostgreSQL.
 * Comparison is done server-side via Euclidean distance.
 * 
 * LGPD: Descriptors are encrypted with AES-256-GCM.
 * Consent is required and recorded.
 */
export class FacialService {
  /**
   * Register a facial descriptor for a student.
   * Requires guardian consent.
   */
  async register(schoolId: string, input: RegisterFacialInput): Promise<{ success: boolean }> {
    // Verify student exists
    const student = await db('students')
      .where({ id: input.studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    if (input.consentGivenBy) {
      // Verify guardian exists and is linked
      const guardianLink = await db('student_guardians as sg')
        .join('guardians as g', 'sg.guardian_id', 'g.id')
        .where({ 'sg.student_id': input.studentId, 'g.id': input.consentGivenBy })
        .first();

      if (!guardianLink) {
        throw Errors.badRequest('Responsável não vinculado a este aluno');
      }
    }

    // Serialize and encrypt the descriptor
    // face-api.js produces Float32Array (128 × 4 bytes = 512 bytes)
    const descriptorBuffer = Buffer.from(
      new Float32Array(input.descriptor).buffer
    );
    const { encrypted, iv, authTag } = encrypt(descriptorBuffer);

    // Convert Buffers to hex strings for DB storage (SQLite compatibility)
    const encHex = encrypted.toString('hex');
    const ivHex = iv.toString('hex');
    const authTagHex = authTag.toString('hex');

    // Check for existing descriptor (update or insert)
    const existing = await db('facial_descriptors')
      .where({ student_id: input.studentId })
      .first();

    if (existing) {
      await db('facial_descriptors')
        .where({ student_id: input.studentId })
        .update({
          descriptor_encrypted: encHex,
          iv: ivHex,
          auth_tag: authTagHex,
          consent_given_by: input.consentGivenBy || null,
          consent_given_at: new Date(),
          consent_document_url: input.consentDocumentUrl || null,
          updated_at: new Date(),
        });
    } else {
      await db('facial_descriptors').insert({
        id: crypto.randomUUID(), // add uuid here!
        student_id: input.studentId,
        descriptor_encrypted: encHex,
        iv: ivHex,
        auth_tag: authTagHex,
        consent_given_by: input.consentGivenBy || null,
        consent_given_at: new Date(),
        consent_document_url: input.consentDocumentUrl || null,
      });
    }

    logger.info({ studentId: input.studentId }, 'Facial descriptor registered');
    return { success: true };
  }

  /**
   * Recognize a student by comparing a descriptor against all stored descriptors.
   * Uses Euclidean distance; lower = more similar.
   */
  async recognize(
    schoolId: string,
    input: RecognizeFacialInput
  ): Promise<{
    matches: Array<{
      studentId: string;
      studentName: string;
      enrollmentNumber: string;
      balance: number;
      distance: number;
      confidence: number;
    }>;
    debug?: {
      schoolId: string;
      loadedCount: number;
      closestCandidate: {
        name: string;
        distance: number;
        threshold: number;
        isMatch: boolean;
      } | null;
    };
  }> {
    // Get all descriptors for the school
    const descriptors = await db('facial_descriptors as fd')
      .join('students as s', 'fd.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.school_id', schoolId)
      .where('s.is_active', true)
      .select(
        'fd.student_id', 'fd.descriptor_encrypted', 'fd.iv', 'fd.auth_tag',
        'u.name', 's.enrollment_number', 's.balance'
      );

    logger.info({ count: descriptors.length, schoolId }, 'Loaded facial descriptors for recognition');

    if (descriptors.length === 0) {
      return { matches: [] };
    }

    // face-api.js produces Float32Array descriptors
    const inputDescriptor = new Float32Array(input.descriptor);
    const matches: any[] = [];
    let closestCandidate: { name: string; distance: number } | null = null;
    let minDistance = Infinity;

    for (const record of descriptors) {
      try {
        // Decrypt the stored descriptor (handles hex strings, padded Buffers, and raw binary)
        const decrypted = decrypt(
          toBuffer(record.descriptor_encrypted, 512),
          toBuffer(record.iv, 16),
          toBuffer(record.auth_tag, 16)
        );
        
        // Safely slice the buffer to create a clean, aligned ArrayBuffer for Float32Array
        const arrayBuffer = decrypted.buffer.slice(
          decrypted.byteOffset,
          decrypted.byteOffset + decrypted.byteLength
        );
        const storedDescriptor = new Float32Array(arrayBuffer);

        // Compute Euclidean distance
        const distance = this.euclideanDistance(inputDescriptor, storedDescriptor);
        const isMatch = distance <= input.threshold;

        if (distance < minDistance) {
          minDistance = distance;
          closestCandidate = {
            name: record.name,
            distance: Math.round(distance * 10000) / 10000
          };
        }

        logger.info(
          { 
            studentId: record.student_id, 
            studentName: record.name, 
            distance: Math.round(distance * 10000) / 10000, 
            threshold: input.threshold,
            isMatch 
          },
          `Facial comparison for ${record.name}: distance=${distance.toFixed(4)}, matches=${isMatch}`
        );

        if (isMatch) {
          matches.push({
            studentId: record.student_id,
            studentName: record.name,
            enrollmentNumber: record.enrollment_number,
            balance: Number(record.balance),
            distance: Math.round(distance * 10000) / 10000,
            confidence: Math.round((1 - distance) * 100),
          });
        }
      } catch (err: any) {
        logger.warn({ studentId: record.student_id, error: err.message }, 'Failed to decrypt descriptor');
      }
    }

    // Sort by distance (closest first) and limit
    matches.sort((a, b) => a.distance - b.distance);

    return {
      matches: matches.slice(0, input.maxResults),
      debug: {
        schoolId,
        loadedCount: descriptors.length,
        closestCandidate: closestCandidate ? {
          ...closestCandidate,
          threshold: input.threshold,
          isMatch: closestCandidate.distance <= input.threshold
        } : null
      }
    };
  }

  /**
   * Delete a student's facial descriptor (LGPD right to erasure).
   */
  async delete(schoolId: string, studentId: string): Promise<void> {
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    const deleted = await db('facial_descriptors')
      .where({ student_id: studentId })
      .del();

    if (deleted === 0) {
      throw Errors.notFound('Descritor facial');
    }

    logger.info({ studentId }, 'Facial descriptor deleted (LGPD)');
  }

  /**
   * Euclidean distance between two Float64Arrays.
   */
  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

export const facialService = new FacialService();
