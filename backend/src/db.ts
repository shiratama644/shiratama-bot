import { Pool } from 'pg';
import type { Giveaway, GuildSettings } from './types.js';
import { logger } from './utils/logger.js';
import { AppError } from './errors.js';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool === null) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      logger.error('DATABASE_URL is not defined in environment variables');
      throw new Error('Database configuration error');
    }
    pool = new Pool({
      connectionString
    });
    pool.on('error', (err) => {
      logger.error('Unexpected error on idle database client', err);
    });
  }
  return pool;
}

function mapGiveaway(row: Record<string, unknown>): Giveaway {
  return {
    id: String(row.id),
    guildId: String(row.guild_id),
    channelId: String(row.channel_id),
    messageId: row.message_id ? String(row.message_id) : null,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    endAt: new Date(String(row.end_at)),
    winnerCount: Number(row.winner_count),
    status: String(row.status) as Giveaway['status'],
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)),
    interval: row.interval ? String(row.interval) : null,
    autoRepeat: Boolean(row.auto_repeat),
    claimDeadline: row.claim_deadline ? String(row.claim_deadline) : null,
    winners: Array.isArray(row.winners) ? (row.winners as string[]) : []
  };
}

export async function initSchema(): Promise<void> {
  logger.info('Initializing database schema...');
  try {
    await getPool().query(`
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
    `);

    // Migrate existing tables by adding columns that may not exist yet
    await getPool().query(`
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS giveaway_channel_ids TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS default_claim_deadline TEXT;
      ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS claim_deadline TEXT;
      ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winners TEXT[] NOT NULL DEFAULT '{}';
    `);

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
  await getPool().query(
    `INSERT INTO guild_settings (guild_id, manager_role_ids)
     VALUES ($1, $2)
     ON CONFLICT (guild_id)
     DO UPDATE SET manager_role_ids = EXCLUDED.manager_role_ids`,
    [guildId, roleIds]
  );
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const result = await getPool().query(
    'SELECT * FROM guild_settings WHERE guild_id = $1',
    [guildId]
  );
  if (result.rowCount === 0) {
    return {
      guildId,
      managerRoleIds: [],
      language: 'en',
      giveawayChannelIds: [],
      defaultClaimDeadline: null
    };
  }
  const row = result.rows[0] as Record<string, unknown>;
  return {
    guildId: String(row.guild_id),
    managerRoleIds: (row.manager_role_ids as string[]) ?? [],
    language: row.language ? String(row.language) : 'en',
    giveawayChannelIds: (row.giveaway_channel_ids as string[]) ?? [],
    defaultClaimDeadline: row.default_claim_deadline ? String(row.default_claim_deadline) : null
  };
}

export async function setGuildSettings(guildId: string, settings: Partial<Omit<GuildSettings, 'guildId'>>): Promise<void> {
  await getPool().query(
    `INSERT INTO guild_settings (guild_id, manager_role_ids, language, giveaway_channel_ids, default_claim_deadline)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (guild_id)
     DO UPDATE SET
       manager_role_ids = EXCLUDED.manager_role_ids,
       language = EXCLUDED.language,
       giveaway_channel_ids = EXCLUDED.giveaway_channel_ids,
       default_claim_deadline = EXCLUDED.default_claim_deadline`,
    [
      guildId,
      settings.managerRoleIds ?? [],
      settings.language ?? 'en',
      settings.giveawayChannelIds ?? [],
      settings.defaultClaimDeadline ?? null
    ]
  );
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
  const result = await getPool().query(
    `INSERT INTO giveaways (
      id, guild_id, channel_id, title, description, end_at, winner_count, created_by, interval, auto_repeat, claim_deadline
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *`,
    [
      params.id,
      params.guildId,
      params.channelId,
      params.title,
      params.description,
      params.endAt,
      params.winnerCount,
      params.createdBy,
      params.interval,
      params.autoRepeat,
      params.claimDeadline
    ]
  );
  return mapGiveaway(result.rows[0] as Record<string, unknown>);
}

export async function updateGiveawayStatus(id: string, status: Giveaway['status']): Promise<void> {
  const result = await getPool().query('UPDATE giveaways SET status = $2 WHERE id = $1', [id, status]);
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('Giveaway not found.', 404);
  }
}

export async function updateGiveawayAutoRepeat(id: string, autoRepeat: boolean): Promise<void> {
  const result = await getPool().query('UPDATE giveaways SET auto_repeat = $2 WHERE id = $1', [id, autoRepeat]);
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('Giveaway not found.', 404);
  }
}

export async function listAllActiveGiveaways(): Promise<Giveaway[]> {
  const result = await getPool().query(`SELECT * FROM giveaways WHERE status = 'active'`);
  return result.rows.map((row: Record<string, unknown>) => mapGiveaway(row));
}

export async function setGiveawayMessageId(id: string, messageId: string): Promise<void> {
  const result = await getPool().query('UPDATE giveaways SET message_id = $2 WHERE id = $1', [id, messageId]);
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('Giveaway not found.', 404);
  }
}

export async function getGiveaway(id: string): Promise<Giveaway | null> {
  const result = await getPool().query('SELECT * FROM giveaways WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return null;
  }
  return mapGiveaway(result.rows[0] as Record<string, unknown>);
}

export async function getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
  const result = await getPool().query(
    `SELECT * FROM giveaways
     WHERE guild_id = $1 AND status = 'active'
     ORDER BY end_at ASC`,
    [guildId]
  );
  return result.rows.map((row: Record<string, unknown>) => mapGiveaway(row));
}

export async function getEndedGiveaways(guildId: string): Promise<Giveaway[]> {
  const result = await getPool().query(
    `SELECT * FROM giveaways
     WHERE guild_id = $1 AND status = 'ended'
     ORDER BY end_at DESC`,
    [guildId]
  );
  return result.rows.map((row: Record<string, unknown>) => mapGiveaway(row));
}

export async function getDueGiveaways(now: Date): Promise<Giveaway[]> {
  const result = await getPool().query(
    `SELECT * FROM giveaways
     WHERE status = 'active' AND end_at <= $1
     ORDER BY end_at ASC`,
    [now]
  );
  return result.rows.map((row: Record<string, unknown>) => mapGiveaway(row));
}

export async function markGiveawayEnded(id: string): Promise<void> {
  const result = await getPool().query(`UPDATE giveaways SET status = 'ended' WHERE id = $1`, [id]);
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('Giveaway not found.', 404);
  }
}

export async function toggleGiveawayEntry(giveawayId: string, userId: string): Promise<'joined' | 'left'> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    throw new AppError('Giveaway not found.', 404);
  }
  if (giveaway.status !== 'active') {
    throw new AppError('This giveaway is not currently accepting entries.', 409);
  }

  const existing = await getPool().query(
    'SELECT 1 FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2',
    [giveawayId, userId]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    await getPool().query('DELETE FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2', [
      giveawayId,
      userId
    ]);
    return 'left';
  }

  await getPool().query(
    'INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [giveawayId, userId]
  );
  return 'joined';
}

export async function isUserEntered(giveawayId: string, userId: string): Promise<boolean> {
  const result = await getPool().query(
    'SELECT 1 FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2',
    [giveawayId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function joinGiveawayEntry(giveawayId: string, userId: string): Promise<void> {
  await getPool().query(
    'INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [giveawayId, userId]
  );
}

export async function leaveGiveawayEntry(giveawayId: string, userId: string): Promise<void> {
  await getPool().query(
    'DELETE FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2',
    [giveawayId, userId]
  );
}

export async function countEntries(giveawayId: string): Promise<number> {
  const result = await getPool().query(
    'SELECT COUNT(*)::int AS count FROM giveaway_entries WHERE giveaway_id = $1',
    [giveawayId]
  );
  return Number(result.rows[0].count);
}

export async function listEntries(giveawayId: string): Promise<string[]> {
  const result = await getPool().query('SELECT user_id FROM giveaway_entries WHERE giveaway_id = $1', [
    giveawayId
  ]);
  return result.rows.map((row: Record<string, unknown>) => String(row.user_id));
}

export async function setGiveawayWinners(id: string, winners: string[]): Promise<void> {
  const result = await getPool().query('UPDATE giveaways SET winners = $2 WHERE id = $1', [id, winners]);
  if ((result.rowCount ?? 0) === 0) {
    throw new AppError('Giveaway not found.', 404);
  }
}
