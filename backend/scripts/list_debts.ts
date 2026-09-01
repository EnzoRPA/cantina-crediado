import knex from 'knex';

const NEON_URL = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || NEON_URL,
});

async function run() {
  console.log('Conectando ao banco ONLINE (Neon)...');
  const connTest = await db.raw('SELECT current_database(), current_user, inet_server_addr()');
  console.log('Banco:', connTest.rows[0].current_database);
  console.log('User:', connTest.rows[0].current_user);
  console.log('');

  const rows = await db('transaction_payments as tp')
    .join('transactions as t', 'tp.transaction_id', 't.id')
    .join('students as s', 't.student_id', 's.id')
    .join('users as u', 's.user_id', 'u.id')
    .where('tp.payment_method', 'on_credit')
    .where('tp.status', 'pending')
    .select(
      'u.name as name',
      's.enrollment_number',
      's.grade',
      's.class_group',
      's.balance',
      's.guardian_name',
      's.guardian_phone'
    )
    .sum('tp.amount as total_debt')
    .count('tp.id as pending_count')
    .groupBy('s.id', 'u.name', 's.enrollment_number', 's.grade', 's.class_group', 's.balance', 's.guardian_name', 's.guardian_phone')
    .orderBy('total_debt', 'desc');

  console.log('=== ALUNOS COM DÉBITO PENDENTE NO CREDIÁRIO (status = pending) ===');
  console.log('Total de alunos: ' + rows.length);
  console.log('');

  let totalGeral = 0;
  for (const r of rows) {
    const debt = Number(r.total_debt);
    totalGeral += debt;
    console.log('Aluno: ' + r.name);
    console.log('  Matrícula: ' + r.enrollment_number);
    console.log('  Série/Turma: ' + (r.grade || 'N/I') + ' ' + (r.class_group || ''));
    console.log('  Débito Total: R$ ' + debt.toFixed(2));
    console.log('  Qtd Parcelas Pendentes: ' + r.pending_count);
    console.log('  Saldo em Conta: R$ ' + Number(r.balance).toFixed(2));
    console.log('  Responsável: ' + (r.guardian_name || 'N/D') + ' (' + (r.guardian_phone || 'N/D') + ')');
    console.log('');
  }

  console.log('=== RESUMO ===');
  console.log('Débito Total Geral: R$ ' + totalGeral.toFixed(2));
  console.log('Total de Alunos: ' + rows.length);

  // Check total on_credit transactions by status
  const statusCounts = await db('transaction_payments')
    .where('payment_method', 'on_credit')
    .select('status')
    .count('id as count')
    .groupBy('status');

  console.log('\n=== TODAS AS TRANSAÇÕES on_credit POR STATUS ===');
  for (const r of statusCounts) {
    console.log('  ' + r.status + ': ' + r.count);
  }

  await db.destroy();
}

run();
