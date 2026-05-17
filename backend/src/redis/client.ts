import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

function requireRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required.');
  }
  return redisUrl;
}

export function getRedis(): Redis {
  if (!redisClient) {
    const client = new Redis(requireRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableAutoPipelining: true
    });
    client.on('error', (error: unknown) => {
      console.error('[redis] error', error);
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
