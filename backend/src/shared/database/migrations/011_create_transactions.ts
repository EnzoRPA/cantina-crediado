import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('school_id').references('id').inTable('schools');
    table.uuid('student_id').references('id').inTable('students');
    table.uuid('cash_register_id').references('id').inTable('cash_registers');
    table.uuid('operator_id').references('id').inTable('users');
    table.decimal('total_amount', 10, 2).notNullable();
    table.decimal('discount_amount', 10, 2).defaultTo(0);
    table.decimal('final_amount', 10, 2).notNullable();
    table.string('status', 15).defaultTo('pending');
    table.string('identification_method', 15);
    table.boolean('is_offline').defaultTo(false);
    table.string('offline_id', 50);
    table.string('sync_status', 15).defaultTo('synced');
    table.text('receipt_url');
    table.text('notes');
    table.timestamps(true, true);

    table.check('?? IN (?, ?, ?, ?)', ['status', 'pending', 'completed', 'cancelled', 'refunded']);
    table.check('?? IN (?, ?, ?, ?)', ['identification_method', 'facial', 'card', 'manual', 'app']);
    table.check('?? IN (?, ?, ?)', ['sync_status', 'synced', 'pending', 'conflict']);
  });

  await knex.schema.createTable('transaction_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
    table.uuid('product_id').references('id').inTable('products');
    table.string('product_name', 255).notNullable(); // snapshot
    table.integer('quantity').notNullable();
    table.decimal('unit_price', 10, 2).notNullable(); // snapshot
    table.decimal('total_price', 10, 2).notNullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('transaction_payments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
    table.string('payment_method', 20).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('external_id', 255);
    table.string('status', 15).defaultTo('approved');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check(
      '?? IN (?, ?, ?, ?, ?)',
      ['payment_method', 'cash', 'debit_card', 'credit_card', 'pix', 'school_balance']
    );
  });

  await knex.schema.raw('CREATE INDEX idx_transactions_school_date ON transactions(school_id, created_at)');
  await knex.schema.raw('CREATE INDEX idx_transactions_student ON transactions(student_id, created_at)');
  await knex.schema.raw('CREATE INDEX idx_transactions_offline ON transactions(offline_id) WHERE offline_id IS NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transaction_payments');
  await knex.schema.dropTableIfExists('transaction_items');
  await knex.schema.dropTableIfExists('transactions');
}
