import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
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
  toggleGiveawayEntry,
  updateGiveawayAutoRepeat,
  updateGiveawayStatus
} from './db.js';
import { parseDeadline } from './deadline.js';
import { AppError } from './errors.js';
import type { Giveaway, GiveawayStatus } from './types.js';
import { logger } from './utils/logger.js';

export function giveawayButton(giveawayId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(`giveaway:toggle:${giveawayId}`)
    .setLabel('参加 / 退出')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export function giveawayEmbed(params: {
  id: string;
  title: string;
  description?: string | null;
  endAt: Date;
  winnerCount: number;
  entries: number;
  status: GiveawayStatus;
}): EmbedBuilder {
  let statusText = '開催中';
  let color = 0x57f287;
  if (params.status === 'ended') {
    statusText = '終了';
    color = 0xed4245;
  } else if (params.status === 'stopped') {
    statusText = '停止中';
    color = 0xfee75c;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${params.title}`)
    .setDescription(params.description ?? '説明なし')
    .addFields(
      { name: '締切', value: `<t:${Math.floor(params.endAt.getTime() / 1000)}:F>`, inline: false },
      { name: '当選人数', value: String(params.winnerCount), inline: true },
      { name: '参加数', value: String(params.entries), inline: true },
      { name: '状態', value: statusText, inline: true }
    )
    .setColor(color);
  return embed;
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
    autoRepeat: !!params.interval
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
        status: 'active'
      })
    ],
    components:[giveawayButton(giveaway.id)]
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
        status: giveaway.status
      })
    ],
    // Disable the toggle button whenever status is not active (ended or stopped).
    components: [giveawayButton(giveaway.id, giveaway.status !== 'active')]
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

  if (winners.length === 0) {
    await sourceMessage.reply(
      '🎉 **Giveaway 終了**\n' +
      '参加者がいないため、当選者は選ばれませんでした。'
    );
  } else {
    const mentions = winners.map((id) => userMention(id)).join(' ');
    await sourceMessage.reply(
      `🎉 **Giveaway 終了**\n` +
      `当選者: ${mentions}\n` +
      `おめでとうございます！`
    );
  }

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
      interval: giveaway.interval
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
  if (winners.length === 0) {
    await sourceMessage.reply(
      '🔁 **再抽選できませんでした**\n' +
      '参加者がいないため、再抽選できません。'
    );
    return[];
  }

  const mentions = winners.map((id) => userMention(id)).join(' ');
  await sourceMessage.reply(
    `🔁 **Giveaway 再抽選**\n` +
    `新しい当選者: ${mentions}\n` +
    `おめでとうございます！`
  );
  return winners;
}
