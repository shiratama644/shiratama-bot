import { z } from 'zod';
import { getRedis } from './client.js';
import { buildRedisKey, deleteRedisKey, getRedisJson, setRedisJson } from './kv.js';

const IDEMPOTENCY_KEY_PREFIX = 'idempotency:giveaway:';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const idempotencyRecordSchema = z.object({
  actorId: z.string().min(1),
  guildId: z.string().min(1),
  giveawayId: z.string().min(1).nullable()
});

type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema> & {
  key: string;
};

function buildIdempotencyKey(key: string): string {
  return buildRedisKey(IDEMPOTENCY_KEY_PREFIX, key);
}

export async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
  const record = await getRedisJson(buildIdempotencyKey(key), idempotencyRecordSchema);
  if (!record) {
    return null;
  }

  return {
    key,
    actorId: record.data.actorId,
    guildId: record.data.guildId,
    giveawayId: record.data.giveawayId
  };
}

export async function createIdempotencyRecord(key: string, actorId: string, guildId: string): Promise<boolean> {
  const result = await setRedisJson(
    buildIdempotencyKey(key),
    {
      actorId,
      guildId,
      giveawayId: null
    },
    {
      ttlMs: IDEMPOTENCY_TTL_MS,
      ifNotExists: true
    }
  );
  return result === 'OK';
}

export async function setIdempotencyGiveawayId(key: string, giveawayId: string): Promise<void> {
  const redisKey = buildIdempotencyKey(key);
  const existing = await getIdempotencyRecord(key);
  if (!existing) {
    return;
  }

  const ttlMs = await getRedis().pttl(redisKey);
  await setRedisJson(
    redisKey,
    {
      actorId: existing.actorId,
      guildId: existing.guildId,
      giveawayId
    },
    {
      ttlMs: ttlMs > 0 ? ttlMs : IDEMPOTENCY_TTL_MS
    }
  );
}
