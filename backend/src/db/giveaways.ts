import type { Giveaway } from '../types.js';
import { getDb, runDb, assertRowsAffected, mapGiveaway } from './client.js';

const ENTITY_GIVEAWAY = 'Giveaway';

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

export async function getGuildGiveaways(guildId: string): Promise<Giveaway[]> {
  return runDb(async () => {
    const rows = await getDb()
      .selectFrom('giveaways')
      .selectAll()
      .where('guild_id', '=', guildId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => mapGiveaway(row));
  }, 'getGuildGiveaways');
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
