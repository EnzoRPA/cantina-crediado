import { z } from 'zod';

// ==============================
//   Cash Register Schemas
// ==============================

export const openCashRegisterSchema = z.object({
  terminalName: z.string().min(1).max(50).optional(),
  openingBalance: z.number().min(0, 'Saldo inicial deve ser >= 0'),
});

export const closeCashRegisterSchema = z.object({
  registerId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export const cashRegisterMovementSchema = z.object({
  type: z.enum(['sangria', 'suprimento']),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  description: z.string().min(1, 'Descrição é obrigatória').max(255),
});

// ==============================
//   Transaction Schemas
// ==============================

export const transactionItemSchema = z.object({
  productId: z.string().min(1, 'ID do produto é obrigatório'),
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  unitPrice: z.number().min(0.01).optional(),
  name: z.string().max(255).optional(),
});

export const transactionPaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'debit_card', 'credit_card', 'pix', 'school_balance', 'on_credit']),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
});

export const createTransactionSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido').optional(), // anonymous sale if null
  identificationMethod: z.enum(['facial', 'card', 'manual', 'app']).optional(),
  items: z.array(transactionItemSchema).min(1, 'Pelo menos 1 item é necessário'),
  payments: z.array(transactionPaymentSchema).min(1, 'Pelo menos 1 forma de pagamento'),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().max(500).optional(),
  // Offline sync fields
  isOffline: z.boolean().default(false),
  offlineId: z.string().max(50).optional(),
});

export const cancelTransactionSchema = z.object({
  reason: z.string().min(1, 'Motivo do cancelamento é obrigatório').max(255),
});

// ==============================
//   Batch Sync Schema (offline)
// ==============================

export const batchSyncSchema = z.object({
  transactions: z.array(createTransactionSchema).min(1).max(100),
});

// ==============================
//   Query Schemas
// ==============================

export const listTransactionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'completed', 'cancelled', 'refunded']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  studentId: z.string().uuid().optional(),
});

export const transactionIdParamSchema = z.object({
  id: z.string().uuid('ID da transação inválido'),
});

export const createManualOnCreditSchema = z.object({
  studentId: z.string().uuid('ID do cliente inválido'),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  date: z.string().optional(),
  description: z.string().max(255).optional(),
});

export const updateOnCreditTransactionSchema = z.object({
  amount: z.number().min(0.01, 'Valor deve ser maior que zero').optional(),
  date: z.string().optional(),
  description: z.string().max(255).optional(),
});

export const batchManualOnCreditSchema = z.object({
  date: z.string().optional(),
  description: z.string().max(255).optional(),
  items: z.array(
    z.object({
      studentId: z.string().uuid('ID do cliente inválido'),
      amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
    })
  ).min(1, 'Selecione pelo menos um cliente para lançar em lote'),
});

// ==============================
//   Type Exports
// ==============================

export type OpenCashRegisterInput = z.infer<typeof openCashRegisterSchema>;
export type CloseCashRegisterInput = z.infer<typeof closeCashRegisterSchema>;
export type CashRegisterMovementInput = z.infer<typeof cashRegisterMovementSchema>;
export type TransactionItem = z.infer<typeof transactionItemSchema>;
export type TransactionPayment = z.infer<typeof transactionPaymentSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CancelTransactionInput = z.infer<typeof cancelTransactionSchema>;
export type BatchSyncInput = z.infer<typeof batchSyncSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>;
export type CreateManualOnCreditInput = z.infer<typeof createManualOnCreditSchema>;
export type UpdateOnCreditTransactionInput = z.infer<typeof updateOnCreditTransactionSchema>;
export type BatchManualOnCreditInput = z.infer<typeof batchManualOnCreditSchema>;
