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
  getGiveaway,
  listEntries,
  markGiveawayEnded,
  setGiveawayMessageId,
  setGiveawayWinners,
  toggleGiveawayEntry,
  updateGiveawayAutoRepeat,
  updateGiveawayStatus
} from './db.js';
import { parseDeadline } from './deadline.js';
import { AppError } from './errors.js';
import type { Giveaway, GiveawayStatus } from './types.js';
import { logger } from './utils/logger.js';

function parseDurationSeconds(duration: string): number {
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
      .setCustomId(`giveaway:toggle:${giveawayId}`)
      .setEmoji('🎉')
      .setLabel('Enter')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`copy_id_${giveawayId}`)
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
    throw new Error('Target channel not found.');
  }

  const message = await channel.send({
    embeds:[
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
        claimDeadline: giveaway.claimDeadline
      })
    ],
    components:[giveawayButtons(giveaway.id)]
  });

  await setGiveawayMessageId(giveaway.id, message.id);
  return { ...giveaway, messageId: message.id };
}

function pickWinners(participants: string[], winnerCount: number): string[] {
  const copied = [...participants];
  const winners: string[] =[];
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
    ? '✅ **参加しました**\nGiveawayに参加しました。'
    : '❌ **退出しました**\nGiveawayから退出しました。';
}

export async function getGiveawayOrThrow(giveawayId: string): Promise<Giveaway> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) {
    throw new AppError('Giveawayが見つかりません。', 404);
  }
  return giveaway;
}

export async function ensureGiveawayInGuild(giveawayId: string, guildId: string) {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.guildId !== guildId) {
    throw new AppError('別サーバーのGiveawayは操作できません。', 403);
  }
  return giveaway;
}

export async function ensureGiveawayIsActive(giveawayId: string): Promise<void> {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.status !== 'active') {
    throw new AppError('このGiveawayは現在参加できません。', 409);
  }
}

export async function ensureGiveawayEnded(giveawayId: string): Promise<void> {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.status !== 'ended') {
    throw new AppError('再抽選は終了済みGiveawayのみ実行できます。', 409);
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
  await message.edit({
    embeds:[
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
        claimDeadline: giveaway.claimDeadline
      })
    ],
    components: [giveawayButtons(giveaway.id, giveaway.status !== 'active')]
  });
}

export async function endGiveaway(client: Client, giveawayId: string, manualEnd = false): Promise<void> {
  const giveaway = await getGiveawayOrThrow(giveawayId);
  if (giveaway.status === 'ended') {
    throw new AppError('このGiveawayはすでに終了しています。', 409);
  }

  logger.info(`Ending giveaway: ${giveaway.title} (${giveawayId})`);

  const participants = await listEntries(giveaway.id);
  const winners = pickWinners(participants, giveaway.winnerCount);

  await markGiveawayEnded(giveaway.id);
  await setGiveawayWinners(giveaway.id, winners);

  if (!giveaway.messageId) {
    throw new AppError('Giveawayの元メッセージが見つかりません。', 404);
  }

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new AppError('投稿先チャンネルが見つかりません。', 404);
  }

  const sourceMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!sourceMessage) {
    throw new AppError('Giveawayメッセージが見つかりません。', 404);
  }

  await refreshGiveawayMessage(client, giveaway.id);

  const endTimestamp = Math.floor(giveaway.endAt.getTime() / 1000);
  const claimDeadlineText = giveaway.claimDeadline && giveaway.claimDeadline !== 'def'
    ? giveaway.claimDeadline
    : null;
  const claimDeadlineSecs = claimDeadlineText ? parseDurationSeconds(claimDeadlineText) : 0;
  const claimDeadlineTs = claimDeadlineSecs > 0 ? endTimestamp + claimDeadlineSecs : null;

  let endContent: string;
  if (winners.length === 0) {
    endContent = `参加者がいないため、当選者は選ばれませんでした。\nPrize: **${giveaway.title}**`;
  } else {
    const lines = [
      `Congratulations ${winners.map(id => userMention(id)).join(', ')}!`,
      `Prize: **${giveaway.title}**`
    ];
    if (claimDeadlineTs) {
      lines.push(`Claim deadline: <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)`);
    }
    endContent = lines.join('\n');
  }

  await sourceMessage.reply({ content: endContent });

  if (winners.length > 0 && claimDeadlineTs) {
    const claimEmbed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setAuthor({ name: 'Claim Your Prize' })
      .setTitle('🎫 Claim Your Prize')
      .setDescription([
        `Congratulations ${winners.map(id => userMention(id)).join(', ')}!\n`,
        'Click 🎫 **Claim Prize** to open a private channel where staff will deliver your prize.\n',
        `⏰ **Claim by:** <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)\n`,
        '**Prize**',
        giveaway.title
      ].join('\n'))
      .setFooter({ text: `Claim • ${giveaway.id}` });

    const claimRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_prize_${giveaway.id}`)
        .setLabel('Claim Prize')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Success)
    );

    await sourceMessage.reply({ embeds: [claimEmbed], components: [claimRow] });
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
    throw new AppError('このGiveawayには自動作成間隔が設定されていません。', 409);
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
  if (!giveaway.messageId) {
    throw new AppError('Giveawayメッセージが見つかりません。', 404);
  }

  const participants = await listEntries(giveaway.id);
  const winners = pickWinners(participants, giveaway.winnerCount);

  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new AppError('投稿先チャンネルが見つかりません。', 404);
  }

  const sourceMessage = await channel.messages.fetch(giveaway.messageId);

  const endTimestamp = Math.floor(giveaway.endAt.getTime() / 1000);
  const claimDeadlineText = giveaway.claimDeadline && giveaway.claimDeadline !== 'def'
    ? giveaway.claimDeadline
    : null;
  const claimDeadlineSecs = claimDeadlineText ? parseDurationSeconds(claimDeadlineText) : 0;
  const claimDeadlineTs = claimDeadlineSecs > 0 ? endTimestamp + claimDeadlineSecs : null;

  let rerollContent: string;
  if (winners.length === 0) {
    rerollContent = '参加者がいないため、再抽選できません。';
  } else {
    const lines = [
      `New winner(s): ${winners.map(id => userMention(id)).join(', ')}!`,
      `Prize: **${giveaway.title}**`
    ];
    if (claimDeadlineTs) {
      lines.push(`Claim deadline: <t:${claimDeadlineTs}:R> (<t:${claimDeadlineTs}:f>)`);
    }
    rerollContent = lines.join('\n');
  }

  await sourceMessage.reply({ content: rerollContent });

  if (winners.length > 0) {
    await setGiveawayWinners(giveaway.id, winners);
  }

  return winners;
}
