import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  ChannelType,
  PermissionsBitField,
  type Client,
  type Guild
} from 'discord.js';
import {
  getGiveaway,
  getGuildGiveaways,
  getGuildSettings,
  setGuildSettings
} from './db/index.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from './giveaway/index.js';
import { AppError, getErrorMessage, getErrorStatusCode } from './errors.js';

const DASHBOARD_COOKIE = 'applejp_dashboard_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;

type AuthGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
  canUseDashboard: boolean;
  canCreateGiveaway: boolean;
  isOwner: boolean;
};

type AuthSession = {
  token: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  guilds: AuthGuild[];
  expiresAt: number;
};

const sessionStore = new Map<string, AuthSession>();
const oauthStateStore = new Map<string, number>();

const createSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline: z.string().min(1),
  winnerCount: z.number().int().min(1),
  autoRepeat: z.boolean().optional()
});

const guildBodySchema = z.object({ guildId: z.string().min(1) });

const settingsSchema = z.object({
  language: z.enum(['en', 'ja']).optional(),
  giveawayCreatorRoleIds: z.array(z.string().min(1)).optional(),
  dashboardUsableRoleIds: z.array(z.string().min(1)).optional(),
  dashboardViewRoleIds: z.array(z.string().min(1)).optional(),
  giveawayChannelIds: z.array(z.string().min(1)).optional(),
  defaultClaimDeadline: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable().optional())
});

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

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessionStore.entries()) {
    if (session.expiresAt <= now) {
      sessionStore.delete(token);
    }
  }
  for (const [state, expiresAt] of oauthStateStore.entries()) {
    if (expiresAt <= now) {
      oauthStateStore.delete(state);
    }
  }
}

function buildRedirectUri(): string {
  const explicit = process.env.DISCORD_OAUTH_REDIRECT_URI;
  if (explicit) {
    return explicit;
  }
  const appBase = process.env.APP_BASE_URL;
  if (!appBase) {
    throw new AppError('DISCORD_OAUTH_REDIRECT_URI or APP_BASE_URL is required.', 500);
  }
  return `${appBase.replace(/\/$/, '')}/api/auth/callback`;
}

function buildDiscordAvatarUrl(user: { id: string; avatar: string | null }): string {
  if (!user.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function toCookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DASHBOARD_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DASHBOARD_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const chunk of cookieHeader.split(';')) {
    const [name, value] = chunk.trim().split('=');
    if (name === DASHBOARD_COOKIE && value) {
      return value;
    }
  }
  return null;
}

function requireSession(c: { req: { header: (key: string) => string | undefined } }): AuthSession {
  cleanupExpiredSessions();
  const token = parseCookieToken(c.req.header('cookie'));
  if (!token) {
    throw new AppError('Authentication required.', 401);
  }
  const session = sessionStore.get(token);
  if (!session) {
    throw new AppError('Authentication required.', 401);
  }
  if (session.expiresAt <= Date.now()) {
    sessionStore.delete(token);
    throw new AppError('Session expired.', 401);
  }
  return session;
}

function getSessionGuild(session: AuthSession, guildId: string): AuthGuild {
  const guild = session.guilds.find((item) => item.id === guildId);
  if (!guild || !guild.canUseDashboard) {
    throw new AppError('You do not have permission to access this server dashboard.', 403);
  }
  return guild;
}

async function createSessionFromOAuth(client: Client, accessToken: string): Promise<AuthSession> {
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) {
    throw new AppError('Failed to fetch Discord user profile.', 401);
  }
  const user = await userResponse.json() as { id: string; username: string; global_name: string | null; avatar: string | null };

  const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!guildsResponse.ok) {
    throw new AppError('Failed to fetch Discord guild list.', 401);
  }
  const oauthGuilds = await guildsResponse.json() as Array<{ id: string; name: string; icon: string | null; permissions: string; owner: boolean }>;

  const guilds: AuthGuild[] = [];
  for (const oauthGuild of oauthGuilds) {
    const guild = await client.guilds.fetch(oauthGuild.id).catch(() => null);
    if (!guild) {
      continue;
    }
    const settings = await getGuildSettings(guild.id);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      continue;
    }
    const permissionBits = BigInt(oauthGuild.permissions);
    const hasDashboardRole = settings.dashboardUsableRoleIds.some((roleId) => member.roles.cache.has(roleId));
    const hasCreatorRole =
      settings.giveawayCreatorRoleIds.length === 0 ||
      settings.giveawayCreatorRoleIds.some((roleId) => member.roles.cache.has(roleId));

    guilds.push({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 64, extension: 'png' }),
      canUseDashboard: oauthGuild.owner || hasDashboardRole,
      canCreateGiveaway:
        oauthGuild.owner ||
        (permissionBits & PermissionsBitField.Flags.Administrator) !== 0n ||
        hasCreatorRole,
      isOwner: oauthGuild.owner
    });
  }

  return {
    token: randomBytes(32).toString('hex'),
    user: {
      id: user.id,
      name: user.global_name ?? user.username,
      avatarUrl: buildDiscordAvatarUrl({ id: user.id, avatar: user.avatar })
    },
    guilds: guilds.sort((a, b) => a.name.localeCompare(b.name)),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
}

export function createApiApp(client: Client) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = c.req.header('origin');

    if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) {
      return c.json({ error: 'Origin not allowed.' }, 403);
    }

    if (c.req.method === 'OPTIONS') {
      if (allowedOrigin && requestOrigin === allowedOrigin) {
        c.header('Access-Control-Allow-Origin', allowedOrigin);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Headers', 'Content-Type');
        c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      }
      return c.body(null, 200);
    }

    await next();

    if (allowedOrigin && requestOrigin === allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', 'Content-Type');
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    }
  });

  app.get('/api/auth/login', (c) => {
    try {
      cleanupExpiredSessions();
      const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
      const redirectUri = buildRedirectUri();
      if (!clientId) {
        throw new AppError('DISCORD_OAUTH_CLIENT_ID is required.', 500);
      }
      const state = randomBytes(16).toString('hex');
      oauthStateStore.set(state, Date.now() + OAUTH_STATE_TTL_MS);
      const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', clientId);
      authorizeUrl.searchParams.set('scope', 'identify guilds');
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('prompt', 'consent');
      authorizeUrl.searchParams.set('state', state);
      return c.redirect(authorizeUrl.toString(), 302);
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/auth/callback', async (c) => {
    try {
      cleanupExpiredSessions();
      const code = c.req.query('code');
      const state = c.req.query('state');
      const webBaseUrl = (process.env.WEB_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
      if (!code || !state) {
        throw new AppError('Invalid OAuth callback parameters.', 400);
      }
      const expiresAt = oauthStateStore.get(state);
      oauthStateStore.delete(state);
      if (!expiresAt || expiresAt <= Date.now()) {
        throw new AppError('OAuth state is invalid or expired.', 400);
      }

      const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
      const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new AppError('Discord OAuth client credentials are missing.', 500);
      }

      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: buildRedirectUri()
        })
      });

      if (!tokenResponse.ok) {
        throw new AppError('Failed to exchange OAuth code.', 401);
      }

      const tokenPayload = await tokenResponse.json() as { access_token: string };
      const session = await createSessionFromOAuth(client, tokenPayload.access_token);
      sessionStore.set(session.token, session);
      c.header('Set-Cookie', toCookieHeader(session.token, Math.floor(SESSION_TTL_MS / 1000)));
      return c.redirect(webBaseUrl || '/', 302);
    } catch (error) {
      const webBaseUrl = (process.env.WEB_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
      if (webBaseUrl) {
        return c.redirect(`${webBaseUrl}/?authError=${encodeURIComponent(getErrorMessage(error))}`, 302);
      }
      return respondError(c, error);
    }
  });

  app.post('/api/auth/logout', (c) => {
    try {
      const token = parseCookieToken(c.req.header('cookie'));
      if (token) {
        sessionStore.delete(token);
      }
      c.header('Set-Cookie', clearCookieHeader());
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/auth/session', (c) => {
    try {
      const session = requireSession(c);
      return c.json({
        user: session.user,
        guilds: session.guilds
      });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/guilds', async (c) => {
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

  app.get('/api/settings/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = requireSession(c);
      getSessionGuild(session, guildId);
      const settings = await getGuildSettings(guildId);
      return c.json({ settings });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.put('/api/settings/:guildId', zValidator('json', settingsSchema), async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = requireSession(c);
      const guild = getSessionGuild(session, guildId);
      if (!guild.isOwner) {
        throw new AppError('Only server owners can update settings.', 403);
      }
      const body = c.req.valid('json');
      const current = await getGuildSettings(guildId);
      const dashboardUsableRoleIds = body.dashboardUsableRoleIds ?? body.dashboardViewRoleIds;

      await setGuildSettings(guildId, {
        language: body.language ?? current.language,
        giveawayCreatorRoleIds: body.giveawayCreatorRoleIds ?? current.giveawayCreatorRoleIds,
        dashboardUsableRoleIds: dashboardUsableRoleIds ?? current.dashboardUsableRoleIds,
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

  app.get('/api/giveaways/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = requireSession(c);
      getSessionGuild(session, guildId);
      const giveaways = await getGuildGiveaways(guildId);
      return c.json({ giveaways });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways', zValidator('json', createSchema), async (c) => {
    try {
      const session = requireSession(c);
      const body = c.req.valid('json');
      const guild = getSessionGuild(session, body.guildId);
      if (!guild.canCreateGiveaway) {
        throw new AppError('You do not have permission to create giveaways.', 403);
      }

      const settings = await getGuildSettings(body.guildId);
      if (!settings.giveawayChannelIds.includes(body.channelId)) {
        throw new AppError('This channel is not allowed for giveaway creation.', 403);
      }

      const created = await createGiveawayPost({
        client,
        guildId: body.guildId,
        channelId: body.channelId,
        title: body.title,
        description: body.description,
        deadlineInput: body.deadline,
        winnerCount: body.winnerCount,
        createdBy: session.user.id,
        interval: body.autoRepeat ? body.deadline : undefined,
        claimDeadline: settings.defaultClaimDeadline
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
      getSessionGuild(session, guildId);
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
      getSessionGuild(session, guildId);
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
