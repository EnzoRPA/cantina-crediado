import { v4 as uuidv4 } from 'uuid';
import { db, searchLike } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type {
  ListCategoriesQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
  ListProductsQuery,
  CreateProductInput,
  UpdateProductInput,
  SetPromotionInput,
} from './products.schema';

// ==============================
//   Categories Service
// ==============================

export class CategoriesService {
  async list(schoolId: string, query: ListCategoriesQuery): Promise<any[]> {
    let q = db('categories')
      .where('school_id', schoolId)
      .orderBy('sort_order', 'asc')
      .orderBy('name', 'asc');

    if (query.isActive !== undefined) q = q.where('is_active', query.isActive);

    return q;
  }

  async getById(schoolId: string, categoryId: string): Promise<Record<string, any>> {
    const category = await db('categories')
      .where({ id: categoryId, school_id: schoolId })
      .first();

    if (!category) throw Errors.notFound('Categoria');
    return category;
  }

  async create(schoolId: string, input: CreateCategoryInput): Promise<Record<string, any>> {
    const [category] = await db('categories')
      .insert({
        id: uuidv4(),
        school_id: schoolId,
        name: input.name,
        description: input.description || null,
        icon: input.icon || null,
        sort_order: input.sortOrder || 0,
      })
      .returning('*');

    logger.info({ categoryId: category.id }, 'Category created');
    return category;
  }

  async update(schoolId: string, categoryId: string, input: UpdateCategoryInput): Promise<Record<string, any>> {
    const existing = await db('categories')
      .where({ id: categoryId, school_id: schoolId })
      .first();

    if (!existing) throw Errors.notFound('Categoria');

    const updates: Record<string, any> = { updated_at: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;
    if (input.isActive !== undefined) updates.is_active = input.isActive;

    const [updated] = await db('categories')
      .where({ id: categoryId })
      .update(updates)
      .returning('*');

    logger.info({ categoryId }, 'Category updated');
    return updated;
  }

  async delete(schoolId: string, categoryId: string): Promise<void> {
    const existing = await db('categories')
      .where({ id: categoryId, school_id: schoolId })
      .first();

    if (!existing) throw Errors.notFound('Categoria');

    // Check for products using this category
    const productCount = await db('products')
      .where({ category_id: categoryId })
      .count('* as count')
      .first();

    if (Number(productCount?.count) > 0) {
      throw Errors.badRequest(
        `Não é possível excluir. ${productCount?.count} produto(s) usam esta categoria.`
      );
    }

    await db('categories').where({ id: categoryId }).del();
    logger.info({ categoryId }, 'Category deleted');
  }
}

// ==============================
//   Products Service
// ==============================

export class ProductsService {
  async list(schoolId: string, query: ListProductsQuery): Promise<PaginatedResult<any>> {
    const { page, limit, sortBy, sortOrder, search, categoryId, isActive, lowStock } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('products as p')
      .leftJoin('categories as c', 'p.category_id', 'c.id')
      .where('p.school_id', schoolId);

    if (categoryId) baseQuery = baseQuery.where('p.category_id', categoryId);
    if (isActive !== undefined) baseQuery = baseQuery.where('p.is_active', isActive);
    if (lowStock) baseQuery = baseQuery.whereRaw('p.current_stock < p.min_stock');
    if (search) {
      baseQuery = baseQuery.where(function () {
        this.where(searchLike('p.name', search))
          .orWhere(searchLike('p.barcode', search))
          .orWhere(searchLike('p.description', search));
      });
    }

    const sortColumn = sortBy === 'name' ? 'p.name' : `p.${sortBy}`;

    const countRes = await baseQuery.clone().count('* as count').first();
    const total = Number(countRes?.count || 0);

    const data = await baseQuery
      .select(
        'p.id',
        'p.name',
        'p.description',
        'p.barcode',
        'p.image_url',
        'p.cost_price',
        'p.sale_price',
        'p.current_stock',
        'p.min_stock',
        'p.unit',
        'p.is_active',
        'p.control_stock',
        'p.is_promotional',
        'p.promotional_price',
        'p.promotion_start',
        'p.promotion_end',
        'p.created_at',
        'p.updated_at',
        'c.name as category_name'
      )
      .orderBy(sortColumn, sortOrder)
      .limit(limit)
      .offset(offset);

    // Add computed effective_price
    const enriched = data.map((p: any) => ({
      ...p,
      effective_price: this.getEffectivePrice(p),
      is_active: Boolean(p.is_active),
      is_promotional: Boolean(p.is_promotional),
      control_stock: Boolean(p.control_stock === undefined ? true : p.control_stock)
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data: enriched,
      pagination: {
        page, limit, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getById(schoolId: string, productId: string): Promise<Record<string, any>> {
    const product = await db('products')
      .leftJoin('categories as c', 'products.category_id', 'c.id')
      .where({ 'products.id': productId, 'products.school_id': schoolId })
      .select(
        'products.id as id',
        'products.name as name',
        'products.description as description',
        'products.barcode as barcode',
        'products.image_url as image_url',
        'products.cost_price as cost_price',
        'products.sale_price as sale_price',
        'products.current_stock as current_stock',
        'products.min_stock as min_stock',
        'products.unit as unit',
        'products.is_active as is_active',
        'products.control_stock as control_stock',
        'products.is_promotional as is_promotional',
        'products.promotional_price as promotional_price',
        'products.promotion_start as promotion_start',
        'products.promotion_end as promotion_end',
        'products.created_at as created_at',
        'products.updated_at as updated_at',
        'c.name as category_name'
      )
      .first();

    if (!product) throw Errors.notFound('Produto');

    return {
      ...product,
      effective_price: this.getEffectivePrice(product),
      is_active: Boolean(product.is_active),
      is_promotional: Boolean(product.is_promotional),
      control_stock: Boolean(product.control_stock === undefined ? true : product.control_stock)
    };
  }

  async create(schoolId: string, input: CreateProductInput): Promise<Record<string, any>> {
    // Verify category if provided
    if (input.categoryId) {
      const category = await db('categories')
        .where({ id: input.categoryId, school_id: schoolId })
        .first();
      if (!category) throw Errors.notFound('Categoria');
    }

    const [product] = await db('products')
      .insert({
        id: uuidv4(),
        school_id: schoolId,
        category_id: input.categoryId || null,
        name: input.name,
        description: input.description || null,
        barcode: input.barcode || null,
        image_url: input.imageUrl || null,
        cost_price: input.costPrice || null,
        sale_price: input.salePrice,
        current_stock: input.currentStock,
        min_stock: input.minStock,
        unit: input.unit,
        control_stock: input.controlStock !== undefined ? input.controlStock : true,
      })
      .returning('*');

    logger.info({ productId: product.id }, 'Product created');
    return product;
  }

  async update(schoolId: string, productId: string, input: UpdateProductInput): Promise<Record<string, any>> {
    const existing = await db('products')
      .where({ id: productId, school_id: schoolId })
      .first();

    if (!existing) throw Errors.notFound('Produto');

    // Verify category if changing
    if (input.categoryId) {
      const cat = await db('categories')
        .where({ id: input.categoryId, school_id: schoolId })
        .first();
      if (!cat) throw Errors.notFound('Categoria');
    }

    const updates: Record<string, any> = { updated_at: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.categoryId !== undefined) updates.category_id = input.categoryId;
    if (input.barcode !== undefined) updates.barcode = input.barcode;
    if (input.imageUrl !== undefined) updates.image_url = input.imageUrl;
    if (input.costPrice !== undefined) updates.cost_price = input.costPrice;
    if (input.salePrice !== undefined) updates.sale_price = input.salePrice;
    if (input.minStock !== undefined) updates.min_stock = input.minStock;
    if (input.unit !== undefined) updates.unit = input.unit;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.controlStock !== undefined) updates.control_stock = input.controlStock;

    const [updated] = await db('products')
      .where({ id: productId })
      .update(updates)
      .returning('*');

    logger.info({ productId }, 'Product updated');
    return updated;
  }

  async delete(schoolId: string, productId: string): Promise<void> {
    const existing = await db('products')
      .where({ id: productId, school_id: schoolId })
      .first();

    if (!existing) throw Errors.notFound('Produto');

    // Check for stock movements or sales if necessary, but for now let's allow hard delete
    await db('products').where({ id: productId }).del();
    logger.info({ productId }, 'Product hard deleted');
  }

  async setPromotion(schoolId: string, productId: string, input: SetPromotionInput): Promise<Record<string, any>> {
    const existing = await db('products')
      .where({ id: productId, school_id: schoolId })
      .first();

    if (!existing) throw Errors.notFound('Produto');

    if (input.promotionalPrice >= existing.sale_price) {
      throw Errors.badRequest('Preço promocional deve ser menor que o preço de venda');
    }

    const start = new Date(input.promotionStart);
    const end = new Date(input.promotionEnd);
    if (end <= start) {
      throw Errors.badRequest('Data de fim deve ser posterior à data de início');
    }

    const [updated] = await db('products')
      .where({ id: productId })
      .update({
        is_promotional: true,
        promotional_price: input.promotionalPrice,
        promotion_start: start,
        promotion_end: end,
        updated_at: new Date(),
      })
      .returning('*');

    logger.info({ productId, promotionalPrice: input.promotionalPrice }, 'Promotion set');
    return updated;
  }

  async removePromotion(schoolId: string, productId: string): Promise<Record<string, any>> {
    const existing = await db('products')
      .where({ id: productId, school_id: schoolId })
      .first();

    if (!existing) throw Errors.notFound('Produto');

    const [updated] = await db('products')
      .where({ id: productId })
      .update({
        is_promotional: false,
        promotional_price: null,
        promotion_start: null,
        promotion_end: null,
        updated_at: new Date(),
      })
      .returning('*');

    logger.info({ productId }, 'Promotion removed');
    return updated;
  }

  /**
   * Computes the effective price considering active promotions.
   */
  private getEffectivePrice(product: any): number {
    if (
      product.is_promotional &&
      product.promotional_price &&
      product.promotion_start &&
      product.promotion_end
    ) {
      const now = new Date();
      const start = new Date(product.promotion_start);
      const end = new Date(product.promotion_end);

      if (now >= start && now <= end) {
        return Number(product.promotional_price);
      }
    }
    return Number(product.sale_price);
  }
}

export const categoriesService = new CategoriesService();
export const productsService = new ProductsService();
