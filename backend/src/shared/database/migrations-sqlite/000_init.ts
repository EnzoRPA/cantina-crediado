import { Knex } from 'knex';

/**
 * Consolidated migration for SQLite development mode.
 * Creates all tables in a single migration, using SQLite-compatible syntax.
 * For production (PostgreSQL), use the individual migrations in the migrations/ folder.
 */
export async function up(knex: Knex): Promise<void> {
  // ---- Schools ----
  await knex.schema.createTable('schools', (t) => {
    t.text('id').primary();
    t.string('name', 255).notNullable();
    t.string('cnpj', 18).unique();
    t.json('address').defaultTo('{}');
    t.string('phone', 20);
    t.string('email', 255);
    t.text('logo_url');
    t.json('settings').defaultTo('{}');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ---- Users ----
  await knex.schema.createTable('users', (t) => {
    t.text('id').primary();
    t.text('school_id').references('id').inTable('schools').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('email', 255).notNullable();
    t.string('password_hash', 255).notNullable();
    t.enum('role', ['admin', 'operator', 'guardian', 'student']).notNullable().defaultTo('student');
    t.string('phone', 20);
    t.text('avatar_url');
    t.boolean('two_factor_enabled').defaultTo(false);
    t.string('two_factor_secret');
    t.boolean('is_active').defaultTo(true);
    t.timestamp('last_login_at');
    t.timestamps(true, true);
    t.unique(['email', 'school_id']);
  });

  // ---- Students ----
  await knex.schema.createTable('students', (t) => {
    t.text('id').primary();
    t.text('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.text('school_id').references('id').inTable('schools');
    t.string('enrollment_number', 50);
    t.string('grade', 20);
    t.string('class_group', 10);
    t.string('shift', 20);
    t.decimal('balance', 12, 2).defaultTo(0);
    t.text('photo_url');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['enrollment_number', 'school_id']);
  });

  // ---- Guardians ----
  await knex.schema.createTable('guardians', (t) => {
    t.text('id').primary();
    t.text('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('cpf', 14).unique();
    t.string('relationship', 50);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ---- Student-Guardian Link ----
  await knex.schema.createTable('student_guardians', (t) => {
    t.text('student_id').references('id').inTable('students').onDelete('CASCADE');
    t.text('guardian_id').references('id').inTable('guardians').onDelete('CASCADE');
    t.string('relationship', 50).defaultTo('guardian');
    t.boolean('is_primary').defaultTo(false);
    t.timestamps(true, true);
    t.primary(['student_id', 'guardian_id']);
  });

  // ---- Cards ----
  await knex.schema.createTable('cards', (t) => {
    t.text('id').primary();
    t.text('student_id').references('id').inTable('students').onDelete('CASCADE');
    t.string('card_number', 50).unique().notNullable();
    t.string('card_type', 10);
    t.boolean('is_active').defaultTo(true);
    t.boolean('is_blocked').defaultTo(false);
    t.text('blocked_reason');
    t.timestamp('blocked_at');
    t.timestamps(true, true);
  });

  // ---- Facial Descriptors ----
  await knex.schema.createTable('facial_descriptors', (t) => {
    t.text('id').primary();
    t.text('student_id').references('id').inTable('students').onDelete('CASCADE').unique();
    t.text('descriptor_encrypted').notNullable();
    t.string('iv', 64).notNullable();
    t.string('auth_tag', 64).notNullable();
    t.text('consent_given_by').references('id').inTable('guardians');
    t.timestamp('consent_given_at');
    t.text('consent_document_url');
    t.timestamps(true, true);
  });

  // ---- Categories ----
  await knex.schema.createTable('categories', (t) => {
    t.text('id').primary();
    t.text('school_id').references('id').inTable('schools');
    t.string('name', 100).notNullable();
    t.text('description');
    t.text('icon_url');
    t.integer('sort_order').defaultTo(0);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ---- Products ----
  await knex.schema.createTable('products', (t) => {
    t.text('id').primary();
    t.text('school_id').references('id').inTable('schools');
    t.text('category_id').references('id').inTable('categories');
    t.string('name', 255).notNullable();
    t.text('description');
    t.text('barcode');
    t.decimal('cost_price', 12, 2).defaultTo(0);
    t.decimal('sale_price', 12, 2).notNullable();
    t.decimal('promotional_price', 12, 2);
    t.boolean('is_promotional').defaultTo(false);
    t.timestamp('promotion_start');
    t.timestamp('promotion_end');
    t.integer('current_stock').defaultTo(0);
    t.integer('min_stock').defaultTo(5);
    t.string('unit', 20).defaultTo('un');
    t.text('image_url');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ---- Stock Movements ----
  await knex.schema.createTable('stock_movements', (t) => {
    t.text('id').primary();
    t.text('product_id').references('id').inTable('products');
    t.text('school_id').references('id').inTable('schools');
    t.enum('type', ['in', 'out', 'adjust', 'loss']).notNullable();
    t.integer('quantity').notNullable();
    t.decimal('unit_cost', 12, 2);
    t.text('reason');
    t.text('reference_id');
    t.text('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  // ---- Cash Registers ----
  await knex.schema.createTable('cash_registers', (t) => {
    t.text('id').primary();
    t.text('school_id').references('id').inTable('schools');
    t.text('operator_id').references('id').inTable('users');
    t.string('terminal_name', 50);
    t.decimal('opening_balance', 12, 2).defaultTo(0);
    t.decimal('closing_balance', 12, 2);
    t.enum('status', ['open', 'closed']).defaultTo('open');
    t.timestamp('closed_at');
    t.text('notes');
    t.timestamps(true, true);
  });

  // ---- Cash Register Movements ----
  await knex.schema.createTable('cash_register_movements', (t) => {
    t.text('id').primary();
    t.text('cash_register_id').references('id').inTable('cash_registers');
    t.enum('type', ['sale', 'refund', 'sangria', 'suprimento']).notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.string('payment_method', 30);
    t.text('description');
    t.timestamps(true, true);
  });

  // ---- Transactions ----
  await knex.schema.createTable('transactions', (t) => {
    t.text('id').primary();
    t.text('school_id').references('id').inTable('schools');
    t.text('student_id').references('id').inTable('students');
    t.text('cash_register_id').references('id').inTable('cash_registers');
    t.text('operator_id').references('id').inTable('users');
    t.decimal('total_amount', 12, 2).notNullable();
    t.decimal('discount_amount', 12, 2).defaultTo(0);
    t.decimal('final_amount', 12, 2).notNullable();
    t.enum('status', ['pending', 'completed', 'cancelled', 'refunded']).defaultTo('pending');
    t.string('identification_method', 20);
    t.boolean('is_offline').defaultTo(false);
    t.string('offline_id', 50);
    t.string('sync_status', 20).defaultTo('synced');
    t.text('notes');
    t.timestamps(true, true);
  });

  // ---- Transaction Items ----
  await knex.schema.createTable('transaction_items', (t) => {
    t.text('id').primary();
    t.text('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
    t.text('product_id').references('id').inTable('products');
    t.string('product_name', 255).notNullable();
    t.integer('quantity').notNullable();
    t.decimal('unit_price', 12, 2).notNullable();
    t.decimal('total_price', 12, 2).notNullable();
    t.timestamps(true, true);
  });

  // ---- Transaction Payments ----
  await knex.schema.createTable('transaction_payments', (t) => {
    t.text('id').primary();
    t.text('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
    t.enum('payment_method', ['cash', 'debit_card', 'credit_card', 'pix', 'school_balance']).notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.enum('status', ['pending', 'approved', 'failed', 'refunded']).defaultTo('pending');
    t.string('external_id', 100);
    t.json('metadata').defaultTo('{}');
    t.timestamps(true, true);
  });

  // ---- Daily Limits ----
  await knex.schema.createTable('daily_limits', (t) => {
    t.text('id').primary();
    t.text('student_id').references('id').inTable('students').onDelete('CASCADE').unique();
    t.decimal('max_daily_amount', 12, 2);
    t.string('allowed_start_time', 5);
    t.string('allowed_end_time', 5);
    t.json('blocked_product_ids').defaultTo('[]');
    t.json('blocked_category_ids').defaultTo('[]');
    t.boolean('is_purchase_blocked').defaultTo(false);
    t.text('configured_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  // ---- Refresh Tokens ----
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.text('id').primary();
    t.text('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable();
    t.timestamp('expires_at').notNullable();
    t.boolean('is_revoked').defaultTo(false);
    t.json('device_info');
    t.timestamps(true, true);
  });

  // ---- WhatsApp Logs ----
  await knex.schema.createTable('whatsapp_logs', (t) => {
    t.text('id').primary();
    t.text('school_id').references('id').inTable('schools');
    t.text('recipient_user_id').references('id').inTable('users');
    t.string('recipient_phone', 20);
    t.string('template_name', 100);
    t.json('template_params').defaultTo('{}');
    t.enum('status', ['queued', 'sent', 'delivered', 'read', 'failed']).defaultTo('queued');
    t.text('error_message');
    t.string('external_id', 100);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'whatsapp_logs', 'refresh_tokens', 'daily_limits',
    'transaction_payments', 'transaction_items', 'transactions',
    'cash_register_movements', 'cash_registers', 'stock_movements',
    'products', 'categories', 'facial_descriptors', 'cards',
    'student_guardians', 'guardians', 'students', 'users', 'schools',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
