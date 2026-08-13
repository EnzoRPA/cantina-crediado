import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

const inactiveStudents = db.prepare('SELECT id, user_id FROM students WHERE is_active = 0').all();

console.log('Found to delete:', inactiveStudents.length);

for (const s of inactiveStudents) {
  try {
    db.prepare('DELETE FROM student_guardians WHERE student_id = ?').run(s.id);
    db.prepare('DELETE FROM students WHERE id = ?').run(s.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(s.user_id);
    console.log('Deleted student', s.id);
  } catch (e) {
    console.error('Error deleting student:', s.id, e.message);
  }
}
