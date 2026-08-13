import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('students', (t) => {
    t.string('class_group', 255).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('students', (t) => {
    t.string('class_group', 10).alter();
  });
}
