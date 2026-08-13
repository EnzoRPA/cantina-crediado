import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(255),
  role: z.enum(['admin', 'operator', 'student', 'guardian']),
  phone: z.string().optional(),
  schoolId: z.string().uuid('ID da escola inválido'),
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
  schoolId: z.string().uuid('ID da escola inválido'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export const setup2FASchema = z.object({
  // No body needed — authenticated user from JWT
});

export const verify2FASchema = z.object({
  code: z.string().length(6, 'Código deve ter 6 dígitos'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: z
    .string()
    .min(8, 'Nova senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Nova senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Nova senha deve conter ao menos um número'),
});

// Type exports from schemas
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type Verify2FAInput = z.infer<typeof verify2FASchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const registerGuardianSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(255),
  phone: z.string().min(8, 'Telefone inválido'),
  schoolId: z.string().uuid('ID da escola inválido'),
  studentEnrollment: z.string().min(1, 'Matrícula do aluno é obrigatória'),
  studentBirthDate: z.string().min(1, 'Data de nascimento do aluno é obrigatória'),
});

export type RegisterGuardianInput = z.infer<typeof registerGuardianSchema>;
