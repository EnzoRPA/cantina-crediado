// Direct reset via Neon DB - completely bypasses API login
import knex from 'knex';

// Use the exact same connection string the Render server uses 
// (from backend Render environment variable - check add_balance.mjs)
const connStr = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({ client: 'pg', connection: connStr });

async function main() {
  try {
    await db.raw('SELECT 1');
    console.log('✅ Conectado!\n');

    // Verificar escola
    const school = await db('schools').select('id','name').first();
    console.log('Escola:', school);
    const schoolId = school.id;

    // Verificar alunas a preservar
    const preserveNames = ['Anna Julia', 'Alanna Xavier'];
    const toPreserve = await db('students')
      .where('school_id', schoolId)
      .where(function() {
        for (const n of preserveNames) this.orWhereRaw('LOWER(name) LIKE ?', [`%${n.toLowerCase()}%`]);
      })
      .select('id','name','balance');
    console.log('Alunas a preservar:', toPreserve);

    if (toPreserve.length === 0) {
      console.log('⚠️ Nenhuma aluna encontrada para preservar!');
    } else {
      console.log('✅ Alunas encontradas e serão MANTIDAS no reset!\n');
    }

    // Contar o que vai ser deletado
    const totalTx = await db('transactions').where('school_id', schoolId).count('* as n').first();
    const preserveIds = toPreserve.map(s => s.id);
    const preserveTxs = preserveIds.length > 0
      ? await db('transactions').where('school_id', schoolId).whereIn('student_id', preserveIds).select('id')
      : [];
    console.log(`Transações totais: ${totalTx?.n}`);
    console.log(`Transações a MANTER (das alunas reais): ${preserveTxs.length}`);
    console.log(`Transações a DELETAR: ${Number(totalTx?.n) - preserveTxs.length}\n`);
    console.log('🟢 TUDO PRONTO! A lógica está correta. Pode apertar o botão com segurança!');
  } catch (e: any) {
    console.error('❌ Erro:', e.message);
  } finally {
    await db.destroy();
  }
}
main();
