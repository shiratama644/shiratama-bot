import { z } from 'zod';
import { buildRedisKey, getRedisJson, setRedisJson } from './kv.js';

const GUILD_OPTIONS_KEY_PREFIX = 'guild:options:';
const GUILD_OPTIONS_TTL_DAYS = 2;
const GUILD_OPTIONS_TTL_MS = GUILD_OPTIONS_TTL_DAYS * 24 * 60 * 60 * 1000;

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
  return buildRedisKey(GUILD_OPTIONS_KEY_PREFIX, guildId);
}

export async function getCachedGuildOptions(guildId: string): Promise<CachedGuildOptions | null> {
  return getRedisJson(buildGuildOptionsKey(guildId), cachedGuildOptionsSchema);
}

export async function setCachedGuildOptions(
  guildId: string,
  payload: Omit<CachedGuildOptions, 'fetchedAt'>
): Promise<void> {
  const record: CachedGuildOptions = {
    ...payload,
    fetchedAt: Date.now()
  };
  await setRedisJson(buildGuildOptionsKey(guildId), record, { ttlMs: GUILD_OPTIONS_TTL_MS });
}
