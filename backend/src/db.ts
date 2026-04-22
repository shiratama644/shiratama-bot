import { Pool } from 'pg';
import type { Giveaway } from './types.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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
    createdAt: new Date(String(row.created_at))
  };
}

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      manager_role_ids TEXT[] NOT NULL DEFAULT '{}'
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
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id TEXT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (giveaway_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_giveaways_active_end_at ON giveaways(status, end_at);
  `);
}

export async function getManagerRoleIds(guildId: string): Promise<string[]> {
  const result = await pool.query(
    'SELECT manager_role_ids FROM guild_settings WHERE guild_id = $1',
    [guildId]
  );
  if (result.rowCount === 0) {
    return [];
  }
  return (result.rows[0].manager_role_ids as string[]) ?? [];
}

export async function setManagerRoleIds(guildId: string, roleIds: string[]): Promise<void> {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, manager_role_ids)
     VALUES ($1, $2)
     ON CONFLICT (guild_id)
     DO UPDATE SET manager_role_ids = EXCLUDED.manager_role_ids`,
    [guildId, roleIds]
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
}): Promise<Giveaway> {
  const result = await pool.query(
    `INSERT INTO giveaways (
      id, guild_id, channel_id, title, description, end_at, winner_count, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      params.id,
      params.guildId,
      params.channelId,
      params.title,
      params.description,
      params.endAt,
      params.winnerCount,
      params.createdBy
    ]
  );
  return mapGiveaway(result.rows[0] as Record<string, unknown>);
}

export async function setGiveawayMessageId(id: string, messageId: string): Promise<void> {
  await pool.query('UPDATE giveaways SET message_id = $2 WHERE id = $1', [id, messageId]);
}

export async function getGiveaway(id: string): Promise<Giveaway | null> {
  const result = await pool.query('SELECT * FROM giveaways WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return null;
  }
  return mapGiveaway(result.rows[0] as Record<string, unknown>);
}

export async function getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
  const result = await pool.query(
    `SELECT * FROM giveaways
     WHERE guild_id = $1 AND status = 'active'
     ORDER BY end_at ASC`,
    [guildId]
  );
  return result.rows.map((row) => mapGiveaway(row as Record<string, unknown>));
}

export async function getDueGiveaways(now: Date): Promise<Giveaway[]> {
  const result = await pool.query(
    `SELECT * FROM giveaways
     WHERE status = 'active' AND end_at <= $1
     ORDER BY end_at ASC`,
    [now]
  );
  return result.rows.map((row) => mapGiveaway(row as Record<string, unknown>));
}

export async function markGiveawayEnded(id: string): Promise<void> {
  await pool.query(`UPDATE giveaways SET status = 'ended' WHERE id = $1`, [id]);
}

export async function toggleGiveawayEntry(giveawayId: string, userId: string): Promise<'joined' | 'left'> {
  const existing = await pool.query(
    'SELECT 1 FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2',
    [giveawayId, userId]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    await pool.query('DELETE FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2', [
      giveawayId,
      userId
    ]);
    return 'left';
  }

  await pool.query(
    'INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [giveawayId, userId]
  );
  return 'joined';
}

export async function countEntries(giveawayId: string): Promise<number> {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM giveaway_entries WHERE giveaway_id = $1',
    [giveawayId]
  );
  return Number(result.rows[0].count);
}

export async function listEntries(giveawayId: string): Promise<string[]> {
  const result = await pool.query('SELECT user_id FROM giveaway_entries WHERE giveaway_id = $1', [
    giveawayId
  ]);
  return result.rows.map((row) => String(row.user_id));
}
