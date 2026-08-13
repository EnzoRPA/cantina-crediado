import bcrypt from 'bcryptjs';
import { db, searchLike } from '../../shared/database/knex';
import { AppError, Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type { ListUsersQuery, CreateUserInput, UpdateUserInput } from './users.schema';

const SALT_ROUNDS = 10;

export class UsersService {
  /**
   * List users with pagination, filtering, and search.
   */
  async list(schoolId: string, query: ListUsersQuery): Promise<PaginatedResult<any>> {
    const { page, limit, sortBy, sortOrder, search, role, isActive } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('users')
      .where('school_id', schoolId);

    // Filters
    if (role) baseQuery = baseQuery.where('role', role);
    if (isActive !== undefined) baseQuery = baseQuery.where('is_active', isActive);
    if (search) {
      baseQuery = baseQuery.where(function () {
        this.where(searchLike('name', search))
          .orWhere(searchLike('email', search));
      });
    }

    // Count total
    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    // Fetch page
    const data = await baseQuery
      .select(
        'id', 'email', 'name', 'role', 'phone', 'avatar_url',
        'is_active', 'two_factor_enabled', 'last_login_at',
        'created_at', 'updated_at'
      )
      .orderBy(sortBy, sortOrder)
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
   * Get a single user by ID.
   */
  async getById(schoolId: string, userId: string): Promise<Record<string, any>> {
    const user = await db('users')
      .where({ id: userId, school_id: schoolId })
      .select(
        'id', 'email', 'name', 'role', 'phone', 'avatar_url',
        'is_active', 'two_factor_enabled', 'last_login_at',
        'created_at', 'updated_at'
      )
      .first();

    if (!user) {
      throw Errors.notFound('Usuário');
    }

    return user;
  }

  /**
   * Create a new user (admin action).
   */
  async create(schoolId: string, input: CreateUserInput): Promise<Record<string, any>> {
    // Check for duplicate email
    const existing = await db('users')
      .where({ email: input.email, school_id: schoolId })
      .first();

    if (existing) {
      throw Errors.conflict('Email já cadastrado nesta escola');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const [user] = await db('users')
      .insert({
        email: input.email,
        password_hash: passwordHash,
        name: input.name,
        role: input.role,
        phone: input.phone || null,
        school_id: schoolId,
      })
      .returning(['id', 'email', 'name', 'role', 'phone', 'is_active', 'created_at']);

    logger.info({ userId: user.id, role: input.role }, 'User created');

    return user;
  }

  /**
   * Update an existing user.
   */
  async update(schoolId: string, userId: string, input: UpdateUserInput): Promise<Record<string, any>> {
    const existing = await db('users')
      .where({ id: userId, school_id: schoolId })
      .first();

    if (!existing) {
      throw Errors.notFound('Usuário');
    }

    // Check email uniqueness if changing
    if (input.email && input.email !== existing.email) {
      const emailTaken = await db('users')
        .where({ email: input.email, school_id: schoolId })
        .whereNot({ id: userId })
        .first();

      if (emailTaken) {
        throw Errors.conflict('Email já em uso');
      }
    }

    const updateData: Record<string, any> = { updated_at: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.isActive !== undefined) updateData.is_active = input.isActive;
    if (input.password !== undefined && input.password.trim() !== '') {
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      updateData.password_hash = passwordHash;
    }

    const [updated] = await db('users')
      .where({ id: userId })
      .update(updateData)
      .returning(['id', 'email', 'name', 'role', 'phone', 'is_active', 'updated_at']);

    logger.info({ userId }, 'User updated');

    return updated;
  }

  /**
   * Soft-delete (deactivate) a user.
   */
  async deactivate(schoolId: string, userId: string): Promise<void> {
    const existing = await db('users')
      .where({ id: userId, school_id: schoolId })
      .first();

    if (!existing) {
      throw Errors.notFound('Usuário');
    }

    await db('users')
      .where({ id: userId })
      .update({ is_active: false, updated_at: new Date() });

    logger.info({ userId }, 'User deactivated');
  }
}

export const usersService = new UsersService();
