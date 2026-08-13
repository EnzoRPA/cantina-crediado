import { db } from './src/shared/database/knex.ts';

async function main() {
  try {
    const hasColumn = await db.schema.hasColumn('students', 'import_batch_id');
    if (!hasColumn) {
      await db.schema.alterTable('students', (t) => {
        t.string('import_batch_id', 50).nullable();
      });
      console.log('Column added');
    } else {
      console.log('Column already exists');
    }
  } catch (error) {
    console.error('Error adding column:', error);
  } finally {
    process.exit();
  }
}

main();
