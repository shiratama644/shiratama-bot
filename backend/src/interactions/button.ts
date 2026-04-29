import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  Colors,
  EmbedBuilder
} from 'discord.js';
import { ensureGiveawayIsActive, refreshGiveawayMessage } from '../giveawayService.js';
import { isUserEntered, joinGiveawayEntry, leaveGiveawayEntry } from '../db.js';
import { logger } from '../utils/logger.js';

export async function handleButton(client: Client, interaction: ButtonInteraction) {
  if (interaction.customId.startsWith('copy_id_')) {
    const id = interaction.customId.slice('copy_id_'.length);
    await interaction.reply({
      content: `📋 **Giveaway ID:** \`${id}\``,
      ephemeral: true
    });
    return;
  }

  if (interaction.customId.startsWith('claim_prize_')) {
    await interaction.reply({
      content: '🎫 Your claim request has been received. Staff will create a private channel for you shortly.',
      ephemeral: true
    });
    return;
  }

  if (interaction.customId.startsWith('giveaway:toggle:')) {
    const giveawayId = interaction.customId.split(':')[2];

    logger.info(`User ${interaction.user.id} pressing Enter for giveaway ${giveawayId}`);

    await ensureGiveawayIsActive(giveawayId);

    const alreadyEntered = await isUserEntered(giveawayId, interaction.user.id);

    if (alreadyEntered) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setDescription('You have already entered in this giveaway.');

      const leaveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway:leave:${giveawayId}`)
          .setLabel('Leave Giveaway')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({ embeds: [embed], components: [leaveRow], ephemeral: true });
    } else {
      await joinGiveawayEntry(giveawayId, interaction.user.id);
      await refreshGiveawayMessage(client, giveawayId);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription('✅ You have entered the giveaway!');

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  if (interaction.customId.startsWith('giveaway:leave:')) {
    const giveawayId = interaction.customId.split(':')[2];

    logger.info(`User ${interaction.user.id} leaving giveaway ${giveawayId}`);

    await leaveGiveawayEntry(giveawayId, interaction.user.id);
    await refreshGiveawayMessage(client, giveawayId);

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setDescription('❌ You have left the giveaway.');

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
