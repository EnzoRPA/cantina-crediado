import { z } from 'zod';

// ---- Categories ----

export const listCategoriesSchema = z.object({
  isActive: z.coerce.boolean().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ---- Products ----

export const listProductsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'sale_price', 'current_stock', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  lowStock: z.coerce.boolean().optional(), // filter products below min_stock
});

export const createProductSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  description: z.string().max(500).optional(),
  categoryId: z.string().uuid('ID da categoria inválido').optional(),
  barcode: z.string().max(50).optional(),
  imageUrl: z.string().optional(),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0.01, 'Preço de venda deve ser maior que zero'),
  currentStock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(5),
  unit: z.enum(['un', 'kg', 'lt']).default('un'),
  controlStock: z.boolean().default(true),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  salePrice: z.number().min(0.01).optional(),
  minStock: z.number().int().min(0).optional(),
  unit: z.enum(['un', 'kg', 'lt']).optional(),
  isActive: z.boolean().optional(),
  controlStock: z.boolean().optional(),
});

export const setPromotionSchema = z.object({
  promotionalPrice: z.number().min(0.01, 'Preço promocional inválido'),
  promotionStart: z.string().datetime({ message: 'Data de início inválida' }),
  promotionEnd: z.string().datetime({ message: 'Data de fim inválida' }),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

// ---- Type exports ----

export type ListCategoriesQuery = z.infer<typeof listCategoriesSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type SetPromotionInput = z.infer<typeof setPromotionSchema>;
