import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('student_aliases');
  if (!exists) {
    await knex.schema.createTable('student_aliases', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('school_id').notNullable().references('id').inTable('schools').onDelete('CASCADE');
      table.uuid('student_id').notNullable().references('id').inTable('students').onDelete('CASCADE');
      table.string('alias', 255).notNullable();
      table.string('raw_alias', 255).notNullable();
      table.string('source', 50).defaultTo('vision_learned');
      table.timestamps(true, true);

      table.unique(['school_id', 'alias']);
    });

    await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_student_aliases_school ON student_aliases(school_id)');
    await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_student_aliases_student ON student_aliases(student_id)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('student_aliases');
}
