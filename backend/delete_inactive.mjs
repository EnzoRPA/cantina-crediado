import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

const inactiveStudents = db.prepare('SELECT id, user_id FROM students WHERE is_active = 0').all();

db.transaction(() => {
  for (const s of inactiveStudents) {
    db.prepare('DELETE FROM students WHERE id = ?').run(s.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(s.user_id);
  }
})();

console.log(`Deleted ${inactiveStudents.length} inactive students.`);
