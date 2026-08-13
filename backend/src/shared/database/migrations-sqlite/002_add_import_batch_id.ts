import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('students', (t) => {
    t.string('import_batch_id', 50).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('students', (t) => {
    t.dropColumn('import_batch_id');
  });
}
