import knex from 'knex';

const NEON_URL = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || NEON_URL,
});

async function run() {
  try {
    console.log('--- DIAGNÓSTICO COMPLETO DA BASE DE DADOS ---');

    // 1. Contagem de alunos por billing_type
    const billingCounts = await db('students')
      .select('billing_type')
      .count('* as count')
      .groupBy('billing_type');
    console.log('\nAlunos por billing_type:', billingCounts);

    // 2. Todos os alunos com billing_type = 'pix_direto'
    const pixDiretoStudents = await db('students as s')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.billing_type', 'pix_direto')
      .select('s.id', 'u.name', 's.enrollment_number', 's.grade', 's.class_group', 's.balance', 's.billing_type');
    console.log(`\nTotal de alunos marcados como 'pix_direto': ${pixDiretoStudents.length}`);
    if (pixDiretoStudents.length <= 15) {
      console.log(pixDiretoStudents);
    } else {
      console.log(`Primeiros 10:`, pixDiretoStudents.slice(0, 10));
    }

    // 3. Todos os pagamentos com status = 'pending' na base inteira
    const allPendingPayments = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .where('tp.status', 'pending')
      .select(
        'tp.id as payment_id',
        'tp.payment_method',
        'tp.amount',
        'tp.status',
        't.id as transaction_id',
        't.notes as transaction_notes',
        't.status as transaction_status',
        't.created_at',
        's.id as student_id',
        'u.name as student_name',
        's.enrollment_number',
        's.billing_type'
      );
    console.log(`\nTodos os pagamentos com status PENDING na base: ${allPendingPayments.length}`);
    console.log(JSON.stringify(allPendingPayments, null, 2));

    // 4. Todas as transações com status = 'pending' na base inteira
    const allPendingTransactions = await db('transactions as t')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .where('t.status', 'pending')
      .select(
        't.id as transaction_id',
        't.notes',
        't.total_amount',
        't.status',
        't.created_at',
        's.id as student_id',
        'u.name as student_name',
        's.billing_type'
      );
    console.log(`\nTodas as transações com status PENDING na base: ${allPendingTransactions.length}`);
    console.log(JSON.stringify(allPendingTransactions, null, 2));

    // 5. Transações com notes contendo "Pix" ou "fiado" ou "online"
    const pixOrFiadoNotes = await db('transactions as t')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .where(function() {
        this.whereILike('t.notes', '%pix%')
          .orWhereILike('t.notes', '%fiado%')
          .orWhereILike('t.notes', '%crediario%');
      })
      .select(
        't.id',
        't.notes',
        't.total_amount',
        't.status',
        't.created_at',
        'u.name as student_name',
        's.billing_type'
      )
      .limit(30);
    console.log(`\nTransações com termos 'pix', 'fiado', 'crediario' nas notas: ${pixOrFiadoNotes.length}`);
    console.log(JSON.stringify(pixOrFiadoNotes, null, 2));

  } catch (err: any) {
    console.error('❌ Erro no diagnóstico:', err);
  } finally {
    await db.destroy();
  }
}

run();
