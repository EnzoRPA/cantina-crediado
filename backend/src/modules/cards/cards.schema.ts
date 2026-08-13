import { z } from 'zod';

// ---- Query schemas ----

export const listCardsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  isBlocked: z.coerce.boolean().optional(),
});

// ---- Mutation schemas ----

export const issueCardSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
  cardNumber: z.string().min(1, 'Número do cartão é obrigatório').max(50),
  cardType: z.enum(['nfc', 'qrcode']),
});

export const blockCardSchema = z.object({
  reason: z.string().min(1, 'Motivo do bloqueio é obrigatório').max(255),
});

export const cardIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export const cardCodeParamSchema = z.object({
  code: z.string().min(1, 'Código do cartão é obrigatório'),
});

// ---- Type exports ----

export type ListCardsQuery = z.infer<typeof listCardsSchema>;
export type IssueCardInput = z.infer<typeof issueCardSchema>;
export type BlockCardInput = z.infer<typeof blockCardSchema>;
