import app from './app';
import { config } from './config';
import { logger } from './shared/utils/logger';

async function bootstrap() {
  try {
    // Import database and run pending migrations automatically
    const { db } = await import('./shared/database/knex');

    logger.info('🔄 Running database migrations...');
    await db.migrate.latest();
    logger.info('✅ Migrations complete');

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
