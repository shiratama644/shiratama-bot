import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Colors,
  EmbedBuilder,
  TextChannel,
  userMention
} from 'discord.js';
import {
  countEntries,
  createGiveaway,
  getGuildSettings,
  getGiveaway,
  listEntries,
  markGiveawayEnded,
  setGiveawayMessageId,
  setGiveawayWinners,
  toggleGiveawayEntry,
  updateGiveawayAutoRepeat,
  updateGiveawayStatus
} from '../../db/index.js';
import { parseDeadline } from '../../shared/utils/deadline.js';
import { AppError } from '../../shared/errors/index.js';
import { buttonClaimId, embedClaimFooterText } from '../../shared/constants/ids.js';
import type { Giveaway } from '../../shared/types/common.js';
import { logger } from '../../shared/logger/index.js';
import { giveawayButtons, giveawayEmbed, parseDurationSeconds } from './embeds.js';
import { DEFAULT_LANGUAGE, t } from '../../shared/i18n/index.js';

function formatWinnerMentions(winners: string[]): string {
  return winners.map(id => userMention(id)).join(', ');
}

function calculateClaimDeadlineTimestamp(giveaway: { endAt: Date; claimDeadline: string | null }): number | null {
  const claimDeadlineText = giveaway.claimDeadline && giveaway.claimDeadline !== 'def'
    ? giveaway.claimDeadline
    : null;
  if (!claimDeadlineText) return null;
  const claimDeadlineSecs = parseDurationSeconds(claimDeadlineText);
  if (claimDeadlineSecs <= 0) return null;
  return Math.floor(giveaway.endAt.getTime() / 1000) + claimDeadlineSecs;
}

function pickWinners(participants: string[], winnerCount: number): string[] {
  const copied = [...participants];
  const winners: string[] = [];
  while (copied.length > 0 && winners.length < winnerCount) {
    const index = Math.floor(Math.random() * copied.length);
    winners.push(copied[index]);
    copied.splice(index, 1);
  }
  return winners;
}

export async function toggleEntryAndBuildMessage(giveawayId: string, userId: string): Promise<string> {
  const status = await toggleGiveawayEntry(giveawayId, userId);
  return status === 'joined'
    ? '✅ **Entered!**\nYou have entered the giveaway.'
    : '❌ **Left!**\nYou have left the giveaway.';
}

export async function getGiveawayOrThrow(giveawayId: string): Promise<Giveaway> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    throw new AppError(t(DEFAULT_LANGUAGE, 'giveawayNotFound'), 404);
  }
  return giveaway;
}

export async function ensureGiveawayInGuild(giveawayId: string, guildId: string) {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.guildId !== guildId) {
    const settings = await getGuildSettings(guildId);
    throw new AppError(t(settings.language, 'cannotManageOtherServers'), 403);
  }
  return giveaway;
}

export async function ensureGiveawayIsActive(giveawayId: string): Promise<void> {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.status !== 'active') {
    const settings = await getGuildSettings(giveaway.guildId);
    throw new AppError(t(settings.language, 'giveawayNotActive'), 409);
  }
}

export async function ensureGiveawayEnded(giveawayId: string): Promise<void> {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.status !== 'ended') {
    const settings = await getGuildSettings(giveaway.guildId);
    throw new AppError(t(settings.language, 'rerollOnlyEnded'), 409);
  }
}

export async function refreshGiveawayMessage(client: Client, giveawayId: string): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway || !giveaway.messageId) {
    return;
  }

  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    return;
  }

  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) {
    return;
  }

  const entries = await countEntries(giveaway.id);
  const settings = await getGuildSettings(giveaway.guildId);
  const language = settings.language;
  await message.edit({
    embeds: [
      giveawayEmbed({
        id: giveaway.id,
        title: giveaway.title,
        description: giveaway.description,
        endAt: giveaway.endAt,
        winnerCount: giveaway.winnerCount,
        entries,
        status: giveaway.status,
        createdBy: giveaway.createdBy,
        winners: giveaway.winners,
        interval: giveaway.interval,
        autoRepeat: giveaway.autoRepeat,
        claimDeadline: giveaway.claimDeadline,
        language
      })
    ],
    components: [giveawayButtons(giveaway.id, giveaway.status !== 'active', language)]
  });
}

export async function createGiveawayPost(params: {
  client: Client;
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  deadlineInput: string;
  winnerCount: number;
  createdBy: string;
  interval?: string;
  claimDeadline?: string | null;
}) {
  const settings = await getGuildSettings(params.guildId);
  const language = settings.language;
  const endAt = parseDeadline(params.deadlineInput);
  const id = crypto.randomUUID();

  const giveaway = await createGiveaway({
    id,
    guildId: params.guildId,
    channelId: params.channelId,
    title: params.title,
    description: params.description?.trim() || null,
    endAt,
    winnerCount: Math.max(1, Math.floor(params.winnerCount)),
    createdBy: params.createdBy,
    interval: params.interval || null,
    autoRepeat: !!params.interval,
    claimDeadline: params.claimDeadline || null
  });

  const channel = await params.client.channels.fetch(params.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new AppError(t(language, 'targetChannelNotFound'), 404);
  }

  const message = await channel.send({
    embeds: [
      giveawayEmbed({
        id: giveaway.id,
        title: giveaway.title,
        description: giveaway.description,
        endAt: giveaway.endAt,
        winnerCount: giveaway.winnerCount,
        entries: 0,
        status: 'active',
        createdBy: giveaway.createdBy,
        winners: [],
        interval: giveaway.interval,
        autoRepeat: giveaway.autoRepeat,
        claimDeadline: giveaway.claimDeadline,
        language
      })
    ],
    components: [giveawayButtons(giveaway.id, false, language)]
  });

  await setGiveawayMessageId(giveaway.id, message.id);
  return { ...giveaway, messageId: message.id };
}

export async function endGiveaway(client: Client, giveawayId: string, manualEnd = false): Promise<void> {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  const settings = await getGuildSettings(giveaway.guildId);
  const language = settings.language;
  if (giveaway.status === 'ended') {
    throw new AppError(t(language, 'giveawayAlreadyEnded'), 409);
  }

  logger.info(`Ending giveaway: ${giveaway.title} (${giveawayId})`);

  const participants = await listEntries(giveaway.id);
  const winners = pickWinners(participants, giveaway.winnerCount);

  await markGiveawayEnded(giveaway.id);
  await setGiveawayWinners(giveaway.id, winners);

  if (!giveaway.messageId) {
    throw new AppError(t(language, 'originalGiveawayMessageNotFound'), 404);
  }

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new AppError(t(language, 'targetChannelNotFound'), 404);
  }

  const sourceMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!sourceMessage) {
    throw new AppError(t(language, 'giveawayMessageNotFound'), 404);
  }

  await refreshGiveawayMessage(client, giveaway.id);

  const claimDeadlineTs = calculateClaimDeadlineTimestamp(giveaway);

  if (winners.length === 0) {
    await sourceMessage.reply({ content: t(language, 'noParticipantsNoWinners') });
  } else {
    const endContent = [
      t(language, 'congratulationsWinners', { winners: formatWinnerMentions(winners) }),
      t(language, 'wonGiveaway', { title: `**${giveaway.title}**` })
    ].join('\n');

    if (claimDeadlineTs) {
      const claimEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: t(language, 'claimYourPrizeAuthor') })
        .setTitle(t(language, 'claimYourPrizeTitle'))
        .setDescription([
          t(language, 'congratulationsWinners', { winners: formatWinnerMentions(winners) }),
          '',
          `⏰ **${t(language, 'claimBy')}:** <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)`
        ].join('\n'))
        .setFooter({ text: embedClaimFooterText(giveaway.id) });

      const claimRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonClaimId(giveaway.id))
          .setLabel(t(language, 'claimPrizeButton'))
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Success)
      );

      await sourceMessage.reply({ content: endContent, embeds: [claimEmbed], components: [claimRow] });
    } else {
      await sourceMessage.reply({ content: endContent });
    }
  }

  if (!manualEnd && giveaway.autoRepeat && giveaway.interval) {
    logger.info(`Auto-repeating giveaway: ${giveaway.title} (${giveawayId})`);
    await createGiveawayPost({
      client,
      guildId: giveaway.guildId,
      channelId: giveaway.channelId,
      title: giveaway.title,
      description: giveaway.description || undefined,
      deadlineInput: giveaway.interval,
      winnerCount: giveaway.winnerCount,
      createdBy: giveaway.createdBy,
      interval: giveaway.interval,
      claimDeadline: giveaway.claimDeadline
    });
  }
}

export async function stopGiveawayAutoRepeat(giveawayId: string): Promise<void> {
  await updateGiveawayAutoRepeat(giveawayId, false);
}

export async function startGiveawayAutoRepeat(giveawayId: string): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (giveaway && giveaway.interval) {
    await updateGiveawayAutoRepeat(giveawayId, true);
  } else {
    const language = giveaway ? (await getGuildSettings(giveaway.guildId)).language : DEFAULT_LANGUAGE;
    throw new AppError(t(language, 'noAutoRepeatIntervalSet'), 409);
  }
}

export async function stopGiveaway(client: Client, giveawayId: string): Promise<void> {
  await getGiveawayOrThrow(giveawayId);
  await updateGiveawayStatus(giveawayId, 'stopped');
  await refreshGiveawayMessage(client, giveawayId);
}

export async function rerollGiveaway(client: Client, giveawayId: string): Promise<string[]> {
  await ensureGiveawayEnded(giveawayId);
  const giveaway = await getGiveawayOrThrow(giveawayId);
  const settings = await getGuildSettings(giveaway.guildId);
  const language = settings.language;
  if (!giveaway.messageId) {
    throw new AppError(t(language, 'giveawayMessageNotFound'), 404);
  }

  const participants = await listEntries(giveaway.id);
  const winners = pickWinners(participants, giveaway.winnerCount);

  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new AppError(t(language, 'targetChannelNotFound'), 404);
  }

  const sourceMessage = await channel.messages.fetch(giveaway.messageId);

  const claimDeadlineTs = calculateClaimDeadlineTimestamp(giveaway);

  let rerollContent: string;
  if (winners.length === 0) {
    rerollContent = t(language, 'noParticipantsCannotReroll');
  } else {
    const lines = [
      t(language, 'newWinners', { winners: formatWinnerMentions(winners) }),
      `${t(language, 'prizeLabel')}: **${giveaway.title}**`
    ];
    if (claimDeadlineTs) {
      lines.push(`${t(language, 'claimDeadlineLabel')}: <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)`);
    }
    rerollContent = lines.join('\n');
  }

  await sourceMessage.reply({ content: rerollContent });

  if (winners.length > 0) {
    await setGiveawayWinners(giveaway.id, winners);
  }

  return winners;
}
