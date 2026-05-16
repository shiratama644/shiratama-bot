import {
  ChannelType,
  type Client,
  type Guild
} from 'discord.js';
import type { Hono } from 'hono';
import { AppError } from '../../shared/errors/index.js';
import { getSessionGuild, requireSession } from '../../features/auth/index.js';
import { requireParam, respondError } from '../utils/response.js';

function toUserSummary(user: {
  id: string;
  username: string;
  globalName: string | null;
  displayAvatarURL: (options?: { size?: number; extension?: 'png' | 'webp' | 'jpg' }) => string;
}): {
  id: string;
  name: string;
  avatarUrl: string;
} {
  return {
    id: user.id,
    name: user.globalName ?? user.username,
    avatarUrl: user.displayAvatarURL({ size: 64, extension: 'png' })
  };
}

async function getGuildMembers(guild: Guild): Promise<Array<{ id: string; name: string; avatarUrl: string }>> {
  try {
    const members = await guild.members.fetch();
    return members
      .map((member) => toUserSummary(member.user))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) {
      return [];
    }
    return [toUserSummary(owner.user)];
  }
}

export function registerGuildRoutes(app: Hono, client: Client): void {
  app.get('/api/guilds', (c) => {
    try {
      const session = requireSession(c);
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
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = requireSession(c);
      getSessionGuild(session, guildId);
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        throw new AppError('Guild not found.', 404);
      }

      const roleCollection = await guild.roles.fetch();
      const roles = roleCollection
        .map((role) => ({ id: role.id, name: role.name }))
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => a.name.localeCompare(b.name));

      const channelCollection = await guild.channels.fetch();
      const channels = channelCollection
        .toJSON()
        .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
        .filter((channel) => channel.type === ChannelType.GuildText)
        .map((channel) => ({ id: channel.id, name: channel.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const members = await getGuildMembers(guild);

      return c.json({
        guild: {
          id: guild.id,
          name: guild.name,
          iconUrl: guild.iconURL({ size: 64, extension: 'png' })
        },
        roles,
        channels,
        members
      });
    } catch (error) {
      return respondError(c, error);
    }
  });
}
