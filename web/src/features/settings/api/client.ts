import type { GuildSettings } from '@/features/settings/types';
import { apiFetch } from '@/lib/api/client';

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
