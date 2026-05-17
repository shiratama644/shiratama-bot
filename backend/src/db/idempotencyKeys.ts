import { getDb, runDb } from './client.js';

type IdempotencyRecord = {
  key: string;
  actorId: string;
  guildId: string;
  giveawayId: string | null;
};

export async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return {
      key: row.key,
      actorId: row.actor_id,
      guildId: row.guild_id,
      giveawayId: row.giveaway_id
    };
  }, 'getIdempotencyRecord');
}

export async function createIdempotencyRecord(key: string, actorId: string, guildId: string): Promise<boolean> {
  return runDb(async () => {
    const inserted = await getDb()
      .insertInto('idempotency_keys')
      .values({
        key,
        actor_id: actorId,
        guild_id: guildId
      })
      .onConflict((oc) => oc.column('key').doNothing())
      .executeTakeFirst();
    const affected = typeof inserted.numInsertedOrUpdatedRows === 'bigint'
      ? Number(inserted.numInsertedOrUpdatedRows)
      : Number(inserted.numInsertedOrUpdatedRows ?? 0);
    return affected > 0;
  }, 'createIdempotencyRecord');
}

export async function setIdempotencyGiveawayId(key: string, giveawayId: string): Promise<void> {
  await runDb(async () => {
    await getDb()
      .updateTable('idempotency_keys')
      .set({ giveaway_id: giveawayId })
      .where('key', '=', key)
      .execute();
  }, 'setIdempotencyGiveawayId');
}
