import knex from 'knex';

const connectionString = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({
  client: 'pg',
  connection: connectionString,
  pool: { min: 1, max: 2 }
});

async function run() {
  try {
    console.log('🔌 Conectando ao Neon PostgreSQL...');
    const schools = await db('schools').select('id', 'name').limit(2);
    console.log('Escolas:', schools);

    const schoolId = schools[0]?.id;
    if (!schoolId) {
      console.log('Nenhuma escola encontrada');
      return;
    }

    const preserveStudentNames = ['Anna Julia', 'Alanna Xavier'];
    let preserveStudentIds: string[] = [];
    if (preserveStudentNames.length > 0) {
      const studentsToPreserve = await db('students')
        .where('school_id', schoolId)
        .where(function() {
          for (const name of preserveStudentNames) {
            this.orWhereRaw('LOWER(name) LIKE ?', [`%${name.toLowerCase()}%`]);
          }
        })
        .select('id', 'name', 'balance');
      console.log('Alunas preservadas encontradas:', studentsToPreserve);
      preserveStudentIds = studentsToPreserve.map(s => s.id);
    }

    let preserveTxIds: string[] = [];
    if (preserveStudentIds.length > 0) {
      const txsToPreserve = await db('transactions')
        .where('school_id', schoolId)
        .whereIn('student_id', preserveStudentIds)
        .select('id');
      preserveTxIds = txsToPreserve.map(t => t.id);
      console.log(`Transações a preservar: ${preserveTxIds.length}`);
    }

    console.log('\n🧪 Executando o Reset Real das Vendas de Teste no banco Neon...');
    await db.transaction(async (trx) => {
      // 1. Delete transaction_payments
      const del1 = await trx('transaction_payments')
        .whereIn('transaction_id', function() {
          let q = this.select('id').from('transactions').where('school_id', schoolId);
          if (preserveTxIds.length > 0) {
            q = q.whereNotIn('id', preserveTxIds);
          }
          return q;
        })
        .delete();
      console.log(`1. transaction_payments deletados: ${del1}`);

      // 2. Delete transaction_items
      const del2 = await trx('transaction_items')
        .whereIn('transaction_id', function() {
          let q = this.select('id').from('transactions').where('school_id', schoolId);
          if (preserveTxIds.length > 0) {
            q = q.whereNotIn('id', preserveTxIds);
          }
          return q;
        })
        .delete();
      console.log(`2. transaction_items deletados: ${del2}`);

      // 3. Delete non-preserved transactions
      let deleteTxQuery = trx('transactions').where('school_id', schoolId);
      if (preserveTxIds.length > 0) {
        deleteTxQuery = deleteTxQuery.whereNotIn('id', preserveTxIds);
      }
      const del3 = await deleteTxQuery.delete();
      console.log(`3. transactions deletadas: ${del3}`);

      // 4. Delete cash register movements
      const del4 = await trx('cash_register_movements')
        .whereIn('cash_register_id', function() {
          this.select('id').from('cash_registers').where('school_id', schoolId);
        })
        .delete();
      console.log(`4. cash_register_movements deletados: ${del4}`);

      // 5. Delete cash registers for the school
      const del5 = await trx('cash_registers')
        .where('school_id', schoolId)
        .delete();
      console.log(`5. cash_registers deletados: ${del5}`);

      // 6. Delete student_balance_transactions if exists
      try {
        let deleteSbtQuery = trx('student_balance_transactions')
          .whereIn('student_id', function() {
            this.select('id').from('students').where('school_id', schoolId);
          });
        if (preserveStudentIds.length > 0) {
          deleteSbtQuery = deleteSbtQuery.whereNotIn('student_id', preserveStudentIds);
        }
        const del6 = await deleteSbtQuery.delete();
        console.log(`6. student_balance_transactions deletadas: ${del6}`);
      } catch (e: any) {
        console.log(`6. (PULADO) student_balance_transactions erro: ${e.message}`);
      }

      // 7. Reset student balances
      let resetStudentsQuery = trx('students').where('school_id', schoolId);
      if (preserveStudentIds.length > 0) {
        resetStudentsQuery = resetStudentsQuery.whereNotIn('id', preserveStudentIds);
      }
      const upd7 = await resetStudentsQuery.update({ balance: 0 });
      console.log(`7. alunos com saldo zerado: ${upd7}`);

      console.log('\n🎉 SUCESSO TOTAL NO RESET! TODAS AS VENDAS DE TESTE FORAM APAGADAS E AS RECARGAS REAIS DE ANNA JULIA E ALANNA XAVIER MANTIDAS.');
    });
  } catch (err: any) {
    console.error('❌ ERRO NO TESTE:', err.message || err);
  } finally {
    await db.destroy();
  }
}

run();
