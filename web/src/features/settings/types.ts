import { z } from 'zod';

export const guildLanguageSchema = z.enum(['en', 'ja']);

export const guildSettingsSchema = z.object({
  guildId: z.string().min(1),
  giveawayCreatorRoleIds: z.array(z.string()),
  dashboardUsableRoleIds: z.array(z.string()),
  language: guildLanguageSchema,
  giveawayChannelIds: z.array(z.string()),
  defaultClaimDeadline: z.string().nullable()
});

export const guildSettingsUpdateInputSchema = guildSettingsSchema.omit({ guildId: true });

export type GuildLanguage = z.infer<typeof guildLanguageSchema>;
export type GuildSettings = z.infer<typeof guildSettingsSchema>;
export type GuildSettingsUpdateInput = z.infer<typeof guildSettingsUpdateInputSchema>;
