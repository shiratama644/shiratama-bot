import { Kysely, PostgresDialect, sql, type ColumnType, type Selectable } from 'kysely';
import { Pool } from 'pg';
import type { Giveaway, GuildSettings } from './types.js';
import { logger } from './utils/logger.js';
import { AppError } from './errors.js';

let pool: Pool | null = null;
let db: Kysely<Database> | null = null;
const ENTITY_GIVEAWAY = 'Giveaway';

interface GuildSettingsTable {
  guild_id: string;
  manager_role_ids: ColumnType<string[], string[] | undefined, string[]>;
  language: ColumnType<string, string | undefined, string>;
  giveaway_channel_ids: ColumnType<string[], string[] | undefined, string[]>;
  default_claim_deadline: ColumnType<string | null, string | null | undefined, string | null>;
}

interface GiveawaysTable {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: ColumnType<string | null, string | null | undefined, string | null>;
  title: string;
  description: ColumnType<string | null, string | null | undefined, string | null>;
  end_at: Date;
  winner_count: number;
  status: ColumnType<Giveaway['status'], Giveaway['status'] | undefined, Giveaway['status']>;
  created_by: string;
  created_at: ColumnType<Date, Date | undefined, Date>;
  interval: ColumnType<string | null, string | null | undefined, string | null>;
  auto_repeat: ColumnType<boolean, boolean | undefined, boolean>;
  claim_deadline: ColumnType<string | null, string | null | undefined, string | null>;
  winners: ColumnType<string[], string[] | undefined, string[]>;
}

interface GiveawayEntriesTable {
  giveaway_id: string;
  user_id: string;
  joined_at: ColumnType<Date, Date | undefined, Date>;
}

interface Database {
  guild_settings: GuildSettingsTable;
  giveaways: GiveawaysTable;
  giveaway_entries: GiveawayEntriesTable;
}

function getDb(): Kysely<Database> {
  if (db === null) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      logger.error('DATABASE_URL is not defined in environment variables');
      throw new AppError('Database configuration error.', 500);
    }
    pool = new Pool({
      connectionString
    });
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle database client', err);
    });
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool
      })
    });
  }
  return db;
}

async function runDb<T>(operation: () => Promise<T>, context: string): Promise<T> {
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

function assertRowsAffected(rowCount: number | bigint | null | undefined, entity: string): void {
  const affected = typeof rowCount === 'bigint' ? Number(rowCount) : (rowCount ?? 0);
  if (affected === 0) {
    throw new AppError(`${entity} not found.`, 404);
  }
}

function mapGiveaway(row: Selectable<GiveawaysTable>): Giveaway {
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
        manager_role_ids TEXT[] NOT NULL DEFAULT '{}',
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

      CREATE INDEX IF NOT EXISTS idx_giveaways_active_end_at ON giveaways(status, end_at);
      CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status_created_at ON giveaways(guild_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_id ON giveaway_entries(giveaway_id);
    `).execute(getDb());

    // Migrate existing tables by adding columns that may not exist yet
    await sql.raw(`
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS giveaway_channel_ids TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS default_claim_deadline TEXT;
      ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS claim_deadline TEXT;
      ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winners TEXT[] NOT NULL DEFAULT '{}';
    `).execute(getDb());

    logger.info('Database schema initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database schema', error);
    throw error;
  }
}

export async function getManagerRoleIds(guildId: string): Promise<string[]> {
  const settings = await getGuildSettings(guildId);
  return settings.managerRoleIds;
}

export async function setManagerRoleIds(guildId: string, roleIds: string[]): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('guild_settings')
      .values({
        guild_id: guildId,
        manager_role_ids: roleIds
      })
      .onConflict((oc) =>
        oc.column('guild_id').doUpdateSet({
          manager_role_ids: roleIds
        })
      )
      .execute();
  }, 'setManagerRoleIds');
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('guild_settings')
      .selectAll()
      .where('guild_id', '=', guildId)
      .executeTakeFirst();
    if (!row) {
      return {
        guildId,
        managerRoleIds: [],
        language: 'en',
        giveawayChannelIds: [],
        defaultClaimDeadline: null
      };
    }
    return {
      guildId: row.guild_id,
      managerRoleIds: row.manager_role_ids ?? [],
      language: row.language ?? 'en',
      giveawayChannelIds: row.giveaway_channel_ids ?? [],
      defaultClaimDeadline: row.default_claim_deadline
    };
  }, 'getGuildSettings');
}

export async function setGuildSettings(guildId: string, settings: Partial<Omit<GuildSettings, 'guildId'>>): Promise<void> {
  await runDb(async () => {
    const managerRoleIds = settings.managerRoleIds ?? [];
    const language = settings.language ?? 'en';
    const giveawayChannelIds = settings.giveawayChannelIds ?? [];
    const defaultClaimDeadline = settings.defaultClaimDeadline ?? null;
    await getDb()
      .insertInto('guild_settings')
      .values({
        guild_id: guildId,
        manager_role_ids: managerRoleIds,
        language,
        giveaway_channel_ids: giveawayChannelIds,
        default_claim_deadline: defaultClaimDeadline
      })
      .onConflict((oc) =>
        oc.column('guild_id').doUpdateSet({
          manager_role_ids: managerRoleIds,
          language,
          giveaway_channel_ids: giveawayChannelIds,
          default_claim_deadline: defaultClaimDeadline
        })
      )
      .execute();
  }, 'setGuildSettings');
}

export async function createGiveaway(params: {
  id: string;
  guildId: string;
  channelId: string;
  title: string;
  description: string | null;
  endAt: Date;
  winnerCount: number;
  createdBy: string;
  interval: string | null;
  autoRepeat: boolean;
  claimDeadline: string | null;
}): Promise<Giveaway> {
  return runDb(async () => {
    const row = await getDb()
      .insertInto('giveaways')
      .values({
        id: params.id,
        guild_id: params.guildId,
        channel_id: params.channelId,
        title: params.title,
        description: params.description,
        end_at: params.endAt,
        winner_count: params.winnerCount,
        created_by: params.createdBy,
        interval: params.interval,
        auto_repeat: params.autoRepeat,
        claim_deadline: params.claimDeadline
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapGiveaway(row);
  }, 'createGiveaway');
}

export async function updateGiveawayStatus(id: string, status: Giveaway['status']): Promise<void> {
  await runDb(async () => {
    const result = await getDb()
      .updateTable('giveaways')
      .set({ status })
      .where('id', '=', id)
      .executeTakeFirst();
    assertRowsAffected(result.numUpdatedRows, ENTITY_GIVEAWAY);
  }, 'updateGiveawayStatus');
}

export async function updateGiveawayAutoRepeat(id: string, autoRepeat: boolean): Promise<void> {
  await runDb(async () => {
    const result = await getDb()
      .updateTable('giveaways')
      .set({ auto_repeat: autoRepeat })
      .where('id', '=', id)
      .executeTakeFirst();
    assertRowsAffected(result.numUpdatedRows, ENTITY_GIVEAWAY);
  }, 'updateGiveawayAutoRepeat');
}

export async function listAllActiveGiveaways(): Promise<Giveaway[]> {
  return runDb(async () => {
    const rows = await getDb()
      .selectFrom('giveaways')
      .selectAll()
      .where('status', '=', 'active')
      .execute();
    return rows.map((row) => mapGiveaway(row));
  }, 'listAllActiveGiveaways');
}

export async function setGiveawayMessageId(id: string, messageId: string): Promise<void> {
  await runDb(async () => {
    const result = await getDb()
      .updateTable('giveaways')
      .set({ message_id: messageId })
      .where('id', '=', id)
      .executeTakeFirst();
    assertRowsAffected(result.numUpdatedRows, ENTITY_GIVEAWAY);
  }, 'setGiveawayMessageId');
}

export async function getGiveaway(id: string): Promise<Giveaway | null> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('giveaways')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? mapGiveaway(row) : null;
  }, 'getGiveaway');
}

export async function getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
  return runDb(async () => {
    const rows = await getDb()
      .selectFrom('giveaways')
      .selectAll()
      .where('guild_id', '=', guildId)
      .where('status', '=', 'active')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => mapGiveaway(row));
  }, 'getActiveGiveaways');
}

export async function getEndedGiveaways(guildId: string): Promise<Giveaway[]> {
  return runDb(async () => {
    const rows = await getDb()
      .selectFrom('giveaways')
      .selectAll()
      .where('guild_id', '=', guildId)
      .where('status', '=', 'ended')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => mapGiveaway(row));
  }, 'getEndedGiveaways');
}

export async function getDueGiveaways(now: Date): Promise<Giveaway[]> {
  return runDb(async () => {
    const rows = await getDb()
      .selectFrom('giveaways')
      .selectAll()
      .where('status', '=', 'active')
      .where('end_at', '<=', now)
      .orderBy('end_at', 'asc')
      .execute();
    return rows.map((row) => mapGiveaway(row));
  }, 'getDueGiveaways');
}

export async function markGiveawayEnded(id: string): Promise<void> {
  await runDb(async () => {
    const result = await getDb()
      .updateTable('giveaways')
      .set({ status: 'ended' })
      .where('id', '=', id)
      .executeTakeFirst();
    assertRowsAffected(result.numUpdatedRows, ENTITY_GIVEAWAY);
  }, 'markGiveawayEnded');
}

export async function toggleGiveawayEntry(giveawayId: string, userId: string): Promise<'joined' | 'left'> {
  return runDb(async () => {
    // Atomic toggle in a single statement:
    // 1) Confirm giveaway exists and is active.
    // 2) If user is already entered, delete the entry.
    // 3) Otherwise insert an entry, tolerating concurrent inserts with ON CONFLICT DO NOTHING.
    const result = await sql<{
      status: Giveaway['status'] | null;
      joined: boolean;
      left: boolean;
    }>`
      WITH target AS (
        SELECT status
        FROM giveaways
        WHERE id = ${giveawayId}
      ),
      deleted AS (
        DELETE FROM giveaway_entries
        WHERE giveaway_id = ${giveawayId} AND user_id = ${userId}
          AND EXISTS (SELECT 1 FROM target WHERE status = 'active')
        RETURNING 1
      ),
      inserted AS (
        INSERT INTO giveaway_entries (giveaway_id, user_id)
        SELECT ${giveawayId}, ${userId}
        WHERE EXISTS (SELECT 1 FROM target WHERE status = 'active')
          AND NOT EXISTS (SELECT 1 FROM deleted)
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT
        (SELECT status FROM target) AS status,
        EXISTS (SELECT 1 FROM inserted) AS joined,
        EXISTS (SELECT 1 FROM deleted) AS left
    `.execute(getDb());

    const row = result.rows[0];
    if (!row?.status) {
      throw new AppError(`${ENTITY_GIVEAWAY} not found.`, 404);
    }
    if (row.status !== 'active') {
      throw new AppError('This giveaway is not currently active.', 409);
    }
    if (row.left) {
      return 'left';
    }

    // When active and not left, treat as joined (including concurrent ON CONFLICT no-op cases).
    return 'joined';
  }, 'toggleGiveawayEntry');
}

export async function isUserEntered(giveawayId: string, userId: string): Promise<boolean> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('giveaway_entries')
      .select('user_id')
      .where('giveaway_id', '=', giveawayId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Boolean(row);
  }, 'isUserEntered');
}

export async function addGiveawayEntry(giveawayId: string, userId: string): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('giveaway_entries')
      .values({
        giveaway_id: giveawayId,
        user_id: userId
      })
      .onConflict((oc) => oc.columns(['giveaway_id', 'user_id']).doNothing())
      .execute();
  }, 'addGiveawayEntry');
}

export async function removeGiveawayEntry(giveawayId: string, userId: string): Promise<void> {
  await runDb(async () => {
    await getDb()
      .deleteFrom('giveaway_entries')
      .where('giveaway_id', '=', giveawayId)
      .where('user_id', '=', userId)
      .execute();
  }, 'removeGiveawayEntry');
}

export async function countEntries(giveawayId: string): Promise<number> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('giveaway_entries')
      .select(({ fn }) => fn.count<number>('user_id').as('count'))
      .where('giveaway_id', '=', giveawayId)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }, 'countEntries');
}

export async function listEntries(giveawayId: string): Promise<string[]> {
  return runDb(async () => {
    const rows = await getDb()
      .selectFrom('giveaway_entries')
      .select('user_id')
      .where('giveaway_id', '=', giveawayId)
      .execute();
    return rows.map((row) => row.user_id);
  }, 'listEntries');
}

export async function setGiveawayWinners(id: string, winners: string[]): Promise<void> {
  await runDb(async () => {
    const result = await getDb()
      .updateTable('giveaways')
      .set({ winners })
      .where('id', '=', id)
      .executeTakeFirst();
    assertRowsAffected(result.numUpdatedRows, ENTITY_GIVEAWAY);
  }, 'setGiveawayWinners');
}
