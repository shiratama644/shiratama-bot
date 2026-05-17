import { Kysely, PostgresDialect, sql, type Selectable } from 'kysely';
import { Pool } from 'pg';
import type { Giveaway } from '../shared/types/common.js';
import { logger } from '../shared/logger/index.js';
import { AppError } from '../shared/errors/index.js';
import type { Database, GiveawaysTable } from './schema.js';

let pool: Pool | null = null;
let db: Kysely<Database> | null = null;

export function getDb(): Kysely<Database> {
  if (db === null) {
    const connectionString = process.env.DATABASE_URL;
    const sslMode = process.env.DATABASE_SSL_MODE ?? (process.env.NODE_ENV === 'production' ? 'require' : 'prefer');
    if (!connectionString) {
      logger.error('DATABASE_URL is not defined in environment variables');
      throw new AppError('DATABASE_URL environment variable is not configured.', 500);
    }
    if (process.env.NODE_ENV === 'production' && sslMode !== 'require') {
      throw new AppError('DATABASE_SSL_MODE must be "require" in production.', 500);
    }
    const shouldRequireSsl = sslMode === 'require';
    pool = new Pool({
      connectionString,
      ssl: shouldRequireSsl
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined
    });
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle database client', err);
    });
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

export async function initSchema(): Promise<void> {
  logger.info('Initializing database schema...');
  try {
    await sql.raw(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        giveaway_creator_role_ids TEXT[] NOT NULL DEFAULT '{}',
        dashboard_view_role_ids TEXT[] NOT NULL DEFAULT '{}',
        language TEXT NOT NULL DEFAULT 'en',
        giveaway_channel_ids TEXT[] NOT NULL DEFAULT '{}',
        default_claim_deadline TEXT
      );

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

      CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_id TEXT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (giveaway_id, user_id)
      );

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

      CREATE INDEX IF NOT EXISTS idx_giveaways_active_end_at ON giveaways(status, end_at);
      CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status_created_at ON giveaways(guild_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_id ON giveaway_entries(giveaway_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created_at ON audit_logs(guild_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs(action, created_at DESC);
    `).execute(getDb());

    // Migrate existing tables by adding columns that may not exist yet
    await sql.raw(`
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS giveaway_channel_ids TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS default_claim_deadline TEXT;
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS manager_role_ids TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS giveaway_creator_role_ids TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS dashboard_view_role_ids TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS claim_deadline TEXT;
      ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winners TEXT[] NOT NULL DEFAULT '{}';
      UPDATE guild_settings
      SET giveaway_creator_role_ids = manager_role_ids
      WHERE cardinality(giveaway_creator_role_ids) = 0 AND manager_role_ids IS NOT NULL;
    `).execute(getDb());

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema', error);
    throw error;
  }
}
