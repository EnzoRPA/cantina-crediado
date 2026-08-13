import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('facial_descriptors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('student_id').references('id').inTable('students').onDelete('CASCADE').unique();
    table.specificType('descriptor_encrypted', 'BYTEA').notNullable();
    table.specificType('iv', 'BYTEA').notNullable();
    table.specificType('auth_tag', 'BYTEA').notNullable();
    table.uuid('consent_given_by').references('id').inTable('guardians');
    table.timestamp('consent_given_at', { useTz: true }).notNullable();
    table.text('consent_document_url');
    table.string('model_version', 20).defaultTo('v1');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('facial_descriptors');
}
