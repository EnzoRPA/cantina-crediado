import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

try {
  const cols = db.pragma('table_info(transactions)');
  console.log('=== TRANSACTIONS TABLE ===');
  cols.forEach(c => console.log(`  ${c.name} (${c.type})`));
  
  const lastTx = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1').get();
  console.log('\n=== LAST TRANSACTION ===');
  console.log(JSON.stringify(lastTx, null, 2));
} catch(e) {
  console.error(e.message);
}
