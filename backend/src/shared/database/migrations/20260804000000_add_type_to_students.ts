import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('students', 'type');
  if (!hasColumn) {
    await knex.schema.alterTable('students', (table) => {
      table.string('type', 20).defaultTo('student');
    });
    await knex.schema.raw('CREATE INDEX idx_students_school_type ON students(school_id, type)');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('students', 'type');
  if (hasColumn) {
    await knex.schema.raw('DROP INDEX IF EXISTS idx_students_school_type');
    await knex.schema.alterTable('students', (table) => {
      table.dropColumn('type');
    });
  }
}
