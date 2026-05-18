import {
  ChannelType,
  type Client
} from 'discord.js';
import type { Hono } from 'hono';
import { getCachedGuildOptions, setCachedGuildOptions } from '../../redis/guildOptions.js';
import { logger } from '../../shared/logger/index.js';
import { AppError } from '../../shared/errors/index.js';
import { getSessionGuild, requireSession } from '../../features/auth/index.js';
import { requireParam, respondError } from '../utils/response.js';

const DISCORD_GUILD_OPTIONS_FETCH_RETRY_COUNT = 1;
// Keep retry delay short to recover transient Discord/API gateway hiccups without slowing normal requests.
const DISCORD_GUILD_OPTIONS_RETRY_DELAY_MS = 200;

type GuildOptionsResponse = {
  guild: {
    id: string;
    name: string;
    iconUrl: string | null;
  };
  roles: Array<{
    id: string;
    name: string;
  }>;
  channels: Array<{
    id: string;
    name: string;
  }>;
};

function areGuildOptionsDifferent(previous: GuildOptionsResponse, next: GuildOptionsResponse): boolean {
  const normalize = (payload: GuildOptionsResponse) => ({
    guild: payload.guild,
    roles: [...payload.roles].sort((a, b) => a.id.localeCompare(b.id)),
    channels: [...payload.channels].sort((a, b) => a.id.localeCompare(b.id))
  });
  return JSON.stringify(normalize(previous)) !== JSON.stringify(normalize(next));
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchGuildOptionsFromDiscord(client: Client, guildId: string): Promise<GuildOptionsResponse> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new AppError('Guild not found.', 404);
  }

  const roleCollection = await guild.roles.fetch().catch(() => null);
  if (!roleCollection) {
    throw new AppError('Failed to fetch guild roles from Discord.', 502);
  }
  const roles = roleCollection
    .map((role) => ({ id: role.id, name: role.name }))
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const channelCollection = await guild.channels.fetch().catch(() => null);
  if (!channelCollection) {
    throw new AppError('Failed to fetch guild channels from Discord.', 502);
  }
  const channels = channelCollection
    .toJSON()
    .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
    .filter((channel) => channel.type === ChannelType.GuildText)
    .map((channel) => ({ id: channel.id, name: channel.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 64, extension: 'png' })
    },
    roles,
    channels
  };
}

async function fetchGuildOptionsWithRetry(client: Client, guildId: string): Promise<GuildOptionsResponse> {
  let lastError: unknown = null;
  for (let attemptNumber = 0; attemptNumber <= DISCORD_GUILD_OPTIONS_FETCH_RETRY_COUNT; attemptNumber += 1) {
    try {
      return await fetchGuildOptionsFromDiscord(client, guildId);
    } catch (error) {
      lastError = error;
      if (attemptNumber >= DISCORD_GUILD_OPTIONS_FETCH_RETRY_COUNT) {
        break;
      }
      await sleep(DISCORD_GUILD_OPTIONS_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AppError('Failed to fetch guild options from Discord.', 502);
}

export function registerGuildRoutes(app: Hono, client: Client): void {
  app.get('/api/guilds', async (c) => {
    try {
      const session = await requireSession(c);
      return c.json({
        guilds: session.guilds.map((guild) => ({
          id: guild.id,
          name: guild.name,
          iconUrl: guild.iconUrl
        }))
      });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/guilds/:guildId/options', async (c) => {
    const rawGuildId = c.req.param('guildId');
    const forceRefresh = c.req.query('refresh') === '1';
    try {
      const guildId = requireParam(rawGuildId, 'guildId');
      const session = await requireSession(c);
      getSessionGuild(session, guildId);
      const cached = await getCachedGuildOptions(guildId);
      if (cached && !forceRefresh) {
        return c.json({
          guild: cached.guild,
          roles: cached.roles,
          channels: cached.channels
        });
      }

      const latest = await fetchGuildOptionsWithRetry(client, guildId);
      if (cached && areGuildOptionsDifferent(
        {
          guild: cached.guild,
          roles: cached.roles,
          channels: cached.channels
        },
        latest
      )) {
        logger.info('Guild options cache mismatch detected, refreshing cache.', { guildId });
      }
      await setCachedGuildOptions(guildId, latest);
      return c.json(latest);
    } catch (error) {
      if (forceRefresh && rawGuildId) {
        logger.warn('Guild options refresh failed.', { guildId: rawGuildId, error });
      }
      return respondError(c, error);
    }
  });
}
