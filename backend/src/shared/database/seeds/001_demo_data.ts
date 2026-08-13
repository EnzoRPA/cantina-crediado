import { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Demo seed — works with both PostgreSQL and SQLite.
 * Uses fixed UUIDs so we can reference across tables.
 */
export async function seed(knex: Knex): Promise<void> {
  const isPg = knex.client.config.client === 'pg';

  // Clean all tables in correct order (respecting foreign keys)
  const tables = [
    'refresh_tokens', 'whatsapp_logs', 'daily_limits',
    'transaction_payments', 'transaction_items', 'transactions',
    'cash_register_movements', 'cash_registers', 'stock_movements',
    'products', 'categories', 'facial_descriptors', 'cards',
    'student_guardians', 'guardians', 'students', 'users', 'schools',
  ];

  for (const table of tables) {
    await knex(table).del();
  }

  // Fixed UUIDs for predictable references
  const ids = {
    school:       'a0000000-0000-0000-0000-000000000001',
    adminUser:    'b0000000-0000-0000-0000-000000000001',
    operatorUser: 'b0000000-0000-0000-0000-000000000002',
    studentUser1: 'b0000000-0000-0000-0000-000000000003',
    studentUser2: 'b0000000-0000-0000-0000-000000000004',
    guardianUser: 'b0000000-0000-0000-0000-000000000005',
    student1:     'c0000000-0000-0000-0000-000000000001',
    student2:     'c0000000-0000-0000-0000-000000000002',
    guardian1:    'd0000000-0000-0000-0000-000000000001',
    catBebidas:   'e0000000-0000-0000-0000-000000000001',
    catLanches:   'e0000000-0000-0000-0000-000000000002',
    catDoces:     'e0000000-0000-0000-0000-000000000003',
    catRefeicoes: 'e0000000-0000-0000-0000-000000000004',
  };

  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const operatorHash = await bcrypt.hash('Caixa@123', 12);
  const studentHash  = await bcrypt.hash('Aluno@123', 12);
  const guardianHash = await bcrypt.hash('Pais@1234', 12);

  // ---- School ----
  await knex('schools').insert({
    id: ids.school,
    name: 'Escola Demo - Colégio São Paulo',
    cnpj: '12.345.678/0001-90',
    email: 'contato@colegiosaopaulo.edu.br',
    phone: '(11) 3456-7890',
    address: JSON.stringify({
      street: 'Rua das Flores, 123',
      city: 'São Paulo',
      state: 'SP',
      zip: '01234-567',
    }),
    settings: JSON.stringify({
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      allowOfflinePOS: true,
      maxOfflineHours: 4,
    }),
  });

  // ---- Users ----
  await knex('users').insert([
    {
      id: ids.adminUser,
      school_id: ids.school,
      email: 'admin@cantina.com',
      password_hash: passwordHash,
      name: 'Administrador',
      role: 'admin',
      phone: '(11) 99999-0001',
    },
    {
      id: ids.operatorUser,
      school_id: ids.school,
      email: 'caixa@cantina.com',
      password_hash: operatorHash,
      name: 'Maria Operadora',
      role: 'operator',
      phone: '(11) 99999-0002',
    },
    {
      id: ids.studentUser1,
      school_id: ids.school,
      email: 'joao.aluno@escola.com',
      password_hash: studentHash,
      name: 'João Silva',
      role: 'student',
    },
    {
      id: ids.studentUser2,
      school_id: ids.school,
      email: 'ana.aluna@escola.com',
      password_hash: studentHash,
      name: 'Ana Souza',
      role: 'student',
    },
    {
      id: ids.guardianUser,
      school_id: ids.school,
      email: 'carlos.pai@email.com',
      password_hash: guardianHash,
      name: 'Carlos Silva',
      role: 'guardian',
      phone: '(11) 98765-4321',
    },
  ]);

  // ---- Students ----
  await knex('students').insert([
    {
      id: ids.student1,
      user_id: ids.studentUser1,
      school_id: ids.school,
      enrollment_number: '2024001',
      grade: '8º Ano',
      class_group: 'A',
      shift: 'morning',
      balance: 50.00,
    },
    {
      id: ids.student2,
      user_id: ids.studentUser2,
      school_id: ids.school,
      enrollment_number: '2024002',
      grade: '7º Ano',
      class_group: 'B',
      shift: 'morning',
      balance: 30.00,
    },
  ]);

  // ---- Guardian ----
  await knex('guardians').insert({
    id: ids.guardian1,
    user_id: ids.guardianUser,
    cpf: '123.456.789-00',
  });

  await knex('student_guardians').insert([
    { student_id: ids.student1, guardian_id: ids.guardian1, relationship: 'father', is_primary: true },
    { student_id: ids.student2, guardian_id: ids.guardian1, relationship: 'father', is_primary: false },
  ]);

  // ---- Cards ----
  await knex('cards').insert([
    { id: uuidv4(), student_id: ids.student1, card_number: '152', card_type: 'nfc', is_active: true, is_blocked: false },
    { id: uuidv4(), student_id: ids.student2, card_number: '153', card_type: 'qrcode', is_active: true, is_blocked: false },
  ]);

  // ---- Categories ----
  await knex('categories').insert([
    { id: ids.catBebidas,   school_id: ids.school, name: 'Bebidas',   sort_order: 1 },
    { id: ids.catLanches,   school_id: ids.school, name: 'Lanches',   sort_order: 2 },
    { id: ids.catDoces,     school_id: ids.school, name: 'Doces',     sort_order: 3 },
    { id: ids.catRefeicoes, school_id: ids.school, name: 'Refeições', sort_order: 4 },
  ]);

  // ---- Products ----
  await knex('products').insert([
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catBebidas,
      name: 'Água Mineral 500ml', barcode: '7891234560001',
      cost_price: 0.80, sale_price: 2.50, current_stock: 200, min_stock: 50,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catBebidas,
      name: 'Suco Natural 300ml', barcode: '7891234560002',
      cost_price: 1.50, sale_price: 5.00, current_stock: 100, min_stock: 30,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catBebidas,
      name: 'Refrigerante Lata 350ml', barcode: '7891234560003',
      cost_price: 1.80, sale_price: 4.50, current_stock: 150, min_stock: 40,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catLanches,
      name: 'Coxinha', barcode: '7891234560010',
      cost_price: 1.20, sale_price: 4.00, current_stock: 50, min_stock: 15,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catLanches,
      name: 'Pão de Queijo (3 unidades)', barcode: '7891234560011',
      cost_price: 1.50, sale_price: 5.00, current_stock: 60, min_stock: 20,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catLanches,
      name: 'X-Burger', barcode: '7891234560012',
      cost_price: 3.50, sale_price: 8.00, current_stock: 30, min_stock: 10,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catDoces,
      name: 'Brigadeiro', barcode: '7891234560020',
      cost_price: 0.50, sale_price: 2.00, current_stock: 80, min_stock: 20,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catDoces,
      name: 'Bolo de Cenoura (fatia)', barcode: '7891234560021',
      cost_price: 1.00, sale_price: 4.50, current_stock: 25, min_stock: 10,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catRefeicoes,
      name: 'Marmitex do Dia', barcode: '7891234560030',
      cost_price: 6.00, sale_price: 15.00, current_stock: 40, min_stock: 10,
    },
    {
      id: uuidv4(), school_id: ids.school, category_id: ids.catRefeicoes,
      name: 'Salada de Frutas', barcode: '7891234560031',
      cost_price: 2.50, sale_price: 7.00, current_stock: 20, min_stock: 8,
    },
  ]);

  // ---- Daily Limits ----
  await knex('daily_limits').insert({
    id: uuidv4(),
    student_id: ids.student1,
    max_daily_amount: 20.00,
    allowed_start_time: '07:00',
    allowed_end_time: '17:00',
    blocked_category_ids: isPg ? [ids.catDoces] : JSON.stringify([ids.catDoces]),
    configured_by: ids.guardianUser,
  });

  console.log('');
  console.log('✅ Dados de demonstração inseridos!');
  console.log('');
  console.log('📋 Credenciais de teste:');
  console.log('   Admin:    admin@cantina.com     / Admin@123');
  console.log('   Caixa:    caixa@cantina.com     / Caixa@123');
  console.log('   Aluno:    joao.aluno@escola.com / Aluno@123');
  console.log('   Pai:      carlos.pai@email.com  / Pais@1234');
  console.log(`   Escola ID: ${ids.school}`);
  console.log('   Cartões:  CARD-2024-001 (João) / CARD-2024-002 (Ana)');
  console.log('');
}
