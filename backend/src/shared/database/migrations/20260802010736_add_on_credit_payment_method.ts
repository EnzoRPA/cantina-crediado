import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg';

  if (isPostgres) {
    // Drop the old check constraint
    await knex.schema.raw('ALTER TABLE transaction_payments DROP CONSTRAINT IF EXISTS transaction_payments_payment_method_check');
    // Add the new check constraint with 'on_credit' included
    await knex.schema.raw("ALTER TABLE transaction_payments ADD CONSTRAINT transaction_payments_payment_method_check CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix', 'school_balance', 'on_credit'))");
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg';

  if (isPostgres) {
    // Drop the new constraint
    await knex.schema.raw('ALTER TABLE transaction_payments DROP CONSTRAINT IF EXISTS transaction_payments_payment_method_check');
    // Restore the old check constraint
    await knex.schema.raw("ALTER TABLE transaction_payments ADD CONSTRAINT transaction_payments_payment_method_check CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix', 'school_balance'))");
  }
}
