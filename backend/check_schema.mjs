import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

const enrollmentNumber = '099999';
const guardianName = 'Test Pai';
const guardianPhone = '5511999999999';
const schoolId = 'a0000000-0000-0000-0000-000000000001';

try {
  // Let's see if the columns for guardian exist in SQLite users/guardians table
  const gCount = db.prepare('SELECT count(*) as c FROM guardians').get().c;
  console.log('Guardians count:', gCount);

  const uCount = db.prepare('SELECT count(*) as c FROM users WHERE role = "guardian"').get().c;
  console.log('Users role=guardian count:', uCount);

  // Let's verify student_guardians tracking
  const sgCount = db.prepare('SELECT count(*) as c FROM student_guardians').get().c;
  console.log('student_guardians count:', sgCount);
} catch(e) {
  console.error("Database schema error:", e.message);
}
