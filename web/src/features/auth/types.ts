import type { GuildSummary } from '@/features/guilds/types';

export type AuthGuild = GuildSummary & {
  canUseDashboard: boolean;
  canCreateGiveaway: boolean;
  isOwner: boolean;
};

export type AuthSession = {
  user: { id: string; name: string; avatarUrl: string };
  guilds: AuthGuild[];
};
