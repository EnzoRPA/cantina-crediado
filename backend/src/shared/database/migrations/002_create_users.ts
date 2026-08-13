import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('school_id').references('id').inTable('schools').onDelete('CASCADE');
    table.string('email', 255).notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255).notNullable();
    table.string('role', 20).notNullable();
    table.string('phone', 20);
    table.text('avatar_url');
    table.boolean('is_active').defaultTo(true);
    table.string('two_factor_secret', 255);
    table.boolean('two_factor_enabled').defaultTo(false);
    table.timestamp('last_login_at', { useTz: true });
    table.timestamps(true, true);

    // Check constraint for role
    table.check('?? IN (?, ?, ?, ?)', ['role', 'admin', 'operator', 'student', 'guardian']);

    // Unique email per school
    table.unique(['email', 'school_id']);
  });

  // Indexes
  await knex.schema.raw('CREATE INDEX idx_users_school_role ON users(school_id, role)');
  await knex.schema.raw('CREATE INDEX idx_users_email ON users(email)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
