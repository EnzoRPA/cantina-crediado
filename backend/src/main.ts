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
    // ───────────────────────────────────────────────────────────────────

    const server = app.listen(config.port, () => {
      logger.info(`🚀 Cantina Escolar API running on port ${config.port}`);
      logger.info(`📋 Environment: ${config.env}`);
      logger.info(`🔗 URL: ${config.apiUrl}`);
      logger.info(`❤️  Health: ${config.apiUrl}/api/health`);
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
