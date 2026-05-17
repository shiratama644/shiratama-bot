export type GuildSummary = { id: string; name: string; iconUrl: string | null };
export type RoleSummary = { id: string; name: string };
export type ChannelSummary = { id: string; name: string };

export type AuthGuild = GuildSummary & {
  canUseDashboard: boolean;
  canCreateGiveaway: boolean;
  isOwner: boolean;
};

export type AuthSession = {
  user: { id: string; name: string; avatarUrl: string };
  guilds: AuthGuild[];
};

export type GuildOptions = {
  guild: GuildSummary;
  roles: RoleSummary[];
  channels: ChannelSummary[];
};

export type GuildSettings = {
  guildId: string;
  giveawayCreatorRoleIds: string[];
  dashboardUsableRoleIds: string[];
  language: string;
  giveawayChannelIds: string[];
  defaultClaimDeadline: string | null;
};

export type Giveaway = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string | null;
  endAt: string;
  winnerCount: number;
  status: 'active' | 'ended' | 'stopped';
  createdBy: string;
  createdAt: string;
  interval: string | null;
  autoRepeat: boolean;
  claimDeadline: string | null;
  winners: string[];
};

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const CSRF_COOKIE_NAME = 'applejp_csrf_token';

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === CSRF_COOKIE_NAME && value) {
      return value;
    }
  }
  return null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'API request failed');
  }
  return data as T;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrfToken = method === 'GET' ? null : getCsrfTokenFromCookie();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(init?.headers ?? {})
    }
  });
  return parseResponse<T>(response);
}

export function getLoginUrl() {
  return `${baseUrl}/api/auth/login`;
}

export async function fetchAuthSession() {
  return apiFetch<AuthSession>('/api/auth/session');
}

export async function logout() {
  return apiFetch<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST'
  });
}

export async function fetchGuilds() {
  const payload = await apiFetch<{ guilds: GuildSummary[] }>('/api/guilds');
  return payload.guilds;
}

export async function fetchGuildOptions(guildId: string) {
  return apiFetch<GuildOptions>(`/api/guilds/${guildId}/options`);
}

export async function fetchSettings(guildId: string) {
  const payload = await apiFetch<{ settings: GuildSettings }>(`/api/settings/${guildId}`);
  return payload.settings;
}

export async function updateSettings(
  guildId: string,
  input: {
    language: 'en' | 'ja';
    giveawayCreatorRoleIds: string[];
    dashboardUsableRoleIds: string[];
    giveawayChannelIds: string[];
    defaultClaimDeadline: string | null;
  }
) {
  return apiFetch<{ ok: boolean }>(`/api/settings/${guildId}`, {
    method: 'PUT',
    body: JSON.stringify(input)
  });
}

export async function fetchGiveaways(guildId: string) {
  const payload = await apiFetch<{ giveaways: Giveaway[] }>(`/api/giveaways/${guildId}`);
  return payload.giveaways;
}

export async function createGiveaway(input: {
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  deadline: string;
  winnerCount: number;
  autoRepeat: boolean;
  idempotencyKey?: string;
}) {
  return apiFetch<{ giveaway: Giveaway }>('/api/giveaways', {
    method: 'POST',
    headers: input.idempotencyKey
      ? {
          'Idempotency-Key': input.idempotencyKey
        }
      : {},
    body: JSON.stringify(input)
  });
}

export async function endGiveaway(giveawayId: string, guildId: string) {
  return apiFetch<{ ok: boolean }>(`/api/giveaways/${giveawayId}/end`, {
    method: 'POST',
    body: JSON.stringify({ guildId })
  });
}

export async function rerollGiveaway(giveawayId: string, guildId: string) {
  return apiFetch<{ winners: string[] }>(`/api/giveaways/${giveawayId}/reroll`, {
    method: 'POST',
    body: JSON.stringify({ guildId })
  });
}
