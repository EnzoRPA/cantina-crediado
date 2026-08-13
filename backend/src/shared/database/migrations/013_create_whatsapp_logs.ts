import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('whatsapp_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('school_id').references('id').inTable('schools');
    table.string('recipient_phone', 20).notNullable();
    table.uuid('recipient_user_id').references('id').inTable('users');
    table.string('message_type', 30).notNullable();
    table.text('message_content');
    table.string('status', 15).defaultTo('pending');
    table.string('external_id', 255);
    table.text('error_message');
    table.timestamp('sent_at', { useTz: true });
    table.timestamp('delivered_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check(
      '?? IN (?, ?, ?, ?, ?)',
      ['status', 'pending', 'sent', 'delivered', 'read', 'failed']
    );
  });

  await knex.schema.raw('CREATE INDEX idx_whatsapp_logs_status ON whatsapp_logs(status, created_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('whatsapp_logs');
}
