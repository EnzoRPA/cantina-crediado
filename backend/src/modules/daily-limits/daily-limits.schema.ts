import { z } from 'zod';

// ---- Schemas ----

export const getDailyLimitSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
});

export const upsertDailyLimitSchema = z.object({
  maxDailyAmount: z.number().min(0).nullable().optional(),
  allowedStartTime: z.string()
    .regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:MM')
    .nullable()
    .optional(),
  allowedEndTime: z.string()
    .regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:MM')
    .nullable()
    .optional(),
  blockedProductIds: z.array(z.string().uuid()).default([]),
  blockedCategoryIds: z.array(z.string().uuid()).default([]),
  isPurchaseBlocked: z.boolean().default(false),
});

export const checkLimitSchema = z.object({
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  productIds: z.array(z.string().uuid()).optional(),
});

export const studentIdParamSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
});

// ---- Type exports ----

export type UpsertDailyLimitInput = z.infer<typeof upsertDailyLimitSchema>;
export type CheckLimitInput = z.infer<typeof checkLimitSchema>;
