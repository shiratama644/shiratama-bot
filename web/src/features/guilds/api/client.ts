import type { GuildOptions, GuildSummary } from '@/features/guilds/types';
import { apiFetch } from '@/lib/api/client';

export async function fetchGuilds() {
  const payload = await apiFetch<{ guilds: GuildSummary[] }>('/api/guilds');
  return payload.guilds;
}

export async function fetchGuildOptions(guildId: string) {
  return apiFetch<GuildOptions>(`/api/guilds/${guildId}/options`);
}
