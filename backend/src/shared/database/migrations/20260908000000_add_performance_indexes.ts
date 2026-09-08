import { Knex } from 'knex';

/**
 * Performance indexes to speed up the students list query
 * and other common access patterns.
 */
export async function up(knex: Knex): Promise<void> {
  // Composite index: students filtered by school + active status (most common list query)
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_students_school_active ON students(school_id, is_active)');
  // Sort by enrollment_number within a school
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_students_school_enrollment ON students(school_id, enrollment_number)');
  // Sort by balance within a school
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_students_school_balance ON students(school_id, balance)');
  // Type filter
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_students_school_type ON students(school_id, type)');
  // Billing type filter
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_students_school_billing ON students(school_id, billing_type)');
  // Left join performance: user_id lookup
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id)');
  // Guardian search subquery
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians(student_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_students_school_active');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_students_school_enrollment');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_students_school_balance');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_students_school_type');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_students_school_billing');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_students_user_id');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_student_guardians_student');
}
