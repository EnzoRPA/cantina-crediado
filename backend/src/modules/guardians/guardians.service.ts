import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db, searchLike } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type {
  ListGuardiansQuery,
  CreateGuardianInput,
  UpdateGuardianInput,
  LinkStudentInput,
} from './guardians.schema';

const SALT_ROUNDS = 10;

export class GuardiansService {
  /**
   * List guardians with pagination and search.
   */
  async list(schoolId: string, query: ListGuardiansQuery): Promise<PaginatedResult<any>> {
    const { page, limit, search } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('guardians as g')
      .join('users as u', 'g.user_id', 'u.id')
      .where('u.school_id', schoolId);

    if (search) {
      baseQuery = baseQuery.where(function () {
        this.where(searchLike('u.name', search))
          .orWhere(searchLike('u.email', search))
          .orWhere(searchLike('g.cpf', search));
      });
    }

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const data = await baseQuery
      .select(
        'g.id', 'u.name', 'u.email', 'u.phone', 'u.is_active',
        'g.cpf', 'g.created_at', 'g.updated_at'
      )
      .orderBy('u.name', 'asc')
      .limit(limit)
      .offset(offset);

    const guardianIds = data.map(g => g.id);
    let students: any[] = [];
    if (guardianIds.length > 0) {
      students = await db('student_guardians as sg')
        .join('students as s', 'sg.student_id', 's.id')
        .join('users as u', 's.user_id', 'u.id')
        .whereIn('sg.guardian_id', guardianIds)
        .select(
          'sg.guardian_id', 's.id', 'u.name', 's.enrollment_number',
          's.grade', 's.balance', 'sg.relationship', 'sg.is_primary'
        );
    }

    const studentsByGuardian = new Map<string, any[]>();
    for (const s of students) {
      if (!studentsByGuardian.has(s.guardian_id)) {
        studentsByGuardian.set(s.guardian_id, []);
      }
      studentsByGuardian.get(s.guardian_id)!.push(s);
    }

    const dataWithStudents = data.map(g => ({
      ...g,
      is_active: Boolean(g.is_active),
      students: studentsByGuardian.get(g.id) || [],
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataWithStudents,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get guardian by ID with linked students.
   */
  async getById(schoolId: string, guardianId: string): Promise<Record<string, any>> {
    const guardian = await db('guardians as g')
      .join('users as u', 'g.user_id', 'u.id')
      .where({ 'g.id': guardianId, 'u.school_id': schoolId })
      .select(
        'g.id', 'u.id as user_id', 'u.name', 'u.email', 'u.phone',
        'u.is_active', 'g.cpf', 'g.created_at', 'g.updated_at'
      )
      .first();

    if (!guardian) {
      throw Errors.notFound('Responsável');
    }

    // Get linked students
    const students = await db('student_guardians as sg')
      .join('students as s', 'sg.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where('sg.guardian_id', guardianId)
      .select(
        's.id', 'u.name', 's.enrollment_number', 's.grade',
        's.balance', 'sg.relationship', 'sg.is_primary'
      );

    return { ...guardian, students };
  }

  /**
   * Create a new guardian (creates user + guardian records).
   */
  async create(schoolId: string, input: CreateGuardianInput): Promise<Record<string, any>> {
    return db.transaction(async (trx) => {
      // Check duplicate email
      const existingUser = await trx('users')
        .where({ email: input.email, school_id: schoolId })
        .first();
      if (existingUser) {
        throw Errors.conflict('Email já cadastrado nesta escola');
      }

      // Check duplicate CPF if provided
      if (input.cpf) {
        const existingCpf = await trx('guardians')
          .where({ cpf: input.cpf })
          .first();
        if (existingCpf) {
          throw Errors.conflict('CPF já cadastrado');
        }
      }

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

      const [user] = await trx('users')
        .insert({
          email: input.email,
          password_hash: passwordHash,
          name: input.name,
          role: 'guardian',
          phone: input.phone || null,
          school_id: schoolId,
        })
        .returning(['id', 'email', 'name', 'phone']);

      const [guardian] = await trx('guardians')
        .insert({
          user_id: user.id,
          cpf: input.cpf || null,
        })
        .returning('*');

      logger.info({ guardianId: guardian.id, userId: user.id }, 'Guardian created');

      return {
        id: guardian.id,
        user_id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        cpf: guardian.cpf,
        created_at: guardian.created_at,
      };
    });
  }

  /**
   * Update guardian and/or user data.
   */
  async update(schoolId: string, guardianId: string, input: UpdateGuardianInput): Promise<Record<string, any>> {
    return db.transaction(async (trx) => {
      const guardian = await trx('guardians as g')
        .join('users as u', 'g.user_id', 'u.id')
        .where({ 'g.id': guardianId, 'u.school_id': schoolId })
        .select('g.*', 'u.id as user_id')
        .first();

      if (!guardian) {
        throw Errors.notFound('Responsável');
      }

      // Check CPF uniqueness if changing
      if (input.cpf && input.cpf !== guardian.cpf) {
        const cpfTaken = await trx('guardians')
          .where({ cpf: input.cpf })
          .whereNot({ id: guardianId })
          .first();
        if (cpfTaken) {
          throw Errors.conflict('CPF já em uso');
        }
      }

      // Update user record
      const userUpdates: Record<string, any> = {};
      if (input.name !== undefined) userUpdates.name = input.name;
      if (input.phone !== undefined) userUpdates.phone = input.phone;
      if (input.isActive !== undefined) userUpdates.is_active = input.isActive;
      if (Object.keys(userUpdates).length > 0) {
        userUpdates.updated_at = new Date();
        await trx('users').where({ id: guardian.user_id }).update(userUpdates);
      }

      // Update guardian record
      const guardianUpdates: Record<string, any> = { updated_at: new Date() };
      if (input.cpf !== undefined) guardianUpdates.cpf = input.cpf;

      await trx('guardians').where({ id: guardianId }).update(guardianUpdates);

      logger.info({ guardianId }, 'Guardian updated');

      return this.getById(schoolId, guardianId);
    });
  }

  /**
   * Link a student to a guardian.
   */
  async linkStudent(
    schoolId: string,
    guardianId: string,
    input: LinkStudentInput
  ): Promise<void> {
    // Verify guardian exists
    const guardian = await db('guardians as g')
      .join('users as u', 'g.user_id', 'u.id')
      .where({ 'g.id': guardianId, 'u.school_id': schoolId })
      .first();

    if (!guardian) {
      throw Errors.notFound('Responsável');
    }

    // Verify student exists
    const student = await db('students')
      .where({ id: input.studentId, school_id: schoolId })
      .first();

    if (!student) {
      throw Errors.notFound('Aluno');
    }

    // Check existing link
    const existingLink = await db('student_guardians')
      .where({ student_id: input.studentId, guardian_id: guardianId })
      .first();

    if (existingLink) {
      throw Errors.conflict('Aluno já vinculado a este responsável');
    }

    await db('student_guardians').insert({
      student_id: input.studentId,
      guardian_id: guardianId,
      relationship: input.relationship,
      is_primary: input.isPrimary,
    });

    logger.info({ guardianId, studentId: input.studentId }, 'Student linked to guardian');
  }

  /**
   * Unlink a student from a guardian.
   */
  async unlinkStudent(schoolId: string, guardianId: string, studentId: string): Promise<void> {
    const deleted = await db('student_guardians')
      .where({ student_id: studentId, guardian_id: guardianId })
      .del();

    if (deleted === 0) {
      throw Errors.notFound('Vínculo');
    }

    logger.info({ guardianId, studentId }, 'Student unlinked from guardian');
  }
  private async getOrCreateGuardianForUser(userId: string): Promise<any> {
    let guardian = await db('guardians').where({ user_id: userId }).first();
    if (!guardian) {
      const user = await db('users').where({ id: userId }).first();
      if (user) {
        const id = uuidv4();
        await db('guardians').insert({
          id,
          user_id: userId,
          cpf: user.phone ? user.phone.replace(/\D/g, '') : '00000000000',
        });
        guardian = await db('guardians').where({ id }).first();
      }
    }
    if (!guardian) {
      throw Errors.notFound('Perfil de responsável não encontrado');
    }
    return guardian;
  }

  /**
   * Get linked students for a guardian (by user ID).
   */
  async myStudents(userId: string, schoolId: string): Promise<any[]> {
    const guardian = await this.getOrCreateGuardianForUser(userId);

    const students = await db('student_guardians as sg')
      .join('students as s', 'sg.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where('sg.guardian_id', guardian.id)
      .where('s.school_id', schoolId)
      .select(
        's.id', 'u.name', 's.enrollment_number', 's.grade',
        's.class_group', 's.balance', 's.photo_url', 's.birth_date',
        'sg.relationship', 'sg.is_primary'
      );

    return students;
  }

  /**
   * Link a student self-service (from parent portal).
   */
  async linkStudentSelfService(
    userId: string,
    schoolId: string,
    enrollmentNumber: string,
    birthDate: string
  ): Promise<void> {
    // 1. Verify guardian exists or create if admin
    const guardian = await this.getOrCreateGuardianForUser(userId);

    // 2. Verify student exists by enrollment number and birth date
    let formattedBirthDate = birthDate;
    if (birthDate.includes('/')) {
      const parts = birthDate.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        formattedBirthDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    } else {
      const dObj = new Date(birthDate);
      if (!isNaN(dObj.getTime())) {
        formattedBirthDate = dObj.toISOString().split('T')[0];
      }
    }

    const student = await db('students')
      .where({
        enrollment_number: enrollmentNumber,
        school_id: schoolId
      })
      .andWhere(db.raw('DATE(birth_date) = ?', [formattedBirthDate]))
      .first();

    if (!student) {
      throw Errors.notFound('Estudante não encontrado com a matrícula e data de nascimento informadas');
    }

    // 3. Check existing link
    const existingLink = await db('student_guardians')
      .where({ student_id: student.id, guardian_id: guardian.id })
      .first();

    if (existingLink) {
      throw Errors.conflict('Você já possui vínculo com este estudante');
    }

    // 4. Link student
    await db('student_guardians').insert({
      student_id: student.id,
      guardian_id: guardian.id,
      relationship: 'parent',
      is_primary: false,
    });

    logger.info({ guardianId: guardian.id, studentId: student.id }, 'Student linked self-service');
  }

  /**
   * Get transaction history for a student linked to the guardian.
   */
  async studentTransactions(
    userId: string,
    schoolId: string,
    studentId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<PaginatedResult<any>> {
    const guardian = await this.getOrCreateGuardianForUser(userId);

    // Verify the student is linked to this guardian
    const link = await db('student_guardians')
      .where({ guardian_id: guardian.id, student_id: studentId })
      .first();
    if (!link) {
      throw Errors.notFound('Aluno não vinculado a este responsável');
    }

    const offset = (page - 1) * limit;

    const baseQuery = db('transactions')
      .where({ student_id: studentId, school_id: schoolId });

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const isPostgres = db.client.config.client === 'pg';
    const subquery = isPostgres
      ? "(SELECT string_agg(payment_method, ',') FROM transaction_payments WHERE transaction_id = transactions.id)"
      : "(SELECT group_concat(payment_method) FROM transaction_payments WHERE transaction_id = transactions.id)";

    const rawData = await baseQuery
      .clone()
      .select('transactions.*')
      .select(db.raw(`${subquery} as payment_methods`))
      .orderBy('transactions.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const data = rawData.map((tx: any) => {
      const isAdjustment = tx.identification_method === 'balance_adjustment' || (tx.identification_method === 'manual' && (tx.notes?.toLowerCase().includes('ajuste') || tx.notes?.toLowerCase().includes('saldo')));
      const isCredit = isAdjustment && tx.notes?.toLowerCase().includes('crédito');
      const isRechargePortal = tx.notes?.toLowerCase().includes('portal') || tx.notes?.toLowerCase().includes('recarga');

      let type = 'purchase';
      if (isCredit || isRechargePortal) type = 'credit';
      if (isAdjustment && !isCredit && !isRechargePortal) type = 'debit';

      return {
        id: tx.id,
        amount: tx.final_amount,
        type,
        status: tx.status,
        method: tx.payment_methods || (isAdjustment ? 'saldo' : 'outros'),
        description: tx.notes || (type === 'purchase' ? 'Compra na Cantina' : 'Ajuste de Saldo'),
        created_at: tx.created_at
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}

export const guardiansService = new GuardiansService();
