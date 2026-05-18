import { z } from 'zod';
import {
  guildSettingsSchema,
  guildSettingsUpdateInputSchema,
  type GuildSettingsUpdateInput
} from '@/features/settings/types';
import { apiFetch } from '@/lib/api/client';

export async function fetchSettings(guildId: string) {
  const payload = await apiFetch<unknown>(`/api/settings/${guildId}`);
  return z.object({ settings: guildSettingsSchema }).parse(payload).settings;
}

export async function updateSettings(guildId: string, input: GuildSettingsUpdateInput) {
  const validatedInput = guildSettingsUpdateInputSchema.parse(input);
  return apiFetch<{ ok: boolean }>(`/api/settings/${guildId}`, {
    method: 'PUT',
    body: JSON.stringify(validatedInput)
  });
}
