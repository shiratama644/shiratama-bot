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
  toggleGiveawayEntry
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

export function giveawayEmbed(params: {
  id: string;
  title: string;
  description?: string | null;
  endAt: Date;
  winnerCount: number;
  entries: number;
  status: 'active' | 'ended';
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${params.title}`)
    .setDescription(params.description ?? 'No description provided.')
    .addFields(
      { name: 'Ends', value: `<t:${Math.floor(params.endAt.getTime() / 1000)}:F>`, inline: false },
      { name: 'Winners', value: String(params.winnerCount), inline: true },
      { name: 'Entries', value: String(params.entries), inline: true },
      { name: 'Status', value: params.status === 'active' ? '🟢 Ongoing' : '🔴 Ended', inline: true }
    )
    .setColor(params.status === 'active' ? 0x57f287 : 0xed4245);
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
    createdBy: params.createdBy
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

export async function endGiveaway(client: Client, giveawayId: string): Promise<void> {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway || giveaway.status === 'ended') {
    return;
  }

  const participants = await listEntries(giveaway.id);
  const winners = pickWinners(participants, giveaway.winnerCount);

  await markGiveawayEnded(giveaway.id);

  if (!giveaway.messageId) {
    return;
  }

  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    return;
  }

  const sourceMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!sourceMessage) {
    return;
  }

  await refreshGiveawayMessage(client, giveaway.id);

  if (winners.length === 0) {
    await sourceMessage.reply(
      '🎉 **Giveaway Ended!**\n' +
      'Unfortunately, there were no participants, so no winners could be selected.'
    );
    return;
  }

  const mentions = winners.map((id) => userMention(id)).join(' ');
  await sourceMessage.reply(
    `🎉 **Giveaway Ended!**\n` +
    `Congratulations to the winner(s): ${mentions}\n` +
    `You have won **${giveaway.title}**!`
  );
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