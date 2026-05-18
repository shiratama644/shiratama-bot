export type GuildSettings = {
  guildId: string;
  giveawayCreatorRoleIds: string[];
  dashboardUsableRoleIds: string[];
  language: string;
  giveawayChannelIds: string[];
  defaultClaimDeadline: string | null;
};
