import { db } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { UpsertDailyLimitInput, CheckLimitInput } from './daily-limits.schema';

export class DailyLimitsService {
  /**
   * Get the daily limit configuration for a student.
   */
  async getByStudentId(schoolId: string, studentId: string): Promise<Record<string, any> | null> {
    // Verify student exists
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    const limit = await db('daily_limits')
      .where({ student_id: studentId })
      .first();

    if (!limit) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpent = await db('transactions')
      .where({ student_id: studentId, school_id: schoolId })
      .where('status', 'completed')
      .where('created_at', '>=', today)
      .sum('final_amount as total')
      .first();

    const spentSoFar = Number(todaySpent?.total || 0);
    const maxDailyAmount = Number(limit.max_daily_amount || 0);
    const remainingToday = limit.max_daily_amount ? Math.max(0, maxDailyAmount - spentSoFar) : null;

    return {
      ...limit,
      spent_today: spentSoFar,
      remaining_today: remainingToday,
    };
  }

  /**
   * Create or update the daily limit configuration for a student.
   */
  async upsert(
    schoolId: string,
    studentId: string,
    input: UpsertDailyLimitInput,
    configuredBy: string
  ): Promise<Record<string, any>> {
    // Verify student exists
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    // Validate time window
    if (input.allowedStartTime && input.allowedEndTime) {
      if (input.allowedStartTime >= input.allowedEndTime) {
        throw Errors.badRequest('Horário de início deve ser anterior ao horário de fim');
      }
    }

    const data = {
      student_id: studentId,
      max_daily_amount: input.maxDailyAmount ?? null,
      allowed_start_time: input.allowedStartTime ?? null,
      allowed_end_time: input.allowedEndTime ?? null,
      blocked_product_ids: input.blockedProductIds,
      blocked_category_ids: input.blockedCategoryIds,
      is_purchase_blocked: input.isPurchaseBlocked,
      configured_by: configuredBy,
      updated_at: new Date(),
    };

    const existing = await db('daily_limits')
      .where({ student_id: studentId })
      .first();

    let result;

    if (existing) {
      [result] = await db('daily_limits')
        .where({ student_id: studentId })
        .update(data)
        .returning('*');
    } else {
      [result] = await db('daily_limits')
        .insert(data)
        .returning('*');
    }

    logger.info({ studentId, configuredBy }, 'Daily limit configured');
    return result;
  }

  /**
   * Check if a purchase is allowed based on daily limits.
   * Returns { allowed: boolean, reason?: string }.
   */
  async checkPurchase(
    schoolId: string,
    studentId: string,
    input: CheckLimitInput
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Verify student exists
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    const limits = await db('daily_limits')
      .where({ student_id: studentId })
      .first();

    // No limits configured = allow everything
    if (!limits) {
      return { allowed: true };
    }

    // Check if purchases are completely blocked
    if (limits.is_purchase_blocked) {
      return { allowed: false, reason: 'Compras bloqueadas pelo responsável' };
    }

    // Check time window
    if (limits.allowed_start_time && limits.allowed_end_time) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (currentTime < limits.allowed_start_time || currentTime > limits.allowed_end_time) {
        return {
          allowed: false,
          reason: `Compras permitidas somente entre ${limits.allowed_start_time} e ${limits.allowed_end_time}`,
        };
      }
    }

    // Check daily spending limit
    if (limits.max_daily_amount) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todaySpent = await db('transactions')
        .where({ student_id: studentId, school_id: schoolId })
        .where('status', 'completed')
        .where('created_at', '>=', today)
        .sum('final_amount as total')
        .first();

      const spentSoFar = Number(todaySpent?.total || 0);
      const wouldSpend = spentSoFar + input.amount;

      if (wouldSpend > Number(limits.max_daily_amount)) {
        const remaining = Number(limits.max_daily_amount) - spentSoFar;
        return {
          allowed: false,
          reason: `Limite diário excedido. Restante: R$ ${Math.max(0, remaining).toFixed(2)}`,
        };
      }
    }

    // Check blocked products
    if (input.productIds && limits.blocked_product_ids?.length > 0) {
      const blockedProducts = input.productIds.filter(
        (id: string) => limits.blocked_product_ids.includes(id)
      );

      if (blockedProducts.length > 0) {
        // Get product names for the error message
        const products = await db('products')
          .whereIn('id', blockedProducts)
          .select('name');

        const names = products.map((p: any) => p.name).join(', ');
        return {
          allowed: false,
          reason: `Produto(s) bloqueado(s): ${names}`,
        };
      }
    }

    // Check blocked categories
    if (input.productIds && limits.blocked_category_ids?.length > 0) {
      const productsInBlockedCategories = await db('products')
        .whereIn('id', input.productIds)
        .whereIn('category_id', limits.blocked_category_ids)
        .select('name');

      if (productsInBlockedCategories.length > 0) {
        const names = productsInBlockedCategories.map((p: any) => p.name).join(', ');
        return {
          allowed: false,
          reason: `Produto(s) em categoria bloqueada: ${names}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Delete daily limit config for a student.
   */
  async delete(schoolId: string, studentId: string): Promise<void> {
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    await db('daily_limits').where({ student_id: studentId }).del();

    logger.info({ studentId }, 'Daily limit removed');
  }
}

export const dailyLimitsService = new DailyLimitsService();
