import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('stock_movements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('product_id').references('id').inTable('products');
    table.uuid('school_id').references('id').inTable('schools');
    table.string('type', 10).notNullable();
    table.integer('quantity').notNullable();
    table.decimal('unit_cost', 10, 2);
    table.text('reason');
    table.string('batch_number', 50);
    table.date('expiry_date');
    table.uuid('reference_id'); // can reference transaction or purchase order
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check('?? IN (?, ?, ?, ?)', ['type', 'in', 'out', 'adjust', 'loss']);
  });

  await knex.schema.raw('CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stock_movements');
}
