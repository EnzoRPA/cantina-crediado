import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../backend/dev.sqlite3');
const db = new Database(dbPath);

const columns = db.prepare('PRAGMA table_info(students)').all();
console.log(columns);
