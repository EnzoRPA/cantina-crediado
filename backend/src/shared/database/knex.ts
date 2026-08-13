import knex, { Knex } from 'knex';
import path from 'path';
import { config } from '../../config';
import { logger } from '../utils/logger';

/**
 * Database connection — auto-detects PostgreSQL or SQLite.
 * - Set DB_CLIENT=better-sqlite3 in .env for local dev (no Docker needed)
 * - Set DATABASE_URL for PostgreSQL (production)
 */
const dbClient = process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'pg' : 'better-sqlite3');
const usePostgres = dbClient === 'pg';

const knexConfig: Knex.Config = usePostgres
  ? {
      client: 'pg',
      connection: config.db.url,
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 10000,
        afterCreate: (conn: any, cb: any) => {
          conn.query('CREATE EXTENSION IF NOT EXISTS unaccent;', (err: any) => {
            if (err) {
              logger.warn({ err }, 'Could not create unaccent extension in PostgreSQL');
            }
            cb(null, conn);
          });
        }
      },
      migrations: {
        directory: __dirname + '/migrations',
        extension: 'ts',
        tableName: 'knex_migrations',
      },
      seeds: {
        directory: __dirname + '/seeds',
        extension: 'ts',
      },
    }
  : {
      client: 'better-sqlite3',
      connection: {
        filename: path.resolve(__dirname, '../../../dev.sqlite3'),
      },
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn: any, cb: any) => {
          conn.function('unaccent', (str: string) => {
            if (typeof str !== 'string') return str;
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          });
          cb(null, conn);
        }
      },
      migrations: {
        directory: __dirname + '/migrations-sqlite',
        extension: 'ts',
        tableName: 'knex_migrations',
      },
      seeds: {
        directory: __dirname + '/seeds',
        extension: 'ts',
      },
    };

export const db = knex(knexConfig);

/**
 * Whether the database is PostgreSQL (true) or SQLite (false).
 * Useful for dialect-specific query adjustments.
 */
export const isPostgres = usePostgres;

/**
 * Normaliza um termo removendo acentos e passando para minúsculas.
 */
function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Gera variantes fonéticas de um termo para busca tolerante a erros comuns:
 * - H inicial opcional: "Heloisa" ↔ "Eloisa"
 * - Consoantes duplas colapsadas / expandidas: "Ana" ↔ "Anna"
 */
function phoneticVariants(normalized: string): string[] {
  const variants = new Set<string>();
  variants.add(normalized);

  // 1. H inicial: se começa com "h", adicionar sem o "h"; se não começa, adicionar com "h"
  if (normalized.startsWith('h')) {
    variants.add(normalized.slice(1));              // "heloisa" → "eloisa"
  } else {
    variants.add('h' + normalized);                 // "eloisa" → "heloisa"
  }

  // 2. Para cada variante, colapsar consoantes duplas (nn→n, ll→l, rr→r, etc.)
  const collapse = (s: string) => s.replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1');
  // 3. Para cada variante, duplicar consoantes simples que aparecem no meio (n→nn etc.)
  const expand   = (s: string) => s.replace(/([bcdfghjklmnpqrstvwxyz])(?!\1)(?=[a-z])/g, '$1$1');

  // Aplicar collapse e expand sobre as variantes já geradas (clonando o Set para evitar loop infinito)
  for (const v of [...variants]) {
    variants.add(collapse(v));   // "anna" → "ana" | "heloisa" → "heloisa" (sem duplas = igual)
    variants.add(expand(v));     // "ana"  → "anna" (cada consoante simples é duplicada)
  }

  return [...variants];
}

/**
 * Case-insensitive, accent-insensitive e fonético LIKE usando unaccent() e LOWER().
 * Resolve: acentos, H inicial opcional, consoantes duplas/simples.
 * Usage: builder.where(searchLike('u.name', search))
 */
export function searchLike(column: string, value: string) {
  const normalized = normalizeSearch(value);
  const variants = phoneticVariants(normalized);

  return (builder: Knex.QueryBuilder) => {
    builder.where(function () {
      for (const variant of variants) {
        this.orWhereRaw('unaccent(LOWER(??)) LIKE ?', [column, `%${variant}%`]);
      }
    });
  };
}

// Test connection on import
db.raw('SELECT 1')
  .then(() => {
    const dbType = usePostgres ? 'PostgreSQL' : 'SQLite (dev.sqlite3)';
    logger.info(`✅ Database connected: ${dbType}`);
  })
  .catch((err) => {
    logger.error({ err }, '❌ Database connection failed');
  });

export default db;
