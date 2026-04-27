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
    descLines.push(`⏰ **${isEnded ? 'Claim Deadline' : 'Claim Window'}:** \`${effectiveClaimDeadline}\` after end`);
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

export async function endGiveaway(client: Client, giveawayId: string): Promise<void> {
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

  const endEmbed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setAuthor({ name: '🎉 Giveaway Ended' })
    .setDescription(
      winners.length === 0
        ? '参加者がいないため、当選者は選ばれませんでした。'
        : `Congratulations ${winners.map(id => userMention(id)).join(', ')}!\nPrize: **${giveaway.title}**`
    )
    .setFooter({ text: `Giveaway • ${giveaway.id}` })
    .setTimestamp();

  await sourceMessage.reply({ embeds: [endEmbed] });

  if (giveaway.autoRepeat && giveaway.interval) {
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

  const rerollEmbed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({ name: '🔁 Giveaway Rerolled' })
    .setDescription(
      winners.length === 0
        ? '参加者がいないため、再抽選できません。'
        : `New winner(s): ${winners.map(id => userMention(id)).join(', ')}\nPrize: **${giveaway.title}**`
    )
    .setFooter({ text: `Giveaway • ${giveaway.id}` })
    .setTimestamp();

  await sourceMessage.reply({ embeds: [rerollEmbed] });

  if (winners.length > 0) {
    await setGiveawayWinners(giveaway.id, winners);
  }

  return winners;
}
