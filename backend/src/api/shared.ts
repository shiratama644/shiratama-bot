import { z } from 'zod';
import { AppError, getErrorMessage, getErrorStatusCode } from '../shared/errors/index.js';

export type AuthGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
  canUseDashboard: boolean;
  canCreateGiveaway: boolean;
  isOwner: boolean;
};

export type AuthSession = {
  token: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  guilds: AuthGuild[];
  expiresAt: number;
};

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

export const settingsSchema = z.object({
  language: z.enum(['en', 'ja']).optional(),
  giveawayCreatorRoleIds: z.array(z.string().min(1)).optional(),
  dashboardUsableRoleIds: z.array(z.string().min(1)).optional(),
  // deprecated: kept for backward compatibility with older web clients
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

export function requireParam(value: string | undefined, key: string): string {
  if (!value) {
    throw new AppError(`Invalid route parameter: ${key}`, 400);
  }
  return value;
}

type ApiErrorStatus = 400 | 401 | 403 | 404 | 500;

type ErrorResponseContext = {
  json: (body: { error: string }, status: ApiErrorStatus) => Response;
};

export function respondError(c: ErrorResponseContext, error: unknown) {
  return c.json({ error: getErrorMessage(error) }, getErrorStatusCode(error) as ApiErrorStatus);
}

export function getSessionGuild(session: AuthSession, guildId: string): AuthGuild {
  const guild = session.guilds.find((item) => item.id === guildId);
  if (!guild || !guild.canUseDashboard) {
    throw new AppError('You do not have permission to access this server dashboard.', 403);
  }
  return guild;
}
