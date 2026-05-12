import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder
} from 'discord.js';
import { buttonCopyId, buttonToggleId } from '../ids.js';
import type { GiveawayStatus } from '../types.js';

export function parseDurationSeconds(duration: string): number {
  const match = duration.trim().match(/^(\d+)(m|h|d)$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 3600;
  if (unit === 'd') return amount * 86400;
  return 0;
}

export function giveawayButtons(giveawayId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonToggleId(giveawayId))
      .setEmoji('🎉')
      .setLabel('Enter')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(buttonCopyId(giveawayId))
      .setLabel('Copy ID')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
  );
}

/** @deprecated Use giveawayButtons instead */
export function giveawayButton(giveawayId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return giveawayButtons(giveawayId, disabled);
}

export function giveawayEmbed(params: {
  id: string;
  title: string;
  description?: string | null;
  endAt: Date;
  winnerCount: number;
  entries: number;
  status: GiveawayStatus;
  createdBy: string;
  winners?: string[];
  interval?: string | null;
  autoRepeat?: boolean;
  claimDeadline?: string | null;
}): EmbedBuilder {
  const isEnded = params.status !== 'active';
  const color = params.status === 'active' ? Colors.Green : Colors.Red;
  const endTimestamp = Math.floor(params.endAt.getTime() / 1000);
  const winners = params.winners ?? [];

  const descLines: string[] = [
    `⏱️ **${isEnded ? 'Ended' : 'Ends'}:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)`,
    `🎙️ **Host:** <@${params.createdBy}>`,
    `🎟️ **Entries:** ${params.entries}`,
    `👑 **Winners:** ${!isEnded
      ? String(params.winnerCount)
      : (winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'No winners')
    }`
  ];

  const effectiveClaimDeadline = params.claimDeadline && params.claimDeadline !== 'def'
    ? params.claimDeadline
    : null;
  if (effectiveClaimDeadline) {
    if (isEnded) {
      const claimDeadlineSecs = parseDurationSeconds(effectiveClaimDeadline);
      const claimDeadlineTs = endTimestamp + claimDeadlineSecs;
      descLines.push(`⏰ **Claim Deadline:** <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)`);
    } else {
      descLines.push(`⏰ **Claim Window:** \`${effectiveClaimDeadline}\` after end`);
    }
  }

  if (params.autoRepeat && params.interval) {
    descLines.push(`🔄 **Repeats:** Every \`${params.interval}\``);
  }

  if (params.description) {
    descLines.push('', params.description);
  }

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: params.title })
    .setDescription(descLines.join('\n'))
    .setFooter({ text: isEnded ? 'Ended' : 'Click 🎉 Enter to participate' })
    .setTimestamp(params.endAt);
}

