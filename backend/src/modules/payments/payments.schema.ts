import { z } from 'zod';

// ---- PIX ----

export const createPixSchema = z.object({
  transactionId: z.string().uuid('ID da transação inválido'),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  description: z.string().max(255).optional(),
});

// ---- Card ----

export const createCardPaymentSchema = z.object({
  transactionId: z.string().uuid('ID da transação inválido'),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  token: z.string().min(1, 'Token do cartão é obrigatório'), // Mercado Pago card token
  installments: z.number().int().min(1).max(12).default(1),
  payerEmail: z.string().email('Email do pagador inválido'),
});

// ---- Recharge ----

export const rechargeSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
  amount: z.number().min(1, 'Valor mínimo de recarga é R$ 1,00'),
  paymentMethod: z.enum(['pix', 'credit_card', 'debit_card']),
  token: z.string().optional(), // card token if card payment
  payerEmail: z.string().email().optional(),
  splits: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        amount: z.number().min(0.01),
      })
    )
    .optional(),
});

// ---- Webhook ----

export const webhookSchema = z.object({
  action: z.string(),
  data: z.object({
    id: z.string(),
  }),
  type: z.string().optional(),
}).passthrough(); // Allow extra fields from Mercado Pago

// ---- Query ----

export const paymentHistorySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const studentIdParamSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
});

// ---- Type exports ----

export type CreatePixInput = z.infer<typeof createPixSchema>;
export type CreateCardPaymentInput = z.infer<typeof createCardPaymentSchema>;
export type RechargeInput = z.infer<typeof rechargeSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
export type PaymentHistoryQuery = z.infer<typeof paymentHistorySchema>;
