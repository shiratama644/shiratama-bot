import { sql } from 'kysely';
import type { Giveaway } from '../types.js';
import { AppError } from '../errors.js';
import { getDb, runDb } from './client.js';

const ENTITY_GIVEAWAY = 'Giveaway';

export async function toggleGiveawayEntry(giveawayId: string, userId: string): Promise<'joined' | 'left'> {
  return runDb(async () => {
    // Atomic toggle in a single statement:
    // - target: fetch giveaway status for existence + active-state checks
    // - deleted: remove existing entry when giveaway is active
    // - inserted: insert entry when active and no row was deleted (with conflict-safe insert)
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
