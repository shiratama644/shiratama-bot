import { Kysely, PostgresDialect, sql, type Selectable } from 'kysely';
import { Pool } from 'pg';
import type { Giveaway } from '../shared/types/common.js';
import { logger } from '../shared/logger/index.js';
import { AppError } from '../shared/errors/index.js';
import type { Database, GiveawaysTable } from './schema.js';

let pool: Pool | null = null;
let db: Kysely<Database> | null = null;

const DEFAULT_DATABASE_POOL_MAX = 20;
const DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_DATABASE_POOL_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_DATABASE_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_DATABASE_QUERY_TIMEOUT_MS = 30_000;
const DEFAULT_DATABASE_KEEPALIVE_INITIAL_DELAY_MS = 10_000;
const ALLOWED_DATABASE_SSL_MODES = new Set(['disable', 'prefer', 'require', 'verify-ca', 'verify-full']);

const DATABASE_SCHEMA_SQL_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      giveaway_creator_role_ids TEXT[] NOT NULL DEFAULT '{}',
      dashboard_view_role_ids TEXT[] NOT NULL DEFAULT '{}',
      language TEXT NOT NULL DEFAULT 'en',
      giveaway_channel_ids TEXT[] NOT NULL DEFAULT '{}',
      default_claim_deadline TEXT
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS giveaways (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      end_at TIMESTAMPTZ NOT NULL,
      winner_count INTEGER NOT NULL CHECK (winner_count > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'stopped')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      interval TEXT,
      auto_repeat BOOLEAN NOT NULL DEFAULT FALSE,
      claim_deadline TEXT,
      winners TEXT[] NOT NULL DEFAULT '{}'
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id TEXT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (giveaway_id, user_id)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      guild_id TEXT,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_giveaways_active_end_at ON giveaways(status, end_at);
    CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status_created_at ON giveaways(guild_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_giveaways_guild_end_at ON giveaways(guild_id, end_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_giveaways_message_id_unique
      ON giveaways(message_id)
      WHERE message_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_id ON giveaway_entries(giveaway_id);
    CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user_id ON giveaway_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created_at ON audit_logs(guild_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created_at ON audit_logs(target_type, target_id, created_at DESC);
  `
] as const;

const DATABASE_SCHEMA_MIGRATION_SQL_STATEMENTS = [
  `
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS giveaway_channel_ids TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS default_claim_deadline TEXT;
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS manager_role_ids TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS giveaway_creator_role_ids TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS dashboard_view_role_ids TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS claim_deadline TEXT;
    ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winners TEXT[] NOT NULL DEFAULT '{}';
  `,
  `
    UPDATE guild_settings
    SET giveaway_creator_role_ids = manager_role_ids
    WHERE cardinality(giveaway_creator_role_ids) = 0 AND manager_role_ids IS NOT NULL;
  `
] as const;

function readNumberEnv(name: string, defaultValue: number, minimum = 1): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    logger.warn(`Invalid ${name}; falling back to default value.`, { value: raw, defaultValue });
    return defaultValue;
  }
  return parsed;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  logger.warn(`Invalid ${name}; falling back to default value.`, { value: raw, defaultValue });
  return defaultValue;
}

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  const sslMode = process.env.DATABASE_SSL_MODE ?? (process.env.NODE_ENV === 'production' ? 'require' : 'prefer');
  if (!connectionString) {
    logger.error('DATABASE_URL is not defined in environment variables');
    throw new AppError('DATABASE_URL environment variable is not configured.', 500);
  }
  if (!ALLOWED_DATABASE_SSL_MODES.has(sslMode)) {
    throw new AppError(
      `DATABASE_SSL_MODE "${sslMode}" is invalid. Expected disable|prefer|require|verify-ca|verify-full.`,
      500
    );
  }
  if (process.env.NODE_ENV === 'production' && !ALLOWED_DATABASE_SSL_MODES_PRODUCTION.has(sslMode)) {
    throw new AppError('DATABASE_SSL_MODE must be require, verify-ca, or verify-full in production.', 500);
  }
  const shouldRequireSsl = sslMode === 'require';
  const applicationName = process.env.DATABASE_APPLICATION_NAME ?? 'applejp-bot';
  const createdPool = new Pool({
    connectionString,
    ssl: shouldRequireSsl
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
    max: readNumberEnv('DATABASE_POOL_MAX', DEFAULT_DATABASE_POOL_MAX),
    idleTimeoutMillis: readNumberEnv('DATABASE_POOL_IDLE_TIMEOUT_MS', DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: readNumberEnv(
      'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
      DEFAULT_DATABASE_POOL_CONNECTION_TIMEOUT_MS
    ),
    statement_timeout: readNumberEnv('DATABASE_STATEMENT_TIMEOUT_MS', DEFAULT_DATABASE_STATEMENT_TIMEOUT_MS),
    query_timeout: readNumberEnv('DATABASE_QUERY_TIMEOUT_MS', DEFAULT_DATABASE_QUERY_TIMEOUT_MS),
    keepAlive: readBooleanEnv('DATABASE_KEEPALIVE', true),
    keepAliveInitialDelayMillis: readNumberEnv(
      'DATABASE_KEEPALIVE_INITIAL_DELAY_MS',
      DEFAULT_DATABASE_KEEPALIVE_INITIAL_DELAY_MS
    ),
    application_name: applicationName
  });
  createdPool.on('error', (err) => {
    logger.error('Unexpected error on idle database client', err);
  });
  logger.info('Database pool initialized.', {
    sslMode,
    applicationName
  });
  return createdPool;
}

export function getDb(): Kysely<Database> {
  if (db === null) {
    pool = buildPool();
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool })
    });
  }
  return db;
}

export async function runDb<T>(operation: () => Promise<T>, context: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Database operation failed', { context, error });
    throw new AppError('Database operation failed.', 500);
  }
}

export function assertRowsAffected(rowCount: number | bigint | null | undefined, entity: string): void {
  const affected = typeof rowCount === 'bigint' ? Number(rowCount) : (rowCount ?? 0);
  if (affected === 0) {
    throw new AppError(`${entity} not found.`, 404);
  }
}

export function mapGiveaway(row: Selectable<GiveawaysTable>): Giveaway {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    title: row.title,
    description: row.description,
    endAt: new Date(row.end_at),
    winnerCount: row.winner_count,
    status: row.status,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    interval: row.interval,
    autoRepeat: row.auto_repeat,
    claimDeadline: row.claim_deadline,
    winners: row.winners ?? []
  };
}

async function executeSchemaStatements(
  statements: readonly string[],
  context: string
): Promise<void> {
  await runDb(async () => {
    await getDb().transaction().execute(async (trx) => {
      for (const statement of statements) {
        await sql.raw(statement).execute(trx);
      }
    });
  }, context);
}

export async function initSchema(): Promise<void> {
  logger.info('Initializing database schema...');
  try {
    await executeSchemaStatements(DATABASE_SCHEMA_SQL_STATEMENTS, 'initSchema.setup');
    await executeSchemaStatements(DATABASE_SCHEMA_MIGRATION_SQL_STATEMENTS, 'initSchema.migrate');

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema', error);
    throw error;
  }
}
const ALLOWED_DATABASE_SSL_MODES_PRODUCTION = new Set(['require', 'verify-ca', 'verify-full']);
