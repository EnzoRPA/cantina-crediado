#!/usr/bin/env node

/**
 * Script Keep-Alive Render para a Cantina Escolar
 * Pinga a API a cada 5 segundos para garantir que o Render nunca durma.
 * 
 * Uso:
 *   node scripts/keep-render-awake.mjs
 *   node scripts/keep-render-awake.mjs --interval 5000 --url https://cantina-escolar.onrender.com
 */

const DEFAULT_URL = 'https://cantina-escolar.onrender.com/api/health';
const DEFAULT_INTERVAL_MS = 5000; // 5 segundos

// Ler parâmetros de linha de comando ou variáveis de ambiente
const args = process.argv.slice(2);
let targetUrl = process.env.RENDER_URL || DEFAULT_URL;
let intervalMs = parseInt(process.env.PING_INTERVAL || String(DEFAULT_INTERVAL_MS), 10);

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--url' || args[i] === '-u') && args[i + 1]) {
    targetUrl = args[i + 1];
    i++;
  } else if ((args[i] === '--interval' || args[i] === '-i') && args[i + 1]) {
    intervalMs = parseInt(args[i + 1], 10);
    i++;
  }
}

if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
  targetUrl = `https://${targetUrl}`;
}
if (!targetUrl.includes('/health')) {
  targetUrl = targetUrl.replace(/\/+$/, '') + '/api/health';
}

console.clear();
console.log('====================================================');
console.log('   🚀 CANTINA ESCOLAR - RENDER KEEP-ALIVE GUARDIAN   ');
console.log('====================================================');
console.log(`🎯 Alvo:     ${targetUrl}`);
console.log(`⏱️  Intervalo: ${intervalMs / 1000}s`);
console.log('💡 Dica:     Pressione Ctrl+C para encerrar.');
console.log('----------------------------------------------------\n');

let successCount = 0;
let failCount = 0;
let isPinging = false;

async function ping() {
  if (isPinging) return;
  isPinging = true;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (response.ok) {
      successCount++;
      const emoji = duration < 800 ? '🟢' : duration < 2500 ? '🟡' : '🟠';
      console.log(`[${timestamp}] ${emoji} Render ONLINE! Resposta em ${duration}ms (Sucesso: ${successCount})`);
    } else {
      failCount++;
      console.warn(`[${timestamp}] ⚠️ Status HTTP ${response.status} em ${duration}ms (Falhas: ${failCount})`);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    failCount++;

    if (err.name === 'AbortError') {
      console.log(`[${timestamp}] ⏳ Render INICIANDO (Cold-start > 20s)... Aguardando container subir.`);
    } else {
      console.log(`[${timestamp}] 🔄 Tentando acordar Render... (${err.message || 'aguardando'})`);
    }
  } finally {
    isPinging = false;
  }
}

// Primeiro ping imediato
ping();

// Loop a cada intervalo especificado (5 segundos)
const intervalId = setInterval(ping, intervalMs);

// Encerramento limpo
function gracefulShutdown() {
  clearInterval(intervalId);
  console.log('\n\n🛑 Keep-Alive encerrado.');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
