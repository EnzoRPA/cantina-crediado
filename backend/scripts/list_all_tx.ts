import knex from 'knex';

const NEON_URL = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || NEON_URL,
});

async function run() {
  try {
    console.log('--- TODAS AS TRANSAÇÕES E PAGAMENTOS NA BASE ---');

    // 1. Todas as transações
    const transactions = await db('transactions as t')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .select(
        't.id',
        't.student_id',
        'u.name as student_name',
        's.enrollment_number',
        's.billing_type',
        's.balance',
        't.total_amount',
        't.status',
        't.notes',
        't.created_at'
      )
      .orderBy('t.created_at', 'desc');

    console.log(`Total de transações na base: ${transactions.length}`);
    console.log(JSON.stringify(transactions, null, 2));

    // 2. Todos os transaction_payments
    const payments = await db('transaction_payments as tp')
      .leftJoin('transactions as t', 'tp.transaction_id', 't.id')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .select(
        'tp.id',
        'tp.transaction_id',
        'tp.payment_method',
        'tp.amount',
        'tp.status',
        'u.name as student_name',
        's.billing_type',
        't.notes'
      );

    console.log(`Total de pagamentos na base: ${payments.length}`);
    console.log(JSON.stringify(payments, null, 2));

    // 3. Verificar se existe algum outro banco SQLite (dev.sqlite3 ou similar) no disco
  } catch (err: any) {
    console.error('❌ Erro:', err);
  } finally {
    await db.destroy();
  }
}

run();
