import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

try {
  const sgCount = db.prepare('SELECT count(*) as c FROM student_guardians').get().c;
  console.log('student_guardians count:', sgCount);
} catch(e) {
  console.error("Database schema error:", e.message);
}
