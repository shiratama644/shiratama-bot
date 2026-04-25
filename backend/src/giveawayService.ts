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

export function giveawayButton(giveawayId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(`giveaway:toggle:${giveawayId}`)
    .setLabel('Enter / Leave')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

import type { GiveawayStatus } from './types.js';

export function giveawayEmbed(params: {
  id: string;
  title: string;
  description?: string | null;
  endAt: Date;
  winnerCount: number;
  entries: number;
  status: GiveawayStatus;
}): EmbedBuilder {
  let statusText = '🟢 Ongoing';
  let color = 0x57f287;
  if (params.status === 'ended') {
    statusText = '🔴 Ended';
    color = 0xed4245;
  } else if (params.status === 'stopped') {
    statusText = '🟡 Stopped';
    color = 0xfee75c;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${params.title}`)
    .setDescription(params.description ?? 'No description provided.')
    .addFields(
      { name: 'Ends', value: `<t:${Math.floor(params.endAt.getTime() / 1000)}:F>`, inline: false },
      { name: 'Winners', value: String(params.winnerCount), inline: true },
      { name: 'Entries', value: String(params.entries), inline: true },
      { name: 'Status', value: statusText, inline: true }
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
    ? '✅ **Success!**\nYou have successfully entered the giveaway.'
    : '❌ **Left!**\nYou have left the giveaway.';
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
    components: [giveawayButton(giveaway.id, giveaway.status === 'ended')]
  });
}

import { logger } from './utils/logger.js';

export async function endGiveaway(client: Client, giveawayId: string): Promise<void> {
  try {
    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) {
      logger.warn(`Attempted to end non-existent giveaway: ${giveawayId}`);
      return;
    }
    if (giveaway.status === 'ended') {
      return;
    }

    logger.info(`Ending giveaway: ${giveaway.title} (${giveawayId})`);

    const participants = await listEntries(giveaway.id);
    const winners = pickWinners(participants, giveaway.winnerCount);

    await markGiveawayEnded(giveaway.id);

    if (!giveaway.messageId) {
      logger.warn(`Giveaway ${giveawayId} has no messageId`);
      return;
    }

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error(`Channel ${giveaway.channelId} not found or not a text channel for giveaway ${giveawayId}`);
      return;
    }

    const sourceMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!sourceMessage) {
      logger.warn(`Message ${giveaway.messageId} not found in channel ${giveaway.channelId}`);
      return;
    }

    await refreshGiveawayMessage(client, giveaway.id).catch(err => logger.error(`Failed to refresh message for ${giveawayId}`, err));

    if (winners.length === 0) {
      await sourceMessage.reply(
        '🎉 **Giveaway Ended!**\n' +
        'Unfortunately, there were no participants, so no winners could be selected.'
      ).catch(err => logger.error(`Failed to reply to message ${sourceMessage.id}`, err));
    } else {
      const mentions = winners.map((id) => userMention(id)).join(' ');
      await sourceMessage.reply(
        `🎉 **Giveaway Ended!**\n` +
        `Congratulations to the winner(s): ${mentions}\n` +
        `You have won **${giveaway.title}**!`
      ).catch(err => logger.error(`Failed to reply to message ${sourceMessage.id}`, err));
    }

    // Auto-repeat logic
    if (giveaway.autoRepeat && giveaway.interval) {
      try {
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
      } catch (e) {
        logger.error(`Failed to auto-repeat giveaway ${giveawayId}:`, e);
      }
    }
  } catch (error) {
    logger.error(`Unexpected error ending giveaway ${giveawayId}:`, error);
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
    throw new Error('This giveaway does not have an interval set.');
  }
}

export async function stopGiveaway(client: Client, giveawayId: string): Promise<void> {
  await updateGiveawayStatus(giveawayId, 'stopped');
  await refreshGiveawayMessage(client, giveawayId);
}

export async function rerollGiveaway(client: Client, giveawayId: string): Promise<string[]> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway || !giveaway.messageId) {
    throw new Error('Giveaway not found or message ID is missing.');
  }

  const participants = await listEntries(giveaway.id);
  const winners = pickWinners(participants, giveaway.winnerCount);

  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('Channel not found or is not a text channel.');
  }

  const sourceMessage = await channel.messages.fetch(giveaway.messageId);
  if (winners.length === 0) {
    await sourceMessage.reply(
      '🔁 **Reroll Failed**\n' +
      'There are no participants to choose from.'
    );
    return[];
  }

  const mentions = winners.map((id) => userMention(id)).join(' ');
  await sourceMessage.reply(
    `🔁 **Giveaway Rerolled!**\n` +
    `The new winner(s): ${mentions}\n` +
    `Congratulations!`
  );
  return winners;
}