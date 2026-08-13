import Database from 'better-sqlite3';
const db = new Database('./dev.sqlite3');
try {
  db.exec('ALTER TABLE students ADD COLUMN import_batch_id TEXT;');
  console.log('Column added successfully');
} catch (err) {
  console.log('Error or already exists', err.message);
}
db.close();
