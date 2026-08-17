import { z } from 'zod';

// ---- Query schemas ----

export const listStudentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(2000).default(20),
  sortBy: z.enum(['name', 'enrollment_number', 'grade', 'balance', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().optional(),
  grade: z.string().optional(),
  type: z.enum(['student', 'employee', 'all']).optional(),
  billingType: z.enum(['pix_direto', 'crediario', 'all']).optional(),
  isActive: z.coerce.boolean().optional(),
  lowBalance: z.coerce.boolean().optional(), // filter students with balance < 10
});

// ---- Mutation schemas ----

export const createStudentSchema = z.object({
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número')
    .optional()
    .or(z.literal('')),
  name: z.string().max(255).optional().or(z.literal('')),
  enrollmentNumber: z.string().max(50).optional().or(z.literal('')),
  type: z.enum(['student', 'employee']).default('student'),
  billingType: z.enum(['pix_direto', 'crediario']).default('pix_direto').optional(),
  grade: z.string().max(255).optional(),
  classGroup: z.string().max(255).optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(), // ISO date string
  photoUrl: z.string().url().optional().or(z.literal('')),
  cpf: z.string().optional(),
  gender: z.string().optional(),
  addressFull: z.string().optional(),
  guardianName: z.string().optional(),
  guardianCpf: z.string().optional(),
  guardianRg: z.string().optional(),
  guardianPhone: z.string().optional(),
});

export const updateStudentSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número')
    .optional()
    .or(z.literal('')),
  enrollmentNumber: z.string().max(50).optional().or(z.literal('')),
  type: z.enum(['student', 'employee']).optional(),
  billingType: z.enum(['pix_direto', 'crediario']).optional(),
  grade: z.string().max(255).optional(),
  classGroup: z.string().max(255).optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  cpf: z.string().optional(),
  gender: z.string().optional(),
  addressFull: z.string().optional(),
  guardianName: z.string().optional(),
  guardianCpf: z.string().optional(),
  guardianRg: z.string().optional(),
  guardianPhone: z.string().optional(),
});

export const adjustBalanceSchema = z.object({
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  type: z.enum(['credit', 'debit']),
  reason: z.string().min(1, 'Motivo é obrigatório').max(255),
});

export const studentIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

// ---- Type exports ----

export type ListStudentsQuery = z.infer<typeof listStudentsSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
