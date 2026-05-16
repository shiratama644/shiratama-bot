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
