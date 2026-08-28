const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../dev.sqlite3');
const db = new Database(dbPath);

const rows = db.prepare(`
  SELECT 
    t.id, 
    t.created_at, 
    t.updated_at, 
    t.final_amount, 
    t.notes, 
    u.name as student_name, 
    s.grade,
    s.enrollment_number
  FROM transactions t
  LEFT JOIN students s ON t.student_id = s.id
  LEFT JOIN users u ON s.user_id = u.id
  ORDER BY t.created_at DESC
`).all();

console.log('TOTAL DE TRANSAÇÕES:', rows.length);
console.log('--- TRANSAÇÕES COM DATA DE 23/08 ---');
const aug23 = rows.filter(r => String(r.created_at).includes('2026-08-23') || String(r.created_at).includes('2026-08-23T'));
console.log(JSON.stringify(aug23, null, 2));

console.log('\n--- ÚLTIMAS 20 TRANSAÇÕES GERAIS ---');
console.log(JSON.stringify(rows.slice(0, 20), null, 2));
