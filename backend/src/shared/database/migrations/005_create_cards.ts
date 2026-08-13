import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cards', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('student_id').references('id').inTable('students').onDelete('CASCADE');
    table.string('card_number', 50).unique().notNullable();
    table.string('card_type', 10);
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_blocked').defaultTo(false);
    table.text('blocked_reason');
    table.timestamp('blocked_at', { useTz: true });
    table.timestamps(true, true);

    table.check('?? IN (?, ?)', ['card_type', 'nfc', 'qrcode']);
  });

  // Partial index for active cards only
  await knex.schema.raw(
    'CREATE INDEX idx_cards_number ON cards(card_number) WHERE is_active = true'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cards');
}
