import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('school_id').references('id').inTable('schools');
    table.uuid('category_id').references('id').inTable('categories');
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('barcode', 50);
    table.text('image_url');
    table.decimal('cost_price', 10, 2);
    table.decimal('sale_price', 10, 2).notNullable();
    table.integer('current_stock').defaultTo(0);
    table.integer('min_stock').defaultTo(5);
    table.string('unit', 20).defaultTo('un');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_promotional').defaultTo(false);
    table.decimal('promotional_price', 10, 2);
    table.timestamp('promotion_start', { useTz: true });
    table.timestamp('promotion_end', { useTz: true });
    table.integer('expiry_alert_days').defaultTo(7);
    table.timestamps(true, true);
  });

  await knex.schema.raw('CREATE INDEX idx_products_school ON products(school_id, is_active)');
  await knex.schema.raw('CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL');
  await knex.schema.raw('CREATE INDEX idx_products_category ON products(category_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('products');
}
