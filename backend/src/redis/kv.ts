import type { Redis } from 'ioredis';
import type { z } from 'zod';
import { getRedis } from './client.js';

export function buildRedisKey(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}

export async function deleteRedisKey(key: string, redis = getRedis()): Promise<void> {
  await redis.del(key);
}

export async function getRedisJson<TSchema extends z.ZodTypeAny>(
  key: string,
  schema: TSchema,
  redis = getRedis()
): Promise<z.output<TSchema> | null> {
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await deleteRedisKey(key, redis);
    return null;
  }

  const record = schema.safeParse(parsed);
  if (!record.success) {
    await deleteRedisKey(key, redis);
    return null;
  }

  return record.data;
}

export async function setRedisJson(
  key: string,
  value: unknown,
  options: {
    ttlMs?: number;
    ifNotExists?: boolean;
  } = {},
  redis = getRedis()
): Promise<'OK' | null> {
  const ttlMs = options.ttlMs !== undefined ? Math.max(1, options.ttlMs) : undefined;
  const payload = JSON.stringify(value);
  if (ttlMs !== undefined && options.ifNotExists) {
    return redis.set(key, payload, 'PX', ttlMs, 'NX');
  }
  if (ttlMs !== undefined) {
    return redis.set(key, payload, 'PX', ttlMs);
  }
  if (options.ifNotExists) {
    return redis.set(key, payload, 'NX');
  }
  return redis.set(key, payload);
}

export async function scanKeysByPrefix(
  prefix: string,
  config: {
    scanCount: number;
    maxScannedKeys: number;
  },
  callback: (keys: string[], redis: Redis) => Promise<void>,
  redis = getRedis()
): Promise<void> {
  let cursor = '0';
  let scannedCount = 0;

  do {
    if (scannedCount >= config.maxScannedKeys) {
      return;
    }
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', config.scanCount);
    cursor = nextCursor;
    const limitedKeys = keys.slice(0, config.maxScannedKeys - scannedCount);
    scannedCount += limitedKeys.length;
    if (limitedKeys.length > 0) {
      await callback(limitedKeys, redis);
    }
    if (scannedCount >= config.maxScannedKeys) {
      return;
    }
  } while (cursor !== '0');
}
