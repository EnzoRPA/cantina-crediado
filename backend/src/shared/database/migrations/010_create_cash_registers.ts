import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cash_registers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('school_id').references('id').inTable('schools');
    table.uuid('operator_id').references('id').inTable('users');
    table.string('terminal_name', 50);
    table.decimal('opening_balance', 10, 2).notNullable();
    table.decimal('closing_balance', 10, 2);
    table.string('status', 10).defaultTo('open');
    table.timestamp('opened_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('closed_at', { useTz: true });
    table.text('notes');

    table.check('?? IN (?, ?)', ['status', 'open', 'closed']);
  });

  await knex.schema.createTable('cash_register_movements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('cash_register_id').references('id').inTable('cash_registers');
    table.string('type', 15).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('payment_method', 20);
    table.text('description');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check('?? IN (?, ?, ?, ?)', ['type', 'sale', 'refund', 'sangria', 'suprimento']);
  });

  await knex.schema.raw('CREATE INDEX idx_cash_registers_school ON cash_registers(school_id, status)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cash_register_movements');
  await knex.schema.dropTableIfExists('cash_registers');
}
