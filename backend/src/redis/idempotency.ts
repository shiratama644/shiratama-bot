import { z } from 'zod';
import { getRedis } from './client.js';

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
  return `${IDEMPOTENCY_KEY_PREFIX}${key}`;
}

async function deleteRedisKey(key: string): Promise<void> {
  await getRedis().del(key);
}

export async function getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
  const redisKey = buildIdempotencyKey(key);
  const raw = await getRedis().get(redisKey);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await deleteRedisKey(redisKey);
    return null;
  }

  const record = idempotencyRecordSchema.safeParse(parsed);
  if (!record.success) {
    await deleteRedisKey(redisKey);
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
  const result = await getRedis().set(
    buildIdempotencyKey(key),
    JSON.stringify({
      actorId,
      guildId,
      giveawayId: null
    }),
    'PX',
    IDEMPOTENCY_TTL_MS,
    'NX'
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
  await getRedis().set(
    redisKey,
    JSON.stringify({
      actorId: existing.actorId,
      guildId: existing.guildId,
      giveawayId
    }),
    'PX',
    ttlMs > 0 ? ttlMs : IDEMPOTENCY_TTL_MS
  );
}
