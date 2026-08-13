const knex = require('./knexfile.js');
const db = require('knex')(knex.development);

async function debug() {
  console.log('\n=== 1. ALUNOS com nome Ana ===');
  const students = await db('students as s')
    .join('users as u', 's.user_id', 'u.id')
    .where('u.name', 'like', '%Ana%')
    .select('s.id as student_id', 's.user_id', 'u.name', 's.enrollment_number', 's.grade');
  console.log(JSON.stringify(students, null, 2));

  for (const s of students) {
    console.log(`\n=== 2. TRANSAÇÕES para student_id = ${s.student_id} ===`);
    const txByStudentId = await db('transactions')
      .where('student_id', s.student_id)
      .select('id', 'student_id', 'final_amount', 'status', 'notes', 'created_at');
    console.log(JSON.stringify(txByStudentId, null, 2));

    console.log(`\n=== 3. TRANSAÇÕES para user_id = ${s.user_id} ===`);
    const txByUserId = await db('transactions')
      .where('student_id', s.user_id)
      .select('id', 'student_id', 'final_amount', 'status', 'notes', 'created_at');
    console.log(JSON.stringify(txByUserId, null, 2));

    console.log(`\n=== 4. PAGAMENTOS pendentes on_credit para student_id = ${s.student_id} ===`);
    const payments = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .where('t.student_id', s.student_id)
      .where('tp.payment_method', 'on_credit')
      .select('tp.id', 'tp.amount', 'tp.status', 'tp.payment_method', 't.student_id');
    console.log(JSON.stringify(payments, null, 2));
  }

  await db.destroy();
}

debug().catch(console.error);
