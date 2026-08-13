import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'dev.sqlite3');
const db = new Database(dbPath);

console.log(db.prepare('PRAGMA table_info(students)').all().map(c => c.name));
