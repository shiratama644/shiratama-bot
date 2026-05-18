export type GuildSummary = { id: string; name: string; iconUrl: string | null };
export type RoleSummary = { id: string; name: string };
export type ChannelSummary = { id: string; name: string };

export type GuildOptions = {
  guild: GuildSummary;
  roles: RoleSummary[];
  channels: ChannelSummary[];
};
