import knex from 'knex';

const connectionString = 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = knex({
  client: 'pg',
  connection: connectionString,
  pool: { min: 1, max: 2 }
});

async function search() {
  try {
    console.log('🔍 Buscando alunos no banco de produção Neon...');

    // 1. Exact or partial match on name / user name
    const students = await db('students as s')
      .join('users as u', 's.user_id', 'u.id')
      .select(
        's.id',
        'u.name',
        's.enrollment_number',
        's.grade',
        's.class_group',
        's.balance',
        's.is_active',
        'u.email'
      );

    console.log(`📋 Total de alunos cadastrados: ${students.length}\n`);

    const queryTerms = ['laur', 'môna', 'mona', 'dy'];
    const matched = students.filter(s => {
      const name = (s.name || '').toLowerCase();
      return queryTerms.some(t => name.includes(t));
    });

    console.log('🎯 Resultados encontrados para termos similares (laur / mônaco / monaco / dy):');
    if (matched.length === 0) {
      console.log('   Nenhum aluno encontrado com esse nome ou termos similares.');
    } else {
      matched.forEach(s => {
        console.log(`   - ID: ${s.id} | Nome: "${s.name}" | Matrícula: ${s.enrollment_number} | Turma: ${s.grade || ''} ${s.class_group || ''} | Saldo: R$ ${Number(s.balance).toFixed(2)} | Ativo: ${s.is_active}`);
      });
    }

    console.log('\n📜 Lista completa de todas as alunas/alunos cadastrados no sistema:');
    students.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} (Matrícula: ${s.enrollment_number})`);
    });

  } catch (err: any) {
    console.error('❌ Erro na consulta:', err.message);
  } finally {
    await db.destroy();
  }
}

search();
