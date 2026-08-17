import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('students', 'billing_type');
  if (!hasColumn) {
    await knex.schema.alterTable('students', (table) => {
      table.string('billing_type', 20).defaultTo('pix_direto');
    });

    try {
      await knex.raw(`
        UPDATE students
        SET billing_type = 'crediario'
        WHERE id IN (
          SELECT DISTINCT t.student_id 
          FROM transactions t 
          JOIN transaction_payments tp ON tp.transaction_id = t.id 
          WHERE tp.payment_method = 'on_credit' AND t.student_id IS NOT NULL
        )
      `);
    } catch (_) {}
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('students', 'billing_type');
  if (hasColumn) {
    await knex.schema.alterTable('students', (table) => {
      table.dropColumn('billing_type');
    });
  }
}
