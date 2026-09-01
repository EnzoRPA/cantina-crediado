import knex from 'knex';

const NEON_URL = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || NEON_URL,
});

async function run() {
  try {
    console.log('Connecting to database...');
    await db.raw('SELECT 1');
    console.log('✅ Connected!');

    // 1. Debits in transaction_payments where payment_method = 'on_credit' and status = 'pending'
    const pendingPaymentsQuery = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .join('students as s', 't.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.billing_type', 'pix_direto')
      .where('tp.payment_method', 'on_credit')
      .where('tp.status', 'pending')
      .select(
        's.id as student_id',
        'u.name as student_name',
        's.enrollment_number',
        's.grade',
        's.class_group',
        's.balance',
        's.billing_type',
        's.guardian_name',
        's.guardian_phone',
        'tp.id as payment_id',
        'tp.amount as payment_amount',
        'tp.status as payment_status',
        't.id as transaction_id',
        't.notes as transaction_notes',
        't.created_at as transaction_date',
        't.total_amount'
      )
      .orderBy('u.name', 'asc');

    console.log(`\n=== 1. Alunos "pix_direto" com pagamentos pendentes em crediário (on_credit pendente): ${pendingPaymentsQuery.length} itens encontrados ===`);

    const studentsMap: Record<string, any> = {};
    for (const row of pendingPaymentsQuery) {
      if (!studentsMap[row.student_id]) {
        studentsMap[row.student_id] = {
          student_id: row.student_id,
          student_name: row.student_name,
          enrollment_number: row.enrollment_number,
          grade: row.grade,
          class_group: row.class_group,
          balance: Number(row.balance),
          billing_type: row.billing_type,
          guardian_name: row.guardian_name,
          guardian_phone: row.guardian_phone,
          total_debt: 0,
          pending_count: 0,
          transactions: []
        };
      }
      studentsMap[row.student_id].total_debt += Number(row.payment_amount);
      studentsMap[row.student_id].pending_count += 1;
      studentsMap[row.student_id].transactions.push({
        transaction_id: row.transaction_id,
        amount: Number(row.payment_amount),
        date: row.transaction_date,
        notes: row.transaction_notes
      });
    }

    const pendingDebtStudents = Object.values(studentsMap);
    console.log(`Total de alunos distintos: ${pendingDebtStudents.length}`);
    for (const s of pendingDebtStudents) {
      console.log(`- Aluno: ${s.student_name} | Matrícula: ${s.enrollment_number} | Série/Turma: ${s.grade || ''} ${s.class_group || ''} | Débito Total: R$ ${s.total_debt.toFixed(2)} | Qtd Débitos: ${s.pending_count} | Resp: ${s.guardian_name || 'N/D'} (${s.guardian_phone || 'N/D'})`);
      for (const tx of s.transactions) {
        console.log(`    ↳ Tx: ${tx.transaction_id} | Data: ${tx.date} | Valor: R$ ${tx.amount.toFixed(2)} | Obs: ${tx.notes || '-'}`);
      }
    }

    // 2. Alunos com saldo negativo e billing_type = 'pix_direto'
    const negativeBalanceStudents = await db('students as s')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.billing_type', 'pix_direto')
      .where('s.balance', '<', 0)
      .select(
        's.id as student_id',
        'u.name as student_name',
        's.enrollment_number',
        's.grade',
        's.class_group',
        's.balance',
        's.billing_type',
        's.guardian_name',
        's.guardian_phone'
      );

    console.log(`\n=== 2. Alunos "pix_direto" com saldo negativo em conta: ${negativeBalanceStudents.length} ===`);
    for (const s of negativeBalanceStudents) {
      console.log(`- Aluno: ${s.student_name} | Saldo: R$ ${Number(s.balance).toFixed(2)}`);
    }

    // 3. Checar também se existem alunos com billing_type null / vazio ou diferente de 'crediario' que tenham débitos
    const otherNonCrediario = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .join('students as s', 't.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .whereNot('s.billing_type', 'crediario')
      .where('tp.payment_method', 'on_credit')
      .where('tp.status', 'pending')
      .select(
        's.id as student_id',
        'u.name as student_name',
        's.billing_type',
        'tp.amount',
        't.created_at'
      );

    console.log(`\n=== 3. Alunos com billing_type != 'crediario' com débito pendente: ${otherNonCrediario.length} registros ===`);
    for (const r of otherNonCrediario) {
      console.log(`- Aluno: ${r.student_name} | Flag: ${r.billing_type} | Valor: R$ ${Number(r.amount).toFixed(2)}`);
    }

    // 4. Histórico geral de fiado (on_credit) para alunos pix_direto (mesmo os pagos/settled)
    const allOnCreditHistory = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .join('students as s', 't.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.billing_type', 'pix_direto')
      .where('tp.payment_method', 'on_credit')
      .select(
        's.id as student_id',
        'u.name as student_name',
        'tp.status as payment_status',
        'tp.amount',
        't.created_at',
        't.notes'
      )
      .orderBy('t.created_at', 'desc');

    console.log(`\n=== 4. Total de transações on_credit no histórico de alunos marcados como pix_direto (qualquer status): ${allOnCreditHistory.length} ===`);
    for (const h of allOnCreditHistory) {
      console.log(`- Aluno: ${h.student_name} | Status: ${h.payment_status} | Valor: R$ ${Number(h.amount).toFixed(2)} | Data: ${h.created_at} | Obs: ${h.notes || '-'}`);
    }

  } catch (err: any) {
    console.error('❌ Erro na consulta:', err);
  } finally {
    await db.destroy();
  }
}

run();
