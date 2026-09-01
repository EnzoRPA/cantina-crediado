import knex from 'knex';

const API = 'https://cantina-crediado-api.onrender.com';

async function run() {
  // Login
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@cantina.com', password: 'Admin@123', schoolId: 'a0000000-0000-0000-0000-000000000001' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;

  // Fetch debts
  const debtsRes = await fetch(`${API}/api/pos/on-credit/debts`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const debtsData = await debtsRes.json();
  const debtsArr = debtsData.data.debts || [];
  if (debtsArr.length > 0) console.log('Sample:', JSON.stringify(debtsArr[0]).slice(0, 500));
  const students = debtsArr;

  const withDebt = students.filter((s: any) => s.total_debt > 0).sort((a: any, b: any) => b.total_debt - a.total_debt);
  const pixDireto = withDebt.filter((s: any) => s.billing_type === 'pix_direto');
  const crediario = withDebt.filter((s: any) => s.billing_type === 'crediario');

  console.log('=== RESUMO GERAL ===');
  console.log(`Total de clientes: ${students.length}`);
  console.log(`Clientes com débito: ${withDebt.length}`);
  console.log(`  - Crediário: ${crediario.length}`);
  console.log(`  - Pix Direto (com débito!): ${pixDireto.length}`);
  console.log(`Totais: Vendido R$ ${debtsData.data.totals.total_sold} | Recebido R$ ${debtsData.data.totals.total_received} | Pendente R$ ${debtsData.data.totals.total_pending}`);

  console.log('\n=== TODOS OS CLIENTES COM DÉBITO (ordenado por valor) ===\n');
  withDebt.forEach((s: any, i: number) => {
    console.log(`${i + 1}. ${s.student_name} | Mat: ${s.enrollment_number} | ${s.class_group || s.grade} | Débito: R$ ${s.total_debt} | Saldo: R$ ${s.balance} | Tipo: ${s.billing_type}`);
    if (s.guardian_name) console.log(`   Resp: ${s.guardian_name} (${s.guardian_phone})`);
  });

  if (pixDireto.length > 0) {
    console.log('\n=== PIX DIRETO COM DÉBITO (inconsistência!) ===\n');
    pixDireto.forEach((s: any, i: number) => {
      console.log(`${i + 1}. ${s.student_name} | Mat: ${s.enrollment_number} | Débito: R$ ${s.total_debt} | Tipo: ${s.billing_type}`);
    });
  }
}

run();
