export type GiveawayUserSummary = { id: string; name: string; avatarUrl: string };

export type Giveaway = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string | null;
  endAt: string;
  winnerCount: number;
  status: 'active' | 'ended' | 'stopped';
  createdBy: string;
  createdAt: string;
  interval: string | null;
  autoRepeat: boolean;
  claimDeadline: string | null;
  winners: string[];
};
