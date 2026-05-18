import { Redis } from 'ioredis';
import { logger } from '../shared/logger/index.js';

let redisClient: Redis | null = null;

function requireRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required.');
  }
  return redisUrl;
}

function readNumberEnv(name: string, defaultValue: number, minimum = 0): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    logger.warn(`Invalid ${name}; falling back to default value.`, { value: raw, defaultValue });
    return defaultValue;
  }
  return parsed;
}

export function getRedis(): Redis {
  if (!redisClient) {
    const maxRetriesPerRequest = readNumberEnv('REDIS_MAX_RETRIES_PER_REQUEST', 1, 0);
    const connectTimeout = readNumberEnv('REDIS_CONNECT_TIMEOUT_MS', 10_000, 1);
    const maxReconnectDelay = readNumberEnv('REDIS_MAX_RECONNECT_DELAY_MS', 10_000, 10);
    const client = new Redis(requireRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest,
      enableAutoPipelining: true,
      connectTimeout,
      retryStrategy: (times) => Math.min(times * 100, maxReconnectDelay)
    });
    client.on('error', (error) => {
      logger.error('Redis client error.', error);
    });
    client.on('reconnecting', () => {
      logger.warn('Redis client reconnecting.');
    });
    client.on('ready', () => {
      logger.info('Redis client ready.');
    });
    redisClient = client;
  }
  return redisClient;
}

export async function initRedis(): Promise<void> {
  const redis = getRedis();
  if (redis.status === 'wait') {
    await redis.connect();
  }
  await redis.ping();
}
