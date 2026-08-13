import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('students', 'type');
  if (!hasColumn) {
    await knex.schema.alterTable('students', (table) => {
      table.string('type', 20).defaultTo('student');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('students', 'type');
  if (hasColumn) {
    await knex.schema.alterTable('students', (table) => {
      table.dropColumn('type');
    });
  }
}
