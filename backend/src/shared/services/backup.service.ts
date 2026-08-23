import fs from 'fs';
import path from 'path';
import { db, isPostgres } from '../database/knex';
import { logger } from '../utils/logger';

export class BackupService {
  private backupDir: string;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.backupDir = path.resolve(__dirname, '../../../../backups');
    this.ensureBackupDir();
  }

  private ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      try {
        fs.mkdirSync(this.backupDir, { recursive: true });
        logger.info(`📁 Pasta de backups criada: ${this.backupDir}`);
      } catch (err) {
        logger.error({ err }, 'Erro ao criar diretório de backups');
      }
    }
  }

  /**
   * Executa um backup completo do banco de dados (SQLite ou PostgreSQL)
   */
  async performBackup(): Promise<{ filename: string; sizeBytes: number; tablesCount: number; timestamp: string }> {
    this.ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
      const tables = [
        'schools',
        'users',
        'guardians',
        'students',
        'student_guardians',
        'products',
        'categories',
        'cash_registers',
        'cash_register_movements',
        'transactions',
        'transaction_items',
        'transaction_payments',
        'daily_limits',
        'refresh_tokens'
      ];

      const backupData: Record<string, any[]> = {};
      let totalRows = 0;

      for (const table of tables) {
        try {
          const exists = await db.schema.hasTable(table);
          if (exists) {
            const rows = await db(table).select('*');
            backupData[table] = rows;
            totalRows += rows.length;
          }
        } catch (tableErr) {
          logger.warn({ tableErr, table }, `Aviso ao extrair tabela ${table} para backup`);
        }
      }

      const filename = `backup_${timestamp}.json`;
      const filePath = path.join(this.backupDir, filename);

      const metadata = {
        version: '1.0',
        created_at: new Date().toISOString(),
        is_postgres: isPostgres,
        total_rows: totalRows,
        tables_included: Object.keys(backupData),
        data: backupData
      };

      fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
      const stats = fs.statSync(filePath);

      logger.info(
        `✅ [Backup Automático] Backup realizado com sucesso: ${filename} (${(stats.size / 1024).toFixed(1)} KB, ${totalRows} registros)`
      );

      // Limpeza de backups antigos (mantém os últimos 30 dias)
      this.cleanupOldBackups(30);

      return {
        filename,
        sizeBytes: stats.size,
        tablesCount: Object.keys(backupData).length,
        timestamp: metadata.created_at
      };
    } catch (error) {
      logger.error({ error }, '❌ Erro ao realizar backup do banco de dados');
      throw error;
    }
  }

  /**
   * Remove backups com mais de N dias
   */
  private cleanupOldBackups(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.backupDir);
      const now = Date.now();
      const maxAgeMs = daysToKeep * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith('backup_') && file.endsWith('.json')) {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            logger.info(`🗑️ Backup antigo removido: ${file}`);
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Aviso ao limpar backups antigos');
    }
  }

  /**
   * Retorna informações dos backups existentes
   */
  getBackupsList(): Array<{ filename: string; sizeBytes: number; createdAt: string }> {
    this.ensureBackupDir();
    try {
      const files = fs.readdirSync(this.backupDir);
      return files
        .filter((f) => f.startsWith('backup_') && f.endsWith('.json'))
        .map((file) => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            sizeBytes: stats.size,
            createdAt: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  /**
   * Inicia o agendador diário
   */
  startDailySchedule() {
    if (this.intervalTimer) return;

    logger.info('⏰ Agendador de Backup Diário inicializado (verificação a cada 6 horas)');

    // Verifica se já temos um backup feito hoje, senão faz agora
    const list = this.getBackupsList();
    const todayStr = new Date().toISOString().split('T')[0];
    const hasTodayBackup = list.some((b) => b.createdAt.startsWith(todayStr));

    if (!hasTodayBackup) {
      logger.info('📦 Nenhum backup encontrado para hoje. Realizando backup inicial...');
      this.performBackup().catch((err) => logger.error({ err }, 'Falha no backup inicial'));
    }

    // Checa a cada 6 horas
    this.intervalTimer = setInterval(() => {
      const currentList = this.getBackupsList();
      const currentToday = new Date().toISOString().split('T')[0];
      const hasBackup = currentList.some((b) => b.createdAt.startsWith(currentToday));

      if (!hasBackup) {
        logger.info('📦 Executando rotina de backup diário...');
        this.performBackup().catch((err) => logger.error({ err }, 'Falha no backup agendado'));
      }
    }, 6 * 60 * 60 * 1000);
  }

  stopSchedule() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const backupService = new BackupService();
