import { randomBytes } from 'node:crypto';
import type { Client } from 'discord.js';
import { getGuildSettings } from '../db/index.js';
import { AppError } from '../shared/errors/index.js';
import type { AuthGuild, AuthSession } from './shared.js';
import { SESSION_TTL_MS } from './session.js';

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
    const hasDashboardRole = settings.dashboardUsableRoleIds.some((roleId) => member.roles.cache.has(roleId));
    const hasCreatorRole =
      settings.giveawayCreatorRoleIds.length === 0 ||
      settings.giveawayCreatorRoleIds.some((roleId) => member.roles.cache.has(roleId));

    guilds.push({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 64, extension: 'png' }),
      canUseDashboard: oauthGuild.owner || hasDashboardRole,
      canCreateGiveaway: oauthGuild.owner || hasCreatorRole,
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
