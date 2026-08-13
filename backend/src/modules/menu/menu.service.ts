import { db } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { UpdateMenuAvailabilityInput } from './menu.schema';

export class MenuService {
  /**
   * Get today's menu (active products grouped by category).
   */
  async getToday(schoolId: string): Promise<Record<string, any>> {
    const categories = await db('categories')
      .where({ school_id: schoolId, is_active: true })
      .orderBy('sort_order', 'asc');

    // Subquery for total sales quantity per product
    const salesSubquery = db('transaction_items as ti')
      .join('transactions as t', 'ti.transaction_id', 't.id')
      .where({ 't.school_id': schoolId })
      .whereIn('t.status', ['completed', 'approved'])
      .select('ti.product_id')
      .sum('ti.quantity as total_sold')
      .groupBy('ti.product_id')
      .as('sales');

    const products = await db('products as p')
      .leftJoin(salesSubquery, 'p.id', 'sales.product_id')
      .where({ 'p.school_id': schoolId, 'p.is_active': true })
      .where(function() {
        this.where('p.current_stock', '>', 0)
          .orWhere('p.control_stock', false);
      })
      .select('p.*', db.raw('COALESCE(sales.total_sold, 0) as total_sold'));

    // Sort by sales count descending (most popular / most sold first), then by name
    products.sort((a: any, b: any) => {
      const soldDiff = Number(b.total_sold || 0) - Number(a.total_sold || 0);
      if (soldDiff !== 0) return soldDiff;
      return a.name.localeCompare(b.name);
    });

    // Group products by category
    const menu = categories.map((cat: any) => ({
      category: cat,
      products: products
        .filter((p: any) => p.category_id === cat.id)
        .map((p: any) => ({
          ...p,
          effective_price: this.getEffectivePrice(p),
        })),
    }));

    // Products without category
    const uncategorized = products
      .filter((p: any) => !p.category_id)
      .map((p: any) => ({
        ...p,
        effective_price: this.getEffectivePrice(p),
      }));

    if (uncategorized.length > 0) {
      menu.push({
        category: { id: null, name: 'Outros', sort_order: 999 },
        products: uncategorized,
      });
    }

    return {
      date: new Date().toISOString().split('T')[0],
      categories: menu.filter((m: any) => m.products.length > 0),
      totalProducts: products.length,
    };
  }

  /**
   * Update product availability (e.g., mark as sold out).
   */
  async updateAvailability(
    schoolId: string,
    input: UpdateMenuAvailabilityInput
  ): Promise<{ updated: number }> {
    const updated = await db('products')
      .where('school_id', schoolId)
      .whereIn('id', input.productIds)
      .update({ is_active: input.available, updated_at: new Date() });

    logger.info({
      productIds: input.productIds,
      available: input.available,
    }, 'Menu availability updated');

    return { updated };
  }

  /**
   * Get active promotions.
   */
  async getPromotions(schoolId: string): Promise<any[]> {
    const now = new Date();

    const promotions = await db('products')
      .where({ school_id: schoolId, is_active: true, is_promotional: true })
      .where('promotion_start', '<=', now)
      .where('promotion_end', '>=', now)
      .select(
        'id', 'name', 'sale_price', 'promotional_price',
        'promotion_start', 'promotion_end', 'image_url', 'category_id'
      )
      .orderBy('promotional_price', 'asc');

    return promotions.map((p: any) => ({
      ...p,
      discount_percent: Math.round(
        ((Number(p.sale_price) - Number(p.promotional_price)) / Number(p.sale_price)) * 100
      ),
    }));
  }

  private getEffectivePrice(product: any): number {
    if (product.is_promotional && product.promotional_price) {
      const now = new Date();
      if (
        product.promotion_start && product.promotion_end &&
        now >= new Date(product.promotion_start) &&
        now <= new Date(product.promotion_end)
      ) {
        return Number(product.promotional_price);
      }
    }
    return Number(product.sale_price);
  }
}

export const menuService = new MenuService();
