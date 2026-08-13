import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('students', (t) => {
    t.string('cpf', 14);
    t.string('gender', 50);
    t.string('phone', 20);
    t.text('address_full');
    t.string('guardian_name', 255);
    t.string('guardian_cpf', 14);
    t.string('guardian_rg', 30);
    t.string('guardian_phone', 20);
    t.string('class_group', 10);
    t.string('shift', 20);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('students', (t) => {
    t.dropColumns(
      'cpf',
      'gender',
      'phone',
      'address_full',
      'guardian_name',
      'guardian_cpf',
      'guardian_rg',
      'guardian_phone',
      'class_group',
      'shift'
    );
  });
}


