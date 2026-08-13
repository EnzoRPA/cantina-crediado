import { z } from 'zod';

// ---- Query schemas ----

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'email', 'role', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().optional(),
  role: z.enum(['admin', 'manager', 'operator', 'student', 'guardian']).optional(),
  isActive: z.coerce.boolean().optional(),
});

// ---- Mutation schemas ----

export const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(255),
  role: z.enum(['admin', 'manager', 'operator', 'student', 'guardian']),
  phone: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional(),
  role: z.enum(['admin', 'manager', 'operator', 'student', 'guardian']).optional(),

  isActive: z.boolean().optional(),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número')
    .optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

// ---- Type exports ----

export type ListUsersQuery = z.infer<typeof listUsersSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
