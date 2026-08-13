import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

// Check guardians table structure
try {
  const cols = db.pragma('table_info(guardians)');
  console.log('=== GUARDIANS TABLE ===');
  cols.forEach(c => console.log(`  ${c.name} (${c.type})`));
} catch(e) {
  console.error('guardians table error:', e.message);
}

// Check student_guardians table structure
try {
  const cols = db.pragma('table_info(student_guardians)');
  console.log('\n=== STUDENT_GUARDIANS TABLE ===');
  cols.forEach(c => console.log(`  ${c.name} (${c.type})`));
} catch(e) {
  console.error('student_guardians table error:', e.message);
}

// Check existing data
try {
  const guardians = db.prepare('SELECT g.id, u.name, u.email, u.phone, u.role FROM guardians g JOIN users u ON g.user_id = u.id').all();
  console.log('\n=== GUARDIAN RECORDS ===');
  console.log(JSON.stringify(guardians, null, 2));

  const links = db.prepare('SELECT * FROM student_guardians').all();
  console.log('\n=== STUDENT_GUARDIANS LINKS ===');
  console.log(JSON.stringify(links, null, 2));
} catch(e) {
  console.error('Data query error:', e.message);
}
