import { z } from 'zod';

export const settingsSchema = z.object({
  language: z.enum(['en', 'ja']).optional(),
  giveawayCreatorRoleIds: z.array(z.string().min(1)).optional(),
  dashboardUsableRoleIds: z.array(z.string().min(1)).optional(),
  dashboardViewRoleIds: z.array(z.string().min(1)).optional(),
  giveawayChannelIds: z.array(z.string().min(1)).optional(),
  defaultClaimDeadline: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().nullable().optional())
});
