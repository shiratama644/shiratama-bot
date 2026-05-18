import type { Giveaway, GiveawayUserSummary } from '@/features/giveaways/types';
import { apiFetch } from '@/lib/api/client';

export async function fetchGiveaways(guildId: string) {
  const payload = await apiFetch<{ giveaways: Giveaway[] }>(`/api/giveaways/${guildId}`);
  return payload.giveaways;
}

export async function fetchGiveawayUsers(guildId: string, userIds: string[]) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) {
    return [] as GiveawayUserSummary[];
  }

  const payload = await apiFetch<{ users: GiveawayUserSummary[] }>(
    `/api/giveaways/${guildId}/users?ids=${encodeURIComponent(ids.join(','))}`
  );
  return payload.users;
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
