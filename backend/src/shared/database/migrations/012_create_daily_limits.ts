import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('daily_limits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('student_id').references('id').inTable('students').onDelete('CASCADE').unique();
    table.decimal('max_daily_amount', 10, 2);
    table.time('allowed_start_time');
    table.time('allowed_end_time');
    table.specificType('blocked_product_ids', 'UUID[]').defaultTo('{}');
    table.specificType('blocked_category_ids', 'UUID[]').defaultTo('{}');
    table.boolean('is_purchase_blocked').defaultTo(false);
    table.uuid('configured_by').references('id').inTable('users');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('daily_limits');
}
