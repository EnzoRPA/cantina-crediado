/**
 * Script to run SQLite migrations + seeds for local development.
 * Usage: npx tsx scripts/setup-dev.ts
 */
import path from 'path';
import knex from 'knex';

const db = knex({
  client: 'better-sqlite3',
  connection: {
    filename: path.resolve(__dirname, '../dev.sqlite3'),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.resolve(__dirname, '../src/shared/database/migrations-sqlite'),
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.resolve(__dirname, '../src/shared/database/seeds'),
    extension: 'ts',
  },
});

async function main() {
  console.log('🗃️  Setting up SQLite dev database...\n');

  try {
    // Run migrations
    const [batchNo, log] = await db.migrate.latest();
    console.log(`✅ Migrations (batch ${batchNo}):`);
    if (log.length === 0) {
      console.log('   Already up to date');
    } else {
      log.forEach((f: string) => console.log(`   ✓ ${f}`));
    }

    // Run seeds
    console.log('\n🌱 Running seeds...');
    await db.seed.run();

    console.log('\n🚀 Dev database ready! File: backend/dev.sqlite3');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
