import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, searchLike } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type {
  ListStudentsQuery,
  CreateStudentInput,
  UpdateStudentInput,
  AdjustBalanceInput,
} from './students.schema';

const SALT_ROUNDS = 10;
const LOW_BALANCE_THRESHOLD = 10;

export class StudentsService {
  /**
   * List students with pagination, filtering, and search.
   */
  async list(schoolId: string, query: ListStudentsQuery): Promise<PaginatedResult<any>> {
    const { page, limit, sortBy, sortOrder, search, grade, type, billingType, isActive, lowBalance } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('students as s')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .where('s.school_id', schoolId);

    if (grade) baseQuery = baseQuery.where('s.grade', grade);
    if (type && type !== 'all') baseQuery = baseQuery.where('s.type', type);
    if (billingType && billingType !== 'all') baseQuery = baseQuery.where('s.billing_type', billingType);
    if (isActive !== undefined) baseQuery = baseQuery.where('s.is_active', isActive);
    if (lowBalance) baseQuery = baseQuery.where('s.balance', '<', LOW_BALANCE_THRESHOLD);
    if (search && search.trim()) {
      const fullSearch = search.trim();
      const terms = fullSearch.split(/\s+/).filter(Boolean);

      baseQuery = baseQuery.where(function () {
        // Direct match on full query
        this.where(function () {
          this.where(searchLike('u.name', fullSearch))
            .orWhere(searchLike('s.enrollment_number', fullSearch))
            .orWhere(searchLike('s.grade', fullSearch))
            .orWhere(searchLike('s.class_group', fullSearch))
            .orWhere(searchLike('u.email', fullSearch))
            .orWhere(searchLike('s.cpf', fullSearch))
            .orWhere(searchLike('s.guardian_name', fullSearch))
            .orWhere(searchLike('s.guardian_phone', fullSearch))
            .orWhereIn('s.id', function () {
              this.select('sg.student_id')
                .from('student_guardians as sg')
                .join('guardians as g', 'sg.guardian_id', 'g.id')
                .join('users as ug', 'g.user_id', 'ug.id')
                .where(searchLike('ug.name', fullSearch));
            });
        });

        // Multi-term match (e.g. "jose isaque 3º ano")
        if (terms.length > 1) {
          this.orWhere(function () {
            for (const term of terms) {
              this.where(function () {
                this.where(searchLike('u.name', term))
                  .orWhere(searchLike('s.enrollment_number', term))
                  .orWhere(searchLike('s.grade', term))
                  .orWhere(searchLike('s.class_group', term))
                  .orWhere(searchLike('u.email', term))
                  .orWhere(searchLike('s.cpf', term))
                  .orWhere(searchLike('s.guardian_name', term))
                  .orWhere(searchLike('s.guardian_phone', term))
                  .orWhereIn('s.id', function () {
                    this.select('sg.student_id')
                      .from('student_guardians as sg')
                      .join('guardians as g', 'sg.guardian_id', 'g.id')
                      .join('users as ug', 'g.user_id', 'ug.id')
                      .where(searchLike('ug.name', term));
                  });
              });
            }
          });
        }
      });
    }

    // Determine sort column
    const sortColumn = sortBy === 'name' ? 'u.name' : `s.${sortBy}`;

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const isPostgres = db.client.config.client === 'pg';
    const subqueryGuardians = isPostgres
      ? "(SELECT string_agg(u2.name, ', ') FROM student_guardians sg2 JOIN guardians g2 ON sg2.guardian_id = g2.id JOIN users u2 ON g2.user_id = u2.id WHERE sg2.student_id = s.id)"
      : "(SELECT group_concat(u2.name, ', ') FROM student_guardians sg2 JOIN guardians g2 ON sg2.guardian_id = g2.id JOIN users u2 ON g2.user_id = u2.id WHERE sg2.student_id = s.id)";

    const data = await baseQuery
      .select(
        's.id', 'u.name', 'u.email', 'u.phone',
        's.enrollment_number', 's.grade', 's.class_group', 's.balance', 's.type', 's.billing_type',
        's.photo_url', 's.birth_date', 's.is_active',
        's.cpf', 's.gender', 's.address_full',
        's.guardian_name', 's.guardian_cpf', 's.guardian_rg', 's.guardian_phone',
        's.is_marketing_sent',
        's.created_at', 's.updated_at',
        db.raw(`(SELECT COUNT(*) FROM student_guardians WHERE student_id = s.id) as guardian_count`),
        db.raw(`${subqueryGuardians} as linked_guardian_names`)
      )
      .orderBy(sortColumn, sortOrder)
      .limit(limit)
      .offset(offset);

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

  /**
   * Get student by ID with user data.
   */
  async getById(schoolId: string, studentId: string): Promise<Record<string, any>> {
    const student = await db('students as s')
      .join('users as u', 's.user_id', 'u.id')
      .where({ 's.id': studentId, 's.school_id': schoolId })
      .select(
        's.id', 'u.name', 'u.email', 'u.phone', 'u.id as user_id',
        's.enrollment_number', 's.grade', 's.class_group', 's.balance', 's.type', 's.billing_type',
        's.photo_url', 's.birth_date', 's.is_active',
        's.cpf', 's.gender', 's.address_full',
        's.guardian_name', 's.guardian_cpf', 's.guardian_rg', 's.guardian_phone',
        's.created_at', 's.updated_at'
      )
      .first();

    if (!student) {
      throw Errors.notFound('Aluno');
    }

    return student;
  }

  /**
   * Create a new student (creates both user + student records in a transaction).
   */
  async create(schoolId: string, input: CreateStudentInput): Promise<Record<string, any>> {
    return db.transaction(async (trx) => {
      const isEmployee = input.type === 'employee';
      const email = input.email && input.email.trim()
        ? input.email.trim()
        : (isEmployee ? `func_${Date.now()}_${Math.floor(Math.random() * 10000)}@cantina.local` : `aluno_${Date.now()}_${Math.floor(Math.random() * 10000)}@cantina.local`);

      const enrollmentNumber = input.enrollmentNumber && input.enrollmentNumber.trim()
        ? input.enrollmentNumber.trim()
        : (isEmployee ? `RE-${Date.now().toString().slice(-6)}` : `MAT-${Date.now().toString().slice(-6)}`);

      // Check duplicate email
      const existingUser = await trx('users')
        .where({ email, school_id: schoolId })
        .first();
      if (existingUser) {
        throw Errors.conflict('Email já cadastrado nesta escola');
      }

      // Check duplicate enrollment
      const existingEnrollment = await trx('students')
        .where({ enrollment_number: enrollmentNumber, school_id: schoolId })
        .first();
      if (existingEnrollment) {
        throw Errors.conflict('Número de matrícula/RE já cadastrado');
      }

      // Create user record
      const rawPassword = input.password && input.password.trim() ? input.password : 'Mudar123';
      const passwordHash = await bcrypt.hash(rawPassword, SALT_ROUNDS);

      const name = input.name && input.name.trim()
        ? input.name.trim()
        : (isEmployee ? `Funcionário ${enrollmentNumber}` : `Aluno ${enrollmentNumber}`);

      const [user] = await trx('users')
        .insert({
          id: crypto.randomUUID(),
          email,
          password_hash: passwordHash,
          name,
          role: 'student',
          phone: input.phone || null,
          school_id: schoolId,
        })
        .returning(['id', 'email', 'name']);

      // Create student record
      const [student] = await trx('students')
        .insert({
          id: crypto.randomUUID(),
          user_id: user.id,
          school_id: schoolId,
          enrollment_number: enrollmentNumber,
          type: input.type || 'student',
          billing_type: input.billingType || 'pix_direto',
          grade: input.grade || null,
          class_group: input.classGroup || null,
          birth_date: input.birthDate || null,
          photo_url: input.photoUrl || null,
          cpf: input.cpf || null,
          gender: input.gender || null,
          address_full: input.addressFull || null,
          guardian_name: input.guardianName || null,
          guardian_cpf: input.guardianCpf || null,
          guardian_rg: input.guardianRg || null,
          guardian_phone: input.guardianPhone || null,
          balance: 0,
        })
        .returning('*');

      logger.info({ studentId: student.id, userId: user.id }, 'Student created');

      return {
        ...student,
        name: user.name,
        email: user.email,
      };
    });
  }

  /**
   * Update student (and optionally user) data.
   */
  async update(schoolId: string, studentId: string, input: UpdateStudentInput): Promise<Record<string, any>> {
    await db.transaction(async (trx) => {
      const student = await trx('students')
        .where({ id: studentId, school_id: schoolId })
        .first();

      if (!student) {
        throw Errors.notFound('Aluno');
      }

      // Check enrollment uniqueness
      if (input.enrollmentNumber && input.enrollmentNumber !== student.enrollment_number) {
        const duplicate = await trx('students')
          .where({ enrollment_number: input.enrollmentNumber, school_id: schoolId })
          .whereNot({ id: studentId })
          .first();
        if (duplicate) {
          throw Errors.conflict('Número de matrícula já em uso');
        }
      }

      // Update user record if name/phone/email/password changed
      const userUpdates: Record<string, any> = {};
      if (input.name !== undefined) userUpdates.name = input.name;
      if (input.phone !== undefined) userUpdates.phone = input.phone;
      if (input.email !== undefined) {
        // Check email uniqueness if it changed
        const existingUser = await trx('users')
          .where({ email: input.email, school_id: schoolId })
          .whereNot({ id: student.user_id })
          .first();
        if (existingUser) {
          throw Errors.conflict('Email já em uso por outro usuário');
        }
        userUpdates.email = input.email;
      }
      if (input.password !== undefined && input.password.trim() !== '') {
        const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
        userUpdates.password_hash = passwordHash;
      }

      if (Object.keys(userUpdates).length > 0) {
        userUpdates.updated_at = new Date();
        await trx('users').where({ id: student.user_id }).update(userUpdates);
      }

      // Update student record
      const studentUpdates: Record<string, any> = { updated_at: new Date() };
      if (input.enrollmentNumber !== undefined) studentUpdates.enrollment_number = input.enrollmentNumber;
      if (input.type !== undefined) studentUpdates.type = input.type;
      if (input.billingType !== undefined) studentUpdates.billing_type = input.billingType;
      if (input.grade !== undefined) studentUpdates.grade = input.grade;
      if (input.classGroup !== undefined) studentUpdates.class_group = input.classGroup;
      if (input.birthDate !== undefined) studentUpdates.birth_date = input.birthDate;
      if (input.photoUrl !== undefined) studentUpdates.photo_url = input.photoUrl;
      if (input.isActive !== undefined) studentUpdates.is_active = input.isActive;
      if (input.cpf !== undefined) studentUpdates.cpf = input.cpf;
      if (input.gender !== undefined) studentUpdates.gender = input.gender;
      if (input.addressFull !== undefined) studentUpdates.address_full = input.addressFull;
      if (input.guardianName !== undefined) studentUpdates.guardian_name = input.guardianName;
      if (input.guardianCpf !== undefined) studentUpdates.guardian_cpf = input.guardianCpf;
      if (input.guardianRg !== undefined) studentUpdates.guardian_rg = input.guardianRg;
      if (input.guardianPhone !== undefined) studentUpdates.guardian_phone = input.guardianPhone;

      await trx('students').where({ id: studentId }).update(studentUpdates);

      logger.info({ studentId }, 'Student updated');
    });

    return this.getById(schoolId, studentId);
  }

  /**
   * Delete/Inactivate student by ID.
   */
  async delete(schoolId: string, studentId: string): Promise<{ success: boolean; message: string }> {
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) {
      throw Errors.notFound('Aluno/Cliente');
    }

    await db('students')
      .where({ id: studentId, school_id: schoolId })
      .update({ is_active: false, updated_at: new Date() });

    logger.info({ studentId, schoolId }, 'Student inactivated');
    return { success: true, message: 'Cliente desativado com sucesso' };
  }

  /**
   * Get student balance.
   */
  async getBalance(schoolId: string, studentId: string): Promise<{ balance: number }> {
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .select('balance')
      .first();

    if (!student) {
      throw Errors.notFound('Aluno');
    }

    return { balance: Number(student.balance) };
  }

  /**
   * Adjust student balance (credit or debit) with pessimistic locking.
   */
  async adjustBalance(
    schoolId: string,
    studentId: string,
    input: AdjustBalanceInput,
    operatorId: string
  ): Promise<{ balance: number }> {
    return db.transaction(async (trx) => {
      // Lock the student row to prevent race conditions
      const student = await trx('students')
        .where({ id: studentId, school_id: schoolId })
        .forUpdate()
        .first();

      if (!student) {
        throw Errors.notFound('Aluno');
      }

      const currentBalance = Number(student.balance);
      let newBalance: number;

      if (input.type === 'credit') {
        newBalance = currentBalance + input.amount;
      } else {
        if (currentBalance < input.amount) {
          throw Errors.badRequest(`Saldo insuficiente. Saldo atual: R$ ${currentBalance.toFixed(2)}`);
        }
        newBalance = currentBalance - input.amount;
      }

      await trx('students')
        .where({ id: studentId })
        .update({ balance: newBalance, updated_at: new Date() });

      // Create transaction record for the history
      const transactionId = crypto.randomUUID();
      await trx('transactions').insert({
        id: transactionId,
        school_id: schoolId,
        student_id: studentId,
        operator_id: operatorId,
        total_amount: input.amount,
        final_amount: input.amount,
        status: 'completed',
        notes: input.reason ? `${input.reason} (Ajuste)` : (input.type === 'credit' ? 'Crédito de Saldo' : 'Débito de Saldo'),
        identification_method: 'manual',
        created_at: new Date(),
        updated_at: new Date()
      });

      // If it's a credit, we should record how the money was received
      // We can use the reason to infer or expect a paymentMethod in the input
      await trx('transaction_payments').insert({
        id: crypto.randomUUID(),
        transaction_id: transactionId,
        payment_method: (input as any).paymentMethod || 'cash',
        amount: input.amount,
        status: 'approved',
      });

      logger.info(
        { studentId, type: input.type, amount: input.amount, newBalance, operatorId },
        'Balance adjusted'
      );

      return { balance: newBalance };
    });
  }

  /**
   * Get student transaction history.
   */
  async getTransactions(
    schoolId: string,
    studentId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResult<any>> {
    const offset = (page - 1) * limit;

    // Verify student exists
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) {
      throw Errors.notFound('Aluno');
    }

    const baseQuery = db('transactions')
      .where({ student_id: studentId, school_id: schoolId });

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const data = await baseQuery
      .clone()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

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

  /**
   * Import students from spreadsheet rows — optimized batch insert.
   * Reduces DB queries from O(n) to O(1) regardless of student count,
   * preventing timeouts on Render's free tier (30s request limit).
   */
  async importStudents(schoolId: string, rows: any[][]): Promise<{
    imported: number;
    total: number;
    errors: Array<{ row: number; enrollmentNumber: string; name: string; error: string }>;
  }> {
    const importBatchId = crypto.randomUUID();

    // Pre-compute bcrypt hashes once
    const defaultStudentHash = await bcrypt.hash('Mudar@123', 12);
    const defaultGuardianHash = await bcrypt.hash('Cantina@123', 12);

    const formatCPF = (val: any): string | null => {
      if (!val) return null;
      const digits = val.toString().replace(/\D/g, '');
      if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      }
      return digits.substring(0, 14) || null;
    };

    const parseDate = (val: any): string | null => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().split('T')[0];
      if (typeof val === 'number' && val > 20000 && val < 60000) {
        const utcDays = Math.floor(val - 25569);
        return new Date(utcDays * 86400 * 1000).toISOString().split('T')[0];
      }
      const str = val.toString().trim();
      const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (brMatch) {
        return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    };

    // ── Step 1: Parse all rows into memory (zero DB queries) ─────────────────
    interface ParsedRow {
      rowNum: number;
      enrollmentNumber: string;
      name: string;
      classGroup: string;
      cpf?: string;
      birthDate?: string;
      gender?: string;
      phone?: string;
      addressFull?: string;
      guardianName?: string;
      guardianCpf?: string;
      guardianRg?: string;
      guardianPhone?: string;
    }

    const parsedRows: ParsedRow[] = [];
    const errors: Array<{ row: number; enrollmentNumber: string; name: string; error: string }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const classGroup = row[0]?.toString().trim() || '';
      const enrollmentNumber = row[1]?.toString().trim() || '';
      const name = row[2]?.toString().trim() || '';

      if (!name && !enrollmentNumber) continue;

      if (!enrollmentNumber) {
        errors.push({ row: i + 1, enrollmentNumber: '', name, error: 'Número de matrícula não fornecido' });
        continue;
      }
      if (!name) {
        errors.push({ row: i + 1, enrollmentNumber, name: '', error: 'Nome do aluno não fornecido' });
        continue;
      }

      parsedRows.push({
        rowNum: i + 1,
        classGroup,
        enrollmentNumber,
        name,
        cpf: row[3]?.toString().trim() || undefined,
        birthDate: row[4]?.toString().trim() || undefined,
        gender: row[5]?.toString().trim() || undefined,
        phone: row[6]?.toString().trim() || undefined,
        addressFull: row[7]?.toString().trim() || undefined,
        guardianName: row[15]?.toString().trim() || undefined,
        guardianCpf: row[18]?.toString().trim() || undefined,
        guardianRg: row[19]?.toString().trim() || undefined,
        guardianPhone: row[20]?.toString().trim() || undefined,
      });
    }

    if (parsedRows.length === 0) {
      return { imported: 0, total: rows.length - 1, errors };
    }

    // ── Step 2: Bulk-fetch existing students via LEFT JOIN (1 query) ────────────
    // Uses LEFT JOIN to detect orphaned students (in students table but missing user record)
    const enrollmentNumbers = parsedRows.map(r => r.enrollmentNumber);

    const existingStudents = await db('students as s')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .where('s.school_id', schoolId)
      .whereIn('s.enrollment_number', enrollmentNumbers)
      .select(
        's.id', 's.user_id', 's.is_active', 's.enrollment_number',
        's.class_group', 's.birth_date', 's.cpf', 's.gender',
        's.address_full', 's.guardian_name', 's.guardian_cpf', 's.guardian_rg', 's.guardian_phone',
        db.raw('u.id as has_user')
      );

    const existingMap = new Map<string, typeof existingStudents[0]>(
      existingStudents.map(s => [s.enrollment_number, s])
    );

    // Bulk-fetch all emails in school to avoid collision (1 query)
    const existingEmails = await db('users').where({ school_id: schoolId }).pluck('email') as string[];
    const emailSet = new Set<string>(existingEmails);

    // ── Step 3: Categorize rows in memory ────────────────────────────────────
    interface StudentToInsert extends ParsedRow {
      email: string;
      userId: string;
      studentId: string;
    }
    interface StudentToRepair extends ParsedRow {
      email: string;
      newUserId: string;
      existingStudentId: string;
    }

    const toReactivate: Array<{ parsed: ParsedRow; existing: typeof existingStudents[0] }> = [];
    const toRepair: StudentToRepair[] = []; // orphaned: in students table but missing user record
    const toInsert: StudentToInsert[] = [];

    for (const parsed of parsedRows) {
      const existing = existingMap.get(parsed.enrollmentNumber);

      if (existing && !existing.has_user) {
        // Orphaned student — exists in students table but has no user record
        // Repair by creating the missing user and linking it
        let email = `${parsed.enrollmentNumber}@cantina.com`;
        let counter = 1;
        while (emailSet.has(email)) {
          email = `${parsed.enrollmentNumber}_${counter}@cantina.com`;
          counter++;
        }
        emailSet.add(email);
        toRepair.push({
          ...parsed,
          email,
          newUserId: crypto.randomUUID(),
          existingStudentId: existing.id,
        });
        continue;
      }

      if (existing && Number(existing.is_active) !== 0) {
        errors.push({
          row: parsed.rowNum,
          enrollmentNumber: parsed.enrollmentNumber,
          name: parsed.name,
          error: 'Aluno já cadastrado e ativo',
        });
        continue;
      }

      if (existing && Number(existing.is_active) === 0) {
        toReactivate.push({ parsed, existing });
        continue;
      }

      // New student — generate unique email in-memory (no DB round-trip)
      let email = `${parsed.enrollmentNumber}@cantina.com`;
      let counter = 1;
      while (emailSet.has(email)) {
        email = `${parsed.enrollmentNumber}_${counter}@cantina.com`;
        counter++;
      }
      emailSet.add(email);

      toInsert.push({
        ...parsed,
        email,
        userId: crypto.randomUUID(),
        studentId: crypto.randomUUID(),
      });
    }

    let successCount = 0;

    // ── Step 4: Reactivate inactive students in one transaction ──────────────
    if (toReactivate.length > 0) {
      await db.transaction(async (trx) => {
        for (const { parsed, existing } of toReactivate) {
          await trx('students').where({ id: existing.id }).update({
            is_active: true,
            class_group: parsed.classGroup || existing.class_group,
            birth_date: parseDate(parsed.birthDate) || existing.birth_date,
            cpf: formatCPF(parsed.cpf) || existing.cpf,
            gender: parsed.gender || existing.gender,
            address_full: parsed.addressFull || existing.address_full,
            guardian_name: parsed.guardianName || existing.guardian_name,
            guardian_cpf: formatCPF(parsed.guardianCpf) || existing.guardian_cpf,
            guardian_rg: parsed.guardianRg || existing.guardian_rg,
            guardian_phone: parsed.guardianPhone || existing.guardian_phone,
            import_batch_id: importBatchId,
            updated_at: new Date(),
          });
        }
      });
      successCount += toReactivate.length;
    }

    // ── Step 4.5: Repair orphaned students (create missing user records) ──────
    if (toRepair.length > 0) {
      const repairUsersPayload = toRepair.map(s => ({
        id: s.newUserId,
        email: s.email,
        password_hash: defaultStudentHash,
        name: s.name,
        role: 'student' as const,
        phone: s.phone || null,
        school_id: schoolId,
      }));

      await db.transaction(async (trx) => {
        // Batch-insert the missing user records
        const CHUNK = 500;
        for (let i = 0; i < repairUsersPayload.length; i += CHUNK) {
          await trx('users').insert(repairUsersPayload.slice(i, i + CHUNK));
        }
        // Link each orphaned student to its new user record
        for (const s of toRepair) {
          await trx('students').where({ id: s.existingStudentId }).update({
            user_id: s.newUserId,
            import_batch_id: importBatchId,
            updated_at: new Date(),
          });
        }
      });
      successCount += toRepair.length;

    }

    // ── Step 5: Batch-insert new students ────────────────────────────────────
    if (toInsert.length > 0) {
      const usersPayload = toInsert.map(s => ({
        id: s.userId,
        email: s.email,
        password_hash: defaultStudentHash,
        name: s.name,
        role: 'student' as const,
        phone: s.phone || null,
        school_id: schoolId,
      }));

      const studentsPayload = toInsert.map(s => ({
        id: s.studentId,
        user_id: s.userId,
        school_id: schoolId,
        enrollment_number: s.enrollmentNumber,
        class_group: s.classGroup,
        birth_date: parseDate(s.birthDate),
        balance: 0,
        cpf: formatCPF(s.cpf),
        gender: s.gender || null,
        address_full: s.addressFull || null,
        guardian_name: s.guardianName || null,
        guardian_cpf: formatCPF(s.guardianCpf),
        guardian_rg: s.guardianRg || null,
        guardian_phone: s.guardianPhone || null,
        import_batch_id: importBatchId,
      }));

      // ── Guardian batch prep (2 queries) ──────────────────────────────────
      const studentsWithGuardian = toInsert.filter(s => s.guardianName && s.guardianPhone);
      const uniqueGuardianPhones = [...new Set(studentsWithGuardian.map(s => s.guardianPhone!))];

      type GuardianUserRow = { id: string; phone: string | null };
      let existingGuardianUsers: GuardianUserRow[] = [];
      if (uniqueGuardianPhones.length > 0) {
        existingGuardianUsers = await db('users')
          .where({ role: 'guardian', school_id: schoolId })
          .whereIn('phone', uniqueGuardianPhones)
          .select('id', 'phone') as GuardianUserRow[];
      }
      const existingGuardianByPhone = new Map<string, string>(
        existingGuardianUsers.map(g => [g.phone!, g.id])
      );

      type GuardianRecordRow = { id: string; user_id: string };
      let existingGuardianRecords: GuardianRecordRow[] = [];
      if (existingGuardianUsers.length > 0) {
        existingGuardianRecords = await db('guardians')
          .whereIn('user_id', existingGuardianUsers.map(g => g.id))
          .select('id', 'user_id') as GuardianRecordRow[];
      }
      const existingGuardianRecordByUserId = new Map<string, string>(
        existingGuardianRecords.map(g => [g.user_id, g.id])
      );

      // Deduplicate new guardians by phone in-memory
      const newGuardiansByPhone = new Map<string, {
        userId: string;
        guardianId: string;
        email: string;
        parsed: StudentToInsert;
      }>();

      for (const s of studentsWithGuardian) {
        const phone = s.guardianPhone!;
        if (!existingGuardianByPhone.has(phone) && !newGuardiansByPhone.has(phone)) {
          let gEmail = `resp_${phone.replace(/\D/g, '')}@cantina.com`;
          let gCounter = 1;
          while (emailSet.has(gEmail)) {
            gEmail = `resp_${phone.replace(/\D/g, '')}_${gCounter}@cantina.com`;
            gCounter++;
          }
          emailSet.add(gEmail);
          newGuardiansByPhone.set(phone, {
            userId: crypto.randomUUID(),
            guardianId: crypto.randomUUID(),
            email: gEmail,
            parsed: s,
          });
        }
      }

      // ── Single transaction with all batch inserts ─────────────────────────
      const CHUNK = 500; // Stay under PostgreSQL's 65535 param limit
      await db.transaction(async (trx) => {
        // Batch-insert users
        for (let i = 0; i < usersPayload.length; i += CHUNK) {
          await trx('users').insert(usersPayload.slice(i, i + CHUNK));
        }
        // Batch-insert students
        for (let i = 0; i < studentsPayload.length; i += CHUNK) {
          await trx('students').insert(studentsPayload.slice(i, i + CHUNK));
        }

        // Batch-insert new guardian users + records
        if (newGuardiansByPhone.size > 0) {
          const guardianUsersPayload = [...newGuardiansByPhone.values()].map(({ userId, email, parsed }) => ({
            id: userId,
            email,
            password_hash: defaultGuardianHash,
            name: parsed.guardianName!,
            role: 'guardian' as const,
            phone: parsed.guardianPhone!,
            school_id: schoolId,
          }));
          await trx('users').insert(guardianUsersPayload);

          const guardianRecordsPayload = [...newGuardiansByPhone.values()].map(({ guardianId, userId, parsed }) => ({
            id: guardianId,
            user_id: userId,
            cpf: formatCPF(parsed.guardianCpf),
          }));
          await trx('guardians').insert(guardianRecordsPayload);
        }

        // Batch-insert student_guardians links
        const studentGuardiansPayload: Array<{
          student_id: string;
          guardian_id: string;
          relationship: string;
          is_primary: boolean;
        }> = [];

        for (const s of studentsWithGuardian) {
          const phone = s.guardianPhone!;
          let guardianId: string | undefined;

          if (existingGuardianByPhone.has(phone)) {
            const gUserId = existingGuardianByPhone.get(phone)!;
            guardianId = existingGuardianRecordByUserId.get(gUserId);
          } else if (newGuardiansByPhone.has(phone)) {
            guardianId = newGuardiansByPhone.get(phone)!.guardianId;
          }

          if (guardianId) {
            studentGuardiansPayload.push({
              student_id: s.studentId,
              guardian_id: guardianId,
              relationship: 'Responsável',
              is_primary: true,
            });
          }
        }

        if (studentGuardiansPayload.length > 0) {
          await trx('student_guardians').insert(studentGuardiansPayload);
        }
      });

      successCount += toInsert.length;
    }

    logger.info(
      { schoolId, imported: successCount, errors: errors.length, importBatchId },
      'Student import completed'
    );

    return {
      imported: successCount,
      total: rows.length - 1,
      errors,
    };
  }

  /**
   * Revert the most recent spreadsheet import in a school.
   */
  async revertLastImport(schoolId: string): Promise<number> {
    const lastBatch = await db('students')
      .where({ school_id: schoolId })
      .whereNotNull('import_batch_id')
      .orderBy('created_at', 'desc')
      .select('import_batch_id')
      .first();

    if (!lastBatch || !lastBatch.import_batch_id) {
       throw Errors.notFound('Nenhuma importação recente encontrada.');
    }

    const batchId = lastBatch.import_batch_id;
    
    const studentsToRevert = await db('students').where({ import_batch_id: batchId, school_id: schoolId }).select('user_id');
    const userIds = studentsToRevert.map(s => s.user_id);
    
    if (userIds.length === 0) return 0;

    return db.transaction(async (trx) => {
       await trx('students').whereIn('user_id', userIds).del();
       await trx('users').whereIn('id', userIds).del();
       return userIds.length;
    });
  }

  /**
   * Update a student's marketing/divulgação status.
   */
  async updateMarketingStatus(schoolId: string, studentId: string, isMarketingSent: boolean): Promise<Record<string, any>> {
    const student = await db('students')
      .where({ id: studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    await db('students')
      .where({ id: studentId })
      .update({
        is_marketing_sent: isMarketingSent ? 1 : 0,
        updated_at: db.fn.now()
      });

    return { id: studentId, is_marketing_sent: isMarketingSent };
  }
}

export const studentsService = new StudentsService();
