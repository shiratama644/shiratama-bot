import { z } from 'zod';
import { getRedis } from './client.js';

const GUILD_OPTIONS_KEY_PREFIX = 'guild:options:';
const GUILD_OPTIONS_TTL_MS = 2 * 24 * 60 * 60 * 1000;

const cachedGuildOptionsSchema = z.object({
  guild: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    iconUrl: z.string().nullable()
  }),
  roles: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1)
    })
  ),
  channels: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1)
    })
  ),
  fetchedAt: z.number().int().positive()
});

export type CachedGuildOptions = z.infer<typeof cachedGuildOptionsSchema>;

function buildGuildOptionsKey(guildId: string): string {
  return `${GUILD_OPTIONS_KEY_PREFIX}${guildId}`;
}

async function deleteRedisKey(key: string): Promise<void> {
  await getRedis().del(key);
}

export async function getCachedGuildOptions(guildId: string): Promise<CachedGuildOptions | null> {
  const key = buildGuildOptionsKey(guildId);
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

  const record = cachedGuildOptionsSchema.safeParse(parsed);
  if (!record.success) {
    await deleteRedisKey(key);
    return null;
  }
  return record.data;
}

export async function setCachedGuildOptions(
  guildId: string,
  payload: Omit<CachedGuildOptions, 'fetchedAt'>
): Promise<void> {
  const record: CachedGuildOptions = {
    ...payload,
    fetchedAt: Date.now()
  };
  await getRedis().set(buildGuildOptionsKey(guildId), JSON.stringify(record), 'PX', GUILD_OPTIONS_TTL_MS);
}
