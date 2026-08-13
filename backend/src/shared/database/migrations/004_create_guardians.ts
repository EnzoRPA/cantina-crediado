import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('guardians', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('cpf', 14).unique();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('student_guardians', (table) => {
    table.uuid('student_id').references('id').inTable('students').onDelete('CASCADE');
    table.uuid('guardian_id').references('id').inTable('guardians').onDelete('CASCADE');
    table.string('relationship', 20).defaultTo('parent');
    table.boolean('is_primary').defaultTo(false);
    table.primary(['student_id', 'guardian_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('student_guardians');
  await knex.schema.dropTableIfExists('guardians');
}
