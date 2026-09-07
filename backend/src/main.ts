import app from './app';
import { config } from './config';
import { logger } from './shared/utils/logger';

async function bootstrap() {
  try {
    // Import database and run pending migrations automatically
    const { db } = await import('./shared/database/knex');

    logger.info('🔄 Running database migrations...');
    try {
      await db.migrate.latest();
      logger.info('✅ Migrations complete');
    } catch (migErr) {
      logger.warn({ migErr }, '⚠️ Migration runner failed, continuing with manual column checks...');
    }

    // ── Hard guarantee: ensure billing_type column exists ──────────────
    // This runs REGARDLESS of whether migrations succeeded, because the
    // Knex migration runner can silently skip if it cannot find .js files.
    try {
      const hasBillingType = await db.schema.hasColumn('students', 'billing_type');
      if (!hasBillingType) {
        logger.info('➕ Adding missing billing_type column to students...');
        await db.schema.alterTable('students', (table) => {
          table.string('billing_type', 20).defaultTo('pix_direto');
        });
        // Backfill existing on_credit students
        await db.raw(`
          UPDATE students
          SET billing_type = 'crediario'
          WHERE id IN (
            SELECT DISTINCT t.student_id
            FROM transactions t
            JOIN transaction_payments tp ON tp.transaction_id = t.id
            WHERE tp.payment_method = 'on_credit' AND t.student_id IS NOT NULL
          )
        `).catch(() => {});
        logger.info('✅ billing_type column added and backfilled');
      } else {
        logger.info('✅ billing_type column already exists');
      }
    } catch (colErr) {
      logger.warn({ colErr }, '⚠️ Could not verify/add billing_type column');
    }

    // ── Hard guarantee: ensure student_aliases table exists ───────────
    try {
      const hasAliasesTable = await db.schema.hasTable('student_aliases');
      if (!hasAliasesTable) {
        logger.info('➕ Creating missing student_aliases table...');
        await db.schema.createTable('student_aliases', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.uuid('school_id').notNullable().references('id').inTable('schools').onDelete('CASCADE');
          table.uuid('student_id').notNullable().references('id').inTable('students').onDelete('CASCADE');
          table.string('alias', 255).notNullable();
          table.string('raw_alias', 255).notNullable();
          table.string('source', 50).defaultTo('vision_learned');
          table.timestamps(true, true);

          table.unique(['school_id', 'alias']);
        });
        await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_student_aliases_school ON student_aliases(school_id)').catch(() => {});
        await db.schema.raw('CREATE INDEX IF NOT EXISTS idx_student_aliases_student ON student_aliases(student_id)').catch(() => {});
        logger.info('✅ student_aliases table created successfully');
      } else {
        logger.info('✅ student_aliases table already exists');
      }
    } catch (aliasErr) {
      logger.warn({ aliasErr }, '⚠️ Could not verify/create student_aliases table');
    }
    // ───────────────────────────────────────────────────────────────────

    const server = app.listen(config.port, async () => {
      logger.info(`🚀 Cantina Escolar API running on port ${config.port}`);
      logger.info(`📋 Environment: ${config.env}`);
      logger.info(`🔗 URL: ${config.apiUrl}`);
      logger.info(`❤️  Health: ${config.apiUrl}/api/health`);

      // Iniciar serviço de backup diário
      try {
        const { backupService } = await import('./shared/services/backup.service');
        backupService.startDailySchedule();
      } catch (backupErr) {
        logger.warn({ backupErr }, '⚠️ Falha ao inicializar agendador de backup');
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        // Close database pool
        const { db } = await import('./shared/database/knex');
        await db.destroy();
        logger.info('Database pool closed');

        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
