import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper to make migrations work on both PostgreSQL and SQLite.
 */
export function isPostgres(knex: Knex): boolean {
  return knex.client.config.client === 'pg';
}

/**
 * Add a UUID primary key that works on both PostgreSQL and SQLite.
 */
export function addUuidPrimaryKey(table: Knex.CreateTableBuilder, knex: Knex): void {
  if (isPostgres(knex)) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
  } else {
    // SQLite: text column with JS-generated UUID default
    table.text('id').primary().defaultTo(uuidv4());
  }
}

/**
 * Add a UUID column (non-primary).
 */
export function addUuidColumn(
  table: Knex.CreateTableBuilder,
  name: string,
  knex: Knex,
  options?: { nullable?: boolean; defaultTo?: string }
): Knex.ColumnBuilder {
  if (isPostgres(knex)) {
    const col = table.uuid(name);
    if (!options?.nullable) col.notNullable();
    return col;
  } else {
    const col = table.text(name);
    if (!options?.nullable) col.notNullable();
    return col;
  }
}

/**
 * Add a JSON/JSONB column compatible with both.
 */
export function addJsonColumn(
  table: Knex.CreateTableBuilder,
  name: string,
  defaultValue: string = '{}'
): Knex.ColumnBuilder {
  return table.json(name).defaultTo(defaultValue);
}

/**
 * Enable UUID extension for PostgreSQL (no-op on SQLite).
 */
export async function enableUuidExtension(knex: Knex): Promise<void> {
  if (isPostgres(knex)) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }
}
