import { db } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type { ListCardsQuery, IssueCardInput, BlockCardInput } from './cards.schema';

export class CardsService {
  /**
   * List cards with pagination and filters.
   */
  async list(schoolId: string, query: ListCardsQuery): Promise<PaginatedResult<any>> {
    const { page, limit, studentId, isActive, isBlocked } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('cards as c')
      .join('students as s', 'c.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.school_id', schoolId);

    if (studentId) baseQuery = baseQuery.where('c.student_id', studentId);
    if (isActive !== undefined) baseQuery = baseQuery.where('c.is_active', isActive);
    if (isBlocked !== undefined) baseQuery = baseQuery.where('c.is_blocked', isBlocked);

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const data = await baseQuery
      .select(
        'c.id', 'c.card_number', 'c.card_type',
        'c.is_active', 'c.is_blocked', 'c.blocked_reason', 'c.blocked_at',
        'c.student_id', 'u.name as student_name',
        's.enrollment_number', 'c.created_at'
      )
      .orderBy('c.created_at', 'desc')
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
   * Issue (create) a new card for a student.
   */
  async issue(schoolId: string, input: IssueCardInput): Promise<Record<string, any>> {
    // Verify student exists
    const student = await db('students')
      .where({ id: input.studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    // Check card number uniqueness
    const existingCard = await db('cards')
      .where({ card_number: input.cardNumber })
      .first();

    if (existingCard) {
      throw Errors.conflict('Número de cartão já cadastrado');
    }

    const [card] = await db('cards')
      .insert({
        student_id: input.studentId,
        card_number: input.cardNumber,
        card_type: input.cardType,
      })
      .returning('*');

    logger.info({ cardId: card.id, studentId: input.studentId }, 'Card issued');
    return card;
  }

  /**
   * Get student info by card code.
   */
  async getStudentByCardCode(code: string): Promise<Record<string, any>> {
    const result = await db('cards as c')
      .join('students as s', 'c.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where({ 'c.card_number': code, 'c.is_active': true })
      .select(
        's.id as student_id', 'u.name', 'u.email',
        's.enrollment_number', 's.grade', 's.balance',
        's.photo_url', 'c.is_blocked', 'c.blocked_reason'
      )
      .first();

    if (!result) {
      throw Errors.notFound('Cartão');
    }

    if (result.is_blocked) {
      throw Errors.badRequest(`Cartão bloqueado: ${result.blocked_reason || 'sem motivo'}`);
    }

    return result;
  }

  /**
   * Block a card.
   */
  async block(schoolId: string, cardId: string, input: BlockCardInput): Promise<Record<string, any>> {
    const card = await db('cards as c')
      .join('students as s', 'c.student_id', 's.id')
      .where({ 'c.id': cardId, 's.school_id': schoolId })
      .select('c.*')
      .first();

    if (!card) throw Errors.notFound('Cartão');

    if (card.is_blocked) {
      throw Errors.badRequest('Cartão já está bloqueado');
    }

    const [updated] = await db('cards')
      .where({ id: cardId })
      .update({
        is_blocked: true,
        blocked_reason: input.reason,
        blocked_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info({ cardId, reason: input.reason }, 'Card blocked');
    return updated;
  }

  /**
   * Unblock a card.
   */
  async unblock(schoolId: string, cardId: string): Promise<Record<string, any>> {
    const card = await db('cards as c')
      .join('students as s', 'c.student_id', 's.id')
      .where({ 'c.id': cardId, 's.school_id': schoolId })
      .select('c.*')
      .first();

    if (!card) throw Errors.notFound('Cartão');

    if (!card.is_blocked) {
      throw Errors.badRequest('Cartão não está bloqueado');
    }

    const [updated] = await db('cards')
      .where({ id: cardId })
      .update({
        is_blocked: false,
        blocked_reason: null,
        blocked_at: null,
        updated_at: new Date(),
      })
      .returning('*');

    logger.info({ cardId }, 'Card unblocked');
    return updated;
  }

  /**
   * Deactivate a card (soft delete).
   */
  async deactivate(schoolId: string, cardId: string): Promise<void> {
    const card = await db('cards as c')
      .join('students as s', 'c.student_id', 's.id')
      .where({ 'c.id': cardId, 's.school_id': schoolId })
      .select('c.id')
      .first();

    if (!card) throw Errors.notFound('Cartão');

    await db('cards')
      .where({ id: cardId })
      .update({ is_active: false, updated_at: new Date() });

    logger.info({ cardId }, 'Card deactivated');
  }
}

export const cardsService = new CardsService();
