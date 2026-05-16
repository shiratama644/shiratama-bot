import { z } from 'zod';

export const createSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline: z.string().min(1),
  winnerCount: z.number().int().min(1),
  autoRepeat: z.boolean().optional()
});

export const guildBodySchema = z.object({ guildId: z.string().min(1) });
