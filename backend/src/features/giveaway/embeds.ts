import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder
} from 'discord.js';
import { buttonCopyId, buttonToggleId } from '../../shared/constants/ids.js';
import type { GiveawayStatus } from '../../shared/types/common.js';
import { DEFAULT_LANGUAGE, t } from '../../shared/i18n/index.js';
import { parseIntervalSeconds } from '../../shared/utils/deadline.js';

export function giveawayButtons(giveawayId: string, disabled = false, language: string = DEFAULT_LANGUAGE): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buttonToggleId(giveawayId))
      .setEmoji('🎉')
      .setLabel(t(language, 'enterButton'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(buttonCopyId(giveawayId))
      .setLabel(t(language, 'copyIdButton'))
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
  );
}

/** @deprecated Use giveawayButtons instead */
export function giveawayButton(giveawayId: string, disabled = false, language: string = DEFAULT_LANGUAGE): ActionRowBuilder<ButtonBuilder> {
  return giveawayButtons(giveawayId, disabled, language);
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
  language?: string;
}): EmbedBuilder {
  const isEnded = params.status !== 'active';
  const color = params.status === 'active' ? Colors.Green : Colors.Red;
  const endTimestamp = Math.floor(params.endAt.getTime() / 1000);
  const winners = params.winners ?? [];
  const language = params.language ?? DEFAULT_LANGUAGE;

  const descLines: string[] = [
    `⏱️ **${isEnded ? t(language, 'ended') : t(language, 'ends')}:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)`,
    `🎙️ **${t(language, 'host')}:** <@${params.createdBy}>`,
    `🎟️ **${t(language, 'entries')}:** ${params.entries}`,
    `👑 **${t(language, 'winners')}:** ${!isEnded
      ? String(params.winnerCount)
      : (winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : t(language, 'noWinners'))
    }`
  ];

  const effectiveClaimDeadline = params.claimDeadline && params.claimDeadline !== 'def'
    ? params.claimDeadline
    : null;
  if (effectiveClaimDeadline) {
    if (isEnded) {
      const claimDeadlineSecs = parseIntervalSeconds(effectiveClaimDeadline);
      const claimDeadlineTs = endTimestamp + claimDeadlineSecs;
      descLines.push(`⏰ **${t(language, 'claimDeadline')}:** <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)`);
    } else {
      descLines.push(`⏰ **${t(language, 'claimWindow')}:** \`${effectiveClaimDeadline}\` ${t(language, 'afterEnd')}`);
    }
  }

  if (params.autoRepeat && params.interval) {
    descLines.push(`🔄 **${t(language, 'repeats')}:** ${t(language, 'every')} \`${params.interval}\``);
  }

  if (params.description) {
    descLines.push('', params.description);
  }

  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: params.title })
    .setDescription(descLines.join('\n'))
    .setFooter({ text: isEnded ? t(language, 'ended') : t(language, 'clickEnterToParticipate') })
    .setTimestamp(params.endAt);
}
