import knex from 'knex';

const RENDER_URL = 'cantina-escolar.onrender.com';

// We need the DATABASE_URL from Render. Let's try the API instead.
// First, let's login and then query the on-credit debts endpoint.

async function run() {
  // Try to hit the API directly
  const baseUrl = `https://${RENDER_URL}`;

  // Try health
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const health = await healthRes.json();
  console.log('Health:', JSON.stringify(health));

  // Try to list students or debts without auth first
  try {
    const res = await fetch(`${baseUrl}/api/pos/on-credit/debts`);
    const data = await res.json();
    console.log('\n=== DÉBITOS NO CREDIÁRIO ===');
    console.log(JSON.stringify(data, null, 2));
  } catch (e: any) {
    console.log('Erro ao buscar débitos:', e.message);
  }
}

run();
