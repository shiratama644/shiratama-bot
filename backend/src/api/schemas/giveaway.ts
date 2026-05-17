import { z } from 'zod';

export const createSchema = z.object({
  guildId: z.string().min(1).max(64),
  channelId: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  deadline: z.string().min(1).max(64),
  winnerCount: z.number().int().min(1).max(50),
  autoRepeat: z.boolean().optional()
});

export const guildBodySchema = z.object({ guildId: z.string().min(1).max(64) });
