import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = new Database(path.resolve(__dirname, 'dev.sqlite3'));

const students = db.prepare('SELECT enrollment_number, is_active FROM students').all();
console.log('Total students:', students.length);
console.log('Students:', JSON.stringify(students, null, 2));
