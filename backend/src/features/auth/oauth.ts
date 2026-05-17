import { randomBytes } from 'node:crypto';
import type { Client } from 'discord.js';
import { getGuildSettings } from '../../db/index.js';
import { AppError } from '../../shared/errors/index.js';
import { SESSION_TTL_MS } from './constants.js';
import type { AuthGuild, AuthSession } from './types.js';

const OAUTH_GUILD_CONCURRENCY = 5;

function buildDiscordAvatarUrl(user: { id: string; avatar: string | null }): string {
  if (!user.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

export function buildRedirectUri(): string {
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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const normalizedConcurrency = Math.max(1, concurrency);
  const results: R[] = [];
  for (let start = 0; start < items.length; start += normalizedConcurrency) {
    const batch = items.slice(start, start + normalizedConcurrency);
    const batchResults = await Promise.all(batch.map((item, offset) => mapper(item, start + offset)));
    results.push(...batchResults);
  }
  return results;
}

export async function createSessionFromOAuth(client: Client, accessToken: string): Promise<AuthSession> {
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userResponse.ok) {
    throw new AppError('Failed to fetch Discord user profile.', 401);
  }
  const user = await userResponse.json() as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!guildsResponse.ok) {
    throw new AppError('Failed to fetch Discord guild list.', 401);
  }
  const oauthGuilds = await guildsResponse.json() as Array<{
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
    owner: boolean;
  }>;

  const guildResults = await mapWithConcurrency(oauthGuilds, OAUTH_GUILD_CONCURRENCY, async (oauthGuild) => {
    const guild = await client.guilds.fetch(oauthGuild.id).catch(() => null);
    if (!guild) {
      return null;
    }
    const settings = await getGuildSettings(guild.id);
    const requiresMemberFetch =
      settings.dashboardUsableRoleIds.length > 0 || settings.giveawayCreatorRoleIds.length > 0;
    const member = requiresMemberFetch ? await guild.members.fetch(user.id).catch(() => null) : null;
    if (requiresMemberFetch && !member) {
      return null;
    }
    const permissionBits = BigInt(oauthGuild.permissions);
    const hasAdministratorPermission = (permissionBits & 0x8n) === 0x8n;
    const hasDashboardRole = member
      ? settings.dashboardUsableRoleIds.some((roleId) => member.roles.cache.has(roleId))
      : false;
    let hasCreatorRole = false;
    if (settings.giveawayCreatorRoleIds.length === 0) {
      hasCreatorRole = oauthGuild.owner || hasAdministratorPermission;
    } else if (member) {
      hasCreatorRole = settings.giveawayCreatorRoleIds.some((roleId) => member.roles.cache.has(roleId));
    }

    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 64, extension: 'png' }),
      canUseDashboard: oauthGuild.owner || hasDashboardRole,
      canCreateGiveaway: oauthGuild.owner || hasCreatorRole,
      isOwner: oauthGuild.owner
    } satisfies AuthGuild;
  });
  const guilds: AuthGuild[] = guildResults.filter((guild): guild is AuthGuild => guild !== null);

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
