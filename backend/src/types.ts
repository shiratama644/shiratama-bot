export type GiveawayStatus = 'active' | 'ended';

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
}

export interface GiveawayEntry {
  giveawayId: string;
  userId: string;
  joinedAt: Date;
}
