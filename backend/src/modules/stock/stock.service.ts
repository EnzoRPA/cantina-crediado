import { db } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type { ListMovementsQuery, CreateMovementInput } from './stock.schema';

export class StockService {
  /**
   * List stock movements with pagination and filters.
   */
  async listMovements(schoolId: string, query: ListMovementsQuery): Promise<PaginatedResult<any>> {
    const { page, limit, productId, type, startDate, endDate } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('stock_movements as sm')
      .join('products as p', 'sm.product_id', 'p.id')
      .leftJoin('users as u', 'sm.created_by', 'u.id')
      .where('sm.school_id', schoolId);

    if (productId) baseQuery = baseQuery.where('sm.product_id', productId);
    if (type) baseQuery = baseQuery.where('sm.type', type);
    if (startDate) baseQuery = baseQuery.where('sm.created_at', '>=', startDate);
    if (endDate) baseQuery = baseQuery.where('sm.created_at', '<=', endDate);

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const data = await baseQuery
      .select(
        'sm.*',
        'p.name as product_name',
        'p.unit as product_unit',
        'u.name as created_by_name'
      )
      .orderBy('sm.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page, limit, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Create a stock movement (in/out/adjust/loss) and update product stock.
   */
  async createMovement(
    schoolId: string,
    input: CreateMovementInput,
    operatorId: string
  ): Promise<Record<string, any>> {
    return db.transaction(async (trx) => {
      // Verify product exists
      const product = await trx('products')
        .where({ id: input.productId, school_id: schoolId })
        .forUpdate()
        .first();

      if (!product) throw Errors.notFound('Produto');

      let newStock = Number(product.current_stock);

      switch (input.type) {
        case 'in':
          newStock += input.quantity;
          break;
        case 'out':
          if (newStock < input.quantity) {
            throw Errors.badRequest(
              `Estoque insuficiente. Atual: ${newStock} ${product.unit}`
            );
          }
          newStock -= input.quantity;
          break;
        case 'adjust':
          newStock = input.quantity; // absolute adjustment
          break;
        case 'loss':
          if (newStock < input.quantity) {
            throw Errors.badRequest(
              `Perda não pode exceder estoque atual. Atual: ${newStock} ${product.unit}`
            );
          }
          newStock -= input.quantity;
          break;
      }

      // Create movement record
      const [movement] = await trx('stock_movements')
        .insert({
          product_id: input.productId,
          school_id: schoolId,
          type: input.type,
          quantity: input.quantity,
          unit_cost: input.unitCost || null,
          reason: input.reason || null,
          batch_number: input.batchNumber || null,
          expiry_date: input.expiryDate || null,
          created_by: operatorId,
        })
        .returning('*');

      // Update product stock
      await trx('products')
        .where({ id: input.productId })
        .update({
          current_stock: newStock,
          updated_at: new Date(),
        });

      logger.info(
        { movementId: movement.id, productId: input.productId, type: input.type, quantity: input.quantity, newStock },
        'Stock movement created'
      );

      return {
        ...movement,
        product_name: product.name,
        new_stock: newStock,
      };
    });
  }

  /**
   * Get stock alerts (products below min_stock).
   */
  async getAlerts(schoolId: string): Promise<any[]> {
    const alerts = await db('products')
      .where('school_id', schoolId)
      .where('is_active', true)
      .whereRaw('current_stock < min_stock')
      .select(
        'id', 'name', 'current_stock', 'min_stock', 'unit',
        'sale_price', 'category_id'
      )
      .orderByRaw('(min_stock - current_stock) DESC');

    return alerts;
  }

  /**
   * Calculate CMV (Custo da Mercadoria Vendida) for a period.
   * CMV = Estoque Inicial + Compras - Estoque Final
   */
  async getCMVReport(
    schoolId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    totalIn: number;
    totalOut: number;
    totalLoss: number;
    estimatedCMV: number;
    details: any[];
  }> {
    // Get all movements in the period grouped by type
    const movements = await db('stock_movements')
      .where('school_id', schoolId)
      .whereBetween('created_at', [startDate, endDate])
      .select('type')
      .sum('quantity as total_quantity')
      .sum(db.raw('COALESCE(unit_cost * quantity, 0) as total_cost'))
      .groupBy('type');

    let totalIn = 0;
    let totalOut = 0;
    let totalLoss = 0;
    let costIn = 0;

    for (const m of movements) {
      switch (m.type) {
        case 'in':
          totalIn = Number(m.total_quantity);
          costIn = Number(m.total_cost);
          break;
        case 'out':
          totalOut = Number(m.total_quantity);
          break;
        case 'loss':
          totalLoss = Number(m.total_quantity);
          break;
      }
    }

    // Product-level details
    const details = await db('stock_movements as sm')
      .join('products as p', 'sm.product_id', 'p.id')
      .where('sm.school_id', schoolId)
      .where('sm.type', 'in')
      .whereBetween('sm.created_at', [startDate, endDate])
      .select('p.id', 'p.name')
      .sum('sm.quantity as quantity_purchased')
      .sum(db.raw('COALESCE(sm.unit_cost * sm.quantity, 0) as total_cost'))
      .groupBy('p.id', 'p.name')
      .orderBy('total_cost', 'desc');

    return {
      totalIn,
      totalOut,
      totalLoss,
      estimatedCMV: costIn,
      details,
    };
  }
}

export const stockService = new StockService();
