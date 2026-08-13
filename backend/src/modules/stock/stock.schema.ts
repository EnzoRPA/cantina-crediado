import { z } from 'zod';

// ---- Query schemas ----

export const listMovementsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.string().uuid().optional(),
  type: z.enum(['in', 'out', 'adjust', 'loss']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ---- Mutation schemas ----

export const createMovementSchema = z.object({
  productId: z.string().uuid('ID do produto inválido'),
  type: z.enum(['in', 'out', 'adjust', 'loss']),
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  unitCost: z.number().min(0).optional(),
  reason: z.string().max(500).optional(),
  batchNumber: z.string().max(50).optional(),
  expiryDate: z.string().optional(), // ISO date
});

export const stockAlertSchema = z.object({
  threshold: z.coerce.number().int().min(0).optional(), // override min_stock
});

// ---- Type exports ----

export type ListMovementsQuery = z.infer<typeof listMovementsSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type StockAlertQuery = z.infer<typeof stockAlertSchema>;
