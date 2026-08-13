import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('students', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.uuid('school_id').references('id').inTable('schools');
    table.string('enrollment_number', 50).notNullable();
    table.string('grade', 20);
    table.decimal('balance', 10, 2).defaultTo(0);
    table.text('photo_url');
    table.date('birth_date');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.unique(['enrollment_number', 'school_id']);
  });

  await knex.schema.raw('CREATE INDEX idx_students_school ON students(school_id)');
  await knex.schema.raw('CREATE INDEX idx_students_balance ON students(school_id, balance)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('students');
}
