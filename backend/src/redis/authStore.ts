import { z } from 'zod';
import type { AuthGuild } from '../features/auth/types.js';
import { getRedis } from './client.js';

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
  return `${AUTH_SESSION_KEY_PREFIX}${token}`;
}

function buildOAuthStateKey(state: string): string {
  return `${OAUTH_STATE_KEY_PREFIX}${state}`;
}

async function deleteRedisKey(key: string): Promise<void> {
  await getRedis().del(key);
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
  await getRedis().set(buildAuthSessionKey(params.token), JSON.stringify(record), 'PX', ttlMs);
}

export async function getStoredAuthSession(token: string): Promise<{
  token: string;
  user: StoredAuthSession['user'];
  guilds: StoredAuthSession['guilds'];
  expiresAt: number;
} | null> {
  const key = buildAuthSessionKey(token);
  const raw = await getRedis().get(key);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await deleteRedisKey(key);
    return null;
  }

  const session = storedAuthSessionSchema.safeParse(parsed);
  if (!session.success || session.data.expiresAt <= Date.now()) {
    await deleteRedisKey(key);
    return null;
  }

  return {
    token,
    user: session.data.user,
    guilds: session.data.guilds as AuthGuild[],
    expiresAt: session.data.expiresAt
  };
}

export async function deleteStoredAuthSession(token: string): Promise<void> {
  await deleteRedisKey(buildAuthSessionKey(token));
}
