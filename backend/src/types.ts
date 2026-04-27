export type GiveawayStatus = 'active' | 'ended' | 'stopped';

export interface Giveaway {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string | null;
  endAt: Date;
  winnerCount: number;
  status: GiveawayStatus;
  createdBy: string;
  createdAt: Date;
  interval: string | null;
  autoRepeat: boolean;
  claimDeadline: string | null;
  winners: string[];
}

export interface GiveawayEntry {
  giveawayId: string;
  userId: string;
  joinedAt: Date;
}

export interface GuildSettings {
  guildId: string;
  managerRoleIds: string[];
  language: string;
  giveawayChannelIds: string[];
  defaultClaimDeadline: string | null;
}
