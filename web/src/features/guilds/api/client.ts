import type { GuildOptions, GuildSummary } from '@/features/guilds/types';
import { apiFetch } from '@/lib/api/client';

export async function fetchGuilds() {
  const payload = await apiFetch<{ guilds: GuildSummary[] }>('/api/guilds');
  return payload.guilds;
}

export async function fetchGuildOptions(guildId: string, forceRefresh = false) {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set('refresh', '1');
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<GuildOptions>(`/api/guilds/${guildId}/options${query}`);
}
