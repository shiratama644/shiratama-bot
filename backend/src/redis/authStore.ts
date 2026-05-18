import { z } from 'zod';
import type { AuthGuild } from '../features/auth/types.js';
import { getRedis } from './client.js';
import { buildRedisKey, deleteRedisKey, getRedisJson, scanKeysByPrefix, setRedisJson } from './kv.js';

const AUTH_SESSION_KEY_PREFIX = 'auth:session:';
const OAUTH_STATE_KEY_PREFIX = 'auth:oauth-state:';

const storedAuthSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    avatarUrl: z.string().min(1)
  }),
  guilds: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string().nullable(),
    canUseDashboard: z.boolean(),
    canCreateGiveaway: z.boolean(),
    isOwner: z.boolean()
  })),
  expiresAt: z.number().int().positive()
});

type StoredAuthSession = z.infer<typeof storedAuthSessionSchema>;

function buildAuthSessionKey(token: string): string {
  return buildRedisKey(AUTH_SESSION_KEY_PREFIX, token);
}

function buildOAuthStateKey(state: string): string {
  return buildRedisKey(OAUTH_STATE_KEY_PREFIX, state);
}

export async function storeOAuthState(state: string, ttlMs: number): Promise<void> {
  await getRedis().set(buildOAuthStateKey(state), '1', 'PX', Math.max(1, ttlMs));
}

export async function consumeStoredOAuthState(state: string): Promise<boolean> {
  const consumed = await getRedis().getdel(buildOAuthStateKey(state));
  return consumed !== null;
}

export async function insertAuthSession(params: {
  token: string;
  payload: {
    user: StoredAuthSession['user'];
    guilds: AuthGuild[];
  };
  expiresAt: Date;
}): Promise<void> {
  const record: StoredAuthSession = {
    user: params.payload.user,
    guilds: params.payload.guilds,
    expiresAt: params.expiresAt.getTime()
  };
  const ttlMs = Math.max(1, record.expiresAt - Date.now());
  await setRedisJson(buildAuthSessionKey(params.token), record, { ttlMs });
}

export async function getStoredAuthSession(token: string): Promise<{
  token: string;
  user: StoredAuthSession['user'];
  guilds: StoredAuthSession['guilds'];
  expiresAt: number;
} | null> {
  const key = buildAuthSessionKey(token);
  const session = await getRedisJson(key, storedAuthSessionSchema);
  if (!session || session.expiresAt <= Date.now()) {
    await deleteRedisKey(key);
    return null;
  }

  return {
    token,
    user: session.user,
    guilds: session.guilds as AuthGuild[],
    expiresAt: session.expiresAt
  };
}

export async function deleteStoredAuthSession(token: string): Promise<void> {
  await deleteRedisKey(buildAuthSessionKey(token));
}

type SessionCleanupConfig = {
  scanCount?: number;
  maxScannedKeys?: number;
};

const SESSION_CLEANUP_DEFAULT_SCAN_COUNT = 50;
const SESSION_CLEANUP_DEFAULT_MAX_SCANNED_KEYS = 200;

export async function cleanupStoredAuthSessions(config?: SessionCleanupConfig): Promise<number> {
  const normalizedScanCount = config?.scanCount !== undefined
    ? Math.floor(config.scanCount)
    : SESSION_CLEANUP_DEFAULT_SCAN_COUNT;
  const normalizedMaxScannedKeys = config?.maxScannedKeys !== undefined
    ? Math.floor(config.maxScannedKeys)
    : SESSION_CLEANUP_DEFAULT_MAX_SCANNED_KEYS;
  const scanCount = Math.max(1, normalizedScanCount);
  const maxScannedKeys = Math.max(1, normalizedMaxScannedKeys);
  const redis = getRedis();
  let deletedCount = 0;
  await scanKeysByPrefix(
    AUTH_SESSION_KEY_PREFIX,
    { scanCount, maxScannedKeys },
    async (keys, client) => {
      const rawValues = await client.mget(keys);
      const keysToDelete: string[] = [];
      const now = Date.now();
      for (let i = 0; i < keys.length; i += 1) {
        const raw = rawValues[i];
        if (!raw) {
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          keysToDelete.push(keys[i]);
          continue;
        }
        const session = storedAuthSessionSchema.safeParse(parsed);
        if (!session.success || session.data.expiresAt <= now) {
          keysToDelete.push(keys[i]);
        }
      }
      if (keysToDelete.length === 0) {
        return;
      }
      const pipeline = client.pipeline();
      for (const key of keysToDelete) {
        pipeline.del(key);
      }
      await pipeline.exec();
      deletedCount += keysToDelete.length;
    },
    redis
  );

  return deletedCount;
}
