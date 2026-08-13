import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'dev.sqlite3');
const db = new Database(dbPath);

try {
  const columns = ['cpf', 'birth_date', 'gender', 'phone', 'address_full', 'guardian_name', 'guardian_cpf', 'guardian_rg', 'guardian_phone', 'is_marketing_sent'];
  const types = ['VARCHAR(14)', 'VARCHAR(20)', 'VARCHAR(50)', 'VARCHAR(20)', 'TEXT', 'VARCHAR(255)', 'VARCHAR(14)', 'VARCHAR(30)', 'VARCHAR(20)', 'BOOLEAN DEFAULT 0'];

  for (let i = 0; i < columns.length; i++) {
    try {
      db.prepare(`ALTER TABLE students ADD COLUMN ${columns[i]} ${types[i]}`).run();
      console.log(`Added column ${columns[i]}`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`Column ${columns[i]} already exists`);
      } else {
        throw err;
      }
    }
  }
} catch (e) {
  console.error(e);
}
