import crypto from 'crypto';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  ChannelType,
  PermissionsBitField,
  type Client,
  type Guild,
  type GuildMember
} from 'discord.js';
import {
  getGiveaway,
  getActiveGiveaways,
  getGuildSettings,
  setGuildSettings
} from './db/index.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from './giveaway/index.js';
import { AppError, getErrorMessage, getErrorStatusCode } from './errors.js';
import { createSessionToken, getDiscordAvatarUrl, verifySessionToken, type UserSession } from './auth.js';

const createSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  winnerCount: z.number().int().min(1),
  autoRepeat: z.boolean().optional(),
  deadline: z.string().optional(),
  interval: z.string().optional()
});

const guildBodySchema = z.object({ guildId: z.string().min(1) });

const settingsSchema = z.object({
  language: z.enum(['en', 'ja']).optional(),
  managerRoleIds: z.array(z.string().min(1)).optional(),
  dashboardRoleIds: z.array(z.string().min(1)).optional(),
  giveawayChannelIds: z.array(z.string().min(1)).optional(),
  defaultClaimDeadline: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable().optional())
});

type ApiErrorStatus = 400 | 401 | 403 | 404 | 500;

type ApiContext = {
  req: { header: (name: string) => string | undefined };
  json: (body: unknown, status?: number) => Response;
};

function respondError(c: { json: (body: { error: string }, status: ApiErrorStatus) => Response }, error: unknown) {
  return c.json({ error: getErrorMessage(error) }, getErrorStatusCode(error) as ApiErrorStatus);
}

function requireParam(value: string | undefined, key: string): string {
  if (!value) {
    throw new AppError(`Invalid route parameter: ${key}`, 400);
  }
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(`${name} is not set.`, 500);
  }
  return value;
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.ADMIN_API_TOKEN ?? '';
}

function requireSession(c: ApiContext): UserSession {
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new AppError('Authorization token is required.', 401);
  }
  const secret = getSessionSecret();
  if (!secret) {
    throw new AppError('SESSION_SECRET is not set.', 500);
  }
  const user = verifySessionToken(token, secret);
  if (!user) {
    throw new AppError('Invalid or expired session.', 401);
  }
  return user;
}

function hashState(raw: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(raw).digest('base64url');
}

function encodeOauthState(redirectTo: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      redirectTo,
      ts: Date.now()
    })
  ).toString('base64url');
  const sig = hashState(payload, secret);
  return `${payload}.${sig}`;
}

function decodeOauthState(state: string, secret: string): { redirectTo: string; ts: number } {
  const parts = state.split('.');
  if (parts.length !== 2) {
    throw new AppError('Invalid OAuth state.', 400);
  }
  const [payload, sig] = parts;
  const expectedSig = hashState(payload, secret);
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new AppError('Invalid OAuth state signature.', 400);
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    redirectTo: string;
    ts: number;
  };
  if (!decoded.redirectTo || typeof decoded.redirectTo !== 'string') {
    throw new AppError('Invalid OAuth state payload.', 400);
  }
  if (Date.now() - decoded.ts > 10 * 60 * 1000) {
    throw new AppError('OAuth state has expired.', 400);
  }
  return decoded;
}

function toUserSummary(user: {
  id: string;
  username: string;
  globalName: string | null;
  displayAvatarURL: (options?: { size?: number; extension?: 'png' | 'webp' | 'jpg' }) => string;
}): { id: string; name: string; avatarUrl: string } {
  return {
    id: user.id,
    name: user.globalName ?? user.username,
    avatarUrl: user.displayAvatarURL({ size: 64, extension: 'png' })
  };
}

async function getGuildMembers(guild: Guild): Promise<Array<{ id: string; name: string; avatarUrl: string }>> {
  try {
    const members = await guild.members.fetch();
    return members.map((member) => toUserSummary(member.user)).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) {
      return [];
    }
    return [toUserSummary(owner.user)];
  }
}

function isGuildAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function hasAnyRequiredRole(member: GuildMember, requiredRoleIds: readonly string[]): boolean {
  return requiredRoleIds.some((id) => member.roles.cache.has(id));
}

async function fetchGuildAndMember(client: Client, guildId: string, userId: string) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new AppError('Guild not found.', 404);
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new AppError('User is not a member of this guild.', 403);
  }
  return { guild, member };
}

async function assertCanViewDashboard(client: Client, guildId: string, userId: string): Promise<void> {
  const { member } = await fetchGuildAndMember(client, guildId, userId);
  if (isGuildAdmin(member)) {
    return;
  }
  const settings = await getGuildSettings(guildId);
  if (settings.dashboardRoleIds.length === 0 || !hasAnyRequiredRole(member, settings.dashboardRoleIds)) {
    throw new AppError('You do not have permission to view this dashboard.', 403);
  }
}

async function assertGuildAdmin(client: Client, guildId: string, userId: string): Promise<void> {
  const { member } = await fetchGuildAndMember(client, guildId, userId);
  if (!isGuildAdmin(member)) {
    throw new AppError('Administrator permission is required.', 403);
  }
}

async function assertCanManageGiveaways(client: Client, guildId: string, userId: string): Promise<void> {
  const { member } = await fetchGuildAndMember(client, guildId, userId);
  if (isGuildAdmin(member)) {
    return;
  }
  const settings = await getGuildSettings(guildId);
  if (settings.managerRoleIds.length === 0) {
    return;
  }
  if (!hasAnyRequiredRole(member, settings.managerRoleIds)) {
    throw new AppError('You do not have permission to create giveaways.', 403);
  }
}

async function exchangeDiscordToken(code: string): Promise<string> {
  const clientId = requireEnv('DISCORD_APP_ID');
  const clientSecret = requireEnv('DISCORD_CLIENT_SECRET');
  const redirectUri = requireEnv('DISCORD_OAUTH_REDIRECT_URI');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw new AppError('Failed to exchange Discord OAuth code.', 401);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new AppError('Discord OAuth token is missing.', 401);
  }

  return payload.access_token;
}

async function fetchDiscordUser(accessToken: string): Promise<{ id: string; username: string; avatar: string | null }> {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new AppError('Failed to fetch Discord user.', 401);
  }
  const payload = (await response.json()) as {
    id: string;
    username: string;
    avatar: string | null;
  };
  return payload;
}

export function createApiApp(client: Client) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = c.req.header('origin');

    if (allowedOrigin) {
      if (requestOrigin && requestOrigin !== allowedOrigin) {
        return c.json({ error: 'Origin not allowed.' }, 403);
      }

      if (c.req.method === 'OPTIONS') {
        c.header('Access-Control-Allow-Origin', allowedOrigin);
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
        return c.body(null, 200);
      }
    }

    await next();

    if (allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    }
  });

  app.get('/api/auth/login', async (c) => {
    try {
      const sessionSecret = getSessionSecret();
      if (!sessionSecret) {
        throw new AppError('SESSION_SECRET is not set.', 500);
      }
      const clientId = requireEnv('DISCORD_APP_ID');
      const redirectUri = requireEnv('DISCORD_OAUTH_REDIRECT_URI');
      const frontendRedirect =
        c.req.query('redirectTo') ?? process.env.WEB_LOGIN_REDIRECT_URI ?? 'http://localhost:5173/';
      const state = encodeOauthState(frontendRedirect, sessionSecret);
      const url = new URL('https://discord.com/oauth2/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'identify');
      url.searchParams.set('state', state);
      return c.redirect(url.toString(), 302);
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/auth/callback', async (c) => {
    try {
      const sessionSecret = getSessionSecret();
      if (!sessionSecret) {
        throw new AppError('SESSION_SECRET is not set.', 500);
      }
      const code = c.req.query('code');
      const state = c.req.query('state');
      if (!code || !state) {
        throw new AppError('Invalid OAuth callback.', 400);
      }
      const decoded = decodeOauthState(state, sessionSecret);
      const accessToken = await exchangeDiscordToken(code);
      const user = await fetchDiscordUser(accessToken);
      const token = createSessionToken(
        {
          userId: user.id,
          username: user.username,
          avatar: user.avatar
        },
        sessionSecret
      );

      const redirectUrl = new URL(decoded.redirectTo);
      redirectUrl.searchParams.set('token', token);
      return c.redirect(redirectUrl.toString(), 302);
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/auth/me', async (c) => {
    try {
      const session = requireSession(c);
      return c.json({
        user: {
          id: session.userId,
          name: session.username,
          avatarUrl: getDiscordAvatarUrl(session.userId, session.avatar)
        }
      });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/auth/logout', async (c) => {
    return c.json({ ok: true });
  });

  app.get('/api/guilds', async (c) => {
    try {
      const session = requireSession(c);
      const guildCollection = await client.guilds.fetch();
      const guilds = (
        await Promise.all(
          guildCollection.map(async (guildRef) => {
            const guild = await client.guilds.fetch(guildRef.id).catch(() => null);
            if (!guild) {
              return null;
            }
            const member = await guild.members.fetch(session.userId).catch(() => null);
            if (!member) {
              return null;
            }
            if (isGuildAdmin(member)) {
              return {
                id: guild.id,
                name: guild.name,
                iconUrl: guild.iconURL({ size: 64, extension: 'png' })
              };
            }
            const settings = await getGuildSettings(guild.id);
            const canView = settings.dashboardRoleIds.length > 0 && hasAnyRequiredRole(member, settings.dashboardRoleIds);
            if (!canView) {
              return null;
            }
            return {
              id: guild.id,
              name: guild.name,
              iconUrl: guild.iconURL({ size: 64, extension: 'png' })
            };
          })
        )
      )
        .filter((guild): guild is NonNullable<typeof guild> => guild !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      return c.json({ guilds });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/settings/:guildId', async (c) => {
    try {
      const session = requireSession(c);
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      await assertCanViewDashboard(client, guildId, session.userId);
      const settings = await getGuildSettings(guildId);
      return c.json({ settings });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.put('/api/settings/:guildId', zValidator('json', settingsSchema), async (c) => {
    try {
      const session = requireSession(c);
      const body = c.req.valid('json');
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      await assertGuildAdmin(client, guildId, session.userId);
      const current = await getGuildSettings(guildId);

      await setGuildSettings(guildId, {
        language: body.language ?? current.language,
        managerRoleIds: body.managerRoleIds ?? current.managerRoleIds,
        dashboardRoleIds: body.dashboardRoleIds ?? current.dashboardRoleIds,
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
      const session = requireSession(c);
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      await assertCanViewDashboard(client, guildId, session.userId);
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
      const session = requireSession(c);
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      await assertCanViewDashboard(client, guildId, session.userId);
      const giveaways = await getActiveGiveaways(guildId);
      return c.json({ giveaways });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways', zValidator('json', createSchema), async (c) => {
    try {
      const session = requireSession(c);
      const body = c.req.valid('json');
      await assertCanManageGiveaways(client, body.guildId, session.userId);

      const settings = await getGuildSettings(body.guildId);
      if (!settings.giveawayChannelIds.includes(body.channelId)) {
        throw new AppError('Channel is not allowed for giveaway creation.', 403);
      }

      const autoRepeat = !!body.autoRepeat;
      const interval = body.interval?.trim();
      const deadline = body.deadline?.trim();
      const deadlineInput = autoRepeat ? interval : deadline;
      if (!deadlineInput) {
        throw new AppError(autoRepeat ? 'interval is required.' : 'deadline is required.', 400);
      }

      const created = await createGiveawayPost({
        client,
        guildId: body.guildId,
        channelId: body.channelId,
        title: body.title,
        description: body.description,
        deadlineInput,
        winnerCount: body.winnerCount,
        createdBy: session.userId,
        interval: autoRepeat ? interval : undefined
      });
      return c.json({ giveaway: created });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways/:id/end', zValidator('json', guildBodySchema), async (c) => {
    try {
      const session = requireSession(c);
      const guildId = c.req.valid('json').guildId;
      await assertCanManageGiveaways(client, guildId, session.userId);
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
      const session = requireSession(c);
      const guildId = c.req.valid('json').guildId;
      await assertCanManageGiveaways(client, guildId, session.userId);
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
