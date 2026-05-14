import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  ChannelType,
  type Client,
  type Guild
} from 'discord.js';
import {
  getGiveaway,
  getActiveGiveaways,
  getManagerRoleIds,
  getGuildSettings,
  setGuildSettings,
  setManagerRoleIds
} from './db/index.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from './giveaway/index.js';
import { AppError, getErrorMessage, getErrorStatusCode } from './errors.js';

const rolesSchema = z.object({
  roleIds: z.array(z.string().min(1))
});

const createSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline: z.string().min(1),
  winnerCount: z.number().int().min(1)
});

const guildBodySchema = z.object({ guildId: z.string().min(1) });

const settingsSchema = z.object({
  language: z.enum(['en', 'ja']).optional(),
  managerRoleIds: z.array(z.string().min(1)).optional(),
  giveawayChannelIds: z.array(z.string().min(1)).optional(),
  defaultClaimDeadline: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable().optional())
});

function requireAdminToken(adminToken: string | undefined, receivedToken: string | undefined): void {
  if (!adminToken) {
    throw new AppError('ADMIN_API_TOKEN is not set.', 500);
  }
  if (receivedToken !== adminToken) {
    throw new AppError('Invalid admin token.', 401);
  }
}

function requireParam(value: string | undefined, key: string): string {
  if (!value) {
    throw new AppError(`Invalid route parameter: ${key}`, 400);
  }
  return value;
}

type ApiErrorStatus = 400 | 401 | 403 | 404 | 500;

function respondError(c: { json: (body: { error: string }, status: ApiErrorStatus) => Response }, error: unknown) {
  return c.json({ error: getErrorMessage(error) }, getErrorStatusCode(error) as ApiErrorStatus);
}

function toUserSummary(user: { id: string; username: string; globalName: string | null; displayAvatarURL: (options?: { size?: number; extension?: 'png' | 'webp' | 'jpg' }) => string }): {
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

export function createApiApp(client: Client) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = c.req.header('origin');
    const adminToken = process.env.ADMIN_API_TOKEN;
    const requestAdminToken = c.req.header('x-admin-token');

    if (allowedOrigin) {
      if (!requestOrigin) {
        if (!adminToken || requestAdminToken !== adminToken) {
          return c.json({ error: 'Origin header is required.' }, 403);
        }
      } else if (requestOrigin !== allowedOrigin) {
        return c.json({ error: 'Origin not allowed.' }, 403);
      }

      if (c.req.method === 'OPTIONS') {
        c.header('Access-Control-Allow-Origin', allowedOrigin);
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-user-id');
        c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
        return c.body(null, 200);
      }
    }

    await next();

    if (allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-user-id');
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    }
  });

  app.get('/api/guilds', async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const guildCollection = await client.guilds.fetch();
      const guilds = guildCollection
        .map((guild) => ({
          id: guild.id,
          name: guild.name,
          iconUrl: guild.iconURL({ size: 64, extension: 'png' })
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return c.json({ guilds });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/roles/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const roleIds = await getManagerRoleIds(guildId);
      return c.json({ roleIds });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.put('/api/roles/:guildId', zValidator('json', rolesSchema), async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const body = c.req.valid('json');
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      await setManagerRoleIds(guildId, body.roleIds);
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/settings/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const settings = await getGuildSettings(guildId);
      return c.json({ settings });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.put('/api/settings/:guildId', zValidator('json', settingsSchema), async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const body = c.req.valid('json');
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const current = await getGuildSettings(guildId);

      await setGuildSettings(guildId, {
        language: body.language ?? current.language,
        managerRoleIds: body.managerRoleIds ?? current.managerRoleIds,
        giveawayChannelIds: body.giveawayChannelIds ?? current.giveawayChannelIds,
        defaultClaimDeadline:
          body.defaultClaimDeadline !== undefined ? body.defaultClaimDeadline : current.defaultClaimDeadline
      });
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/guilds/:guildId/options', async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
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

  app.get('/api/giveaways/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const giveaways = await getActiveGiveaways(guildId);
      return c.json({ giveaways });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways', zValidator('json', createSchema), async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const body = c.req.valid('json');
      const userId = c.req.header('x-user-id');
      if (!userId) {
        throw new AppError('x-user-id header is required.', 400);
      }

      const managerRoleIds = await getManagerRoleIds(body.guildId);
      if (managerRoleIds.length > 0) {
        const guild = await client.guilds.fetch(body.guildId).catch(() => null);
        if (!guild) {
          throw new AppError('Guild not found.', 404);
        }
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          throw new AppError('User is not a member of this guild.', 403);
        }
        const hasManagerRole = managerRoleIds.some((id) => member.roles.cache.has(id));
        if (!hasManagerRole) {
          throw new AppError('You do not have permission to create giveaways.', 403);
        }
      }

      const created = await createGiveawayPost({
        client,
        guildId: body.guildId,
        channelId: body.channelId,
        title: body.title,
        description: body.description,
        deadlineInput: body.deadline,
        winnerCount: body.winnerCount,
        createdBy: userId,
        interval: undefined
      });
      return c.json({ giveaway: created });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways/:id/end', zValidator('json', guildBodySchema), async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const guildId = c.req.valid('json').guildId;
      const id = requireParam(c.req.param('id'), 'id');
      const giveaway = await getGiveaway(id);
      if (!giveaway) {
        throw new AppError('Giveaway not found.', 404);
      }
      if (giveaway.guildId !== guildId) {
        throw new AppError('You cannot manage giveaways from other servers.', 403);
      }
      await endGiveaway(client, id);
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways/:id/reroll', zValidator('json', guildBodySchema), async (c) => {
    try {
      requireAdminToken(process.env.ADMIN_API_TOKEN, c.req.header('x-admin-token'));
      const guildId = c.req.valid('json').guildId;
      const id = requireParam(c.req.param('id'), 'id');
      const giveaway = await getGiveaway(id);
      if (!giveaway) {
        throw new AppError('Giveaway not found.', 404);
      }
      if (giveaway.guildId !== guildId) {
        throw new AppError('You cannot manage giveaways from other servers.', 403);
      }
      const winners = await rerollGiveaway(client, id);
      return c.json({ winners });
    } catch (error) {
      return respondError(c, error);
    }
  });

  return app;
}

export type ApiApp = ReturnType<typeof createApiApp>;
