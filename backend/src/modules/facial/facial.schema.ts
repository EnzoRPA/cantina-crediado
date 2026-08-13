import { z } from 'zod';

// ---- Register facial descriptor ----

export const registerFacialSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
  descriptor: z.array(z.number()).min(128, 'Descritor facial inválido'),
  consentGivenBy: z.string().uuid('ID do responsável inválido').optional(),
  consentDocumentUrl: z.string().url().optional(),
});

// ---- Recognize ----

export const recognizeFacialSchema = z.object({
  descriptor: z.array(z.number()).min(128, 'Descritor facial inválido'),
  threshold: z.number().min(0).max(1).default(0.70), // distance threshold (increased to 0.70 for robust lighting/camera tolerance)
  maxResults: z.number().int().min(1).max(5).default(1),
});

// ---- Params ----

export const studentIdParamSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
});

// ---- Type exports ----

export type RegisterFacialInput = z.infer<typeof registerFacialSchema>;
export type RecognizeFacialInput = z.infer<typeof recognizeFacialSchema>;
