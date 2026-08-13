import { z } from 'zod';

// ---- Query schemas ----

export const listGuardiansSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// ---- Mutation schemas ----

export const createGuardianSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(255),
  phone: z.string().optional(),
  cpf: z.string()
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF deve estar no formato XXX.XXX.XXX-XX')
    .optional(),
});

export const updateGuardianSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().optional(),
  cpf: z.string()
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF deve estar no formato XXX.XXX.XXX-XX')
    .optional(),
  isActive: z.boolean().optional(),
});

export const linkStudentSchema = z.object({
  studentId: z.string().uuid('ID do aluno inválido'),
  relationship: z.enum(['parent', 'guardian', 'grandparent', 'other']).default('parent'),
  isPrimary: z.boolean().default(false),
});

export const guardianIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

// ---- Type exports ----

export type ListGuardiansQuery = z.infer<typeof listGuardiansSchema>;
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
export type LinkStudentInput = z.infer<typeof linkStudentSchema>;

export const linkStudentSelfServiceSchema = z.object({
  enrollmentNumber: z.string().min(1, 'Matrícula do aluno é obrigatória'),
  birthDate: z.string().min(1, 'Data de nascimento do aluno é obrigatória'),
});

export type LinkStudentSelfServiceInput = z.infer<typeof linkStudentSelfServiceSchema>;
