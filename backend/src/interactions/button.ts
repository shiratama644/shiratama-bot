import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  Client,
  Colors,
  EmbedBuilder
} from 'discord.js';
import {
  ensureGiveawayIsActive,
  refreshGiveawayMessage
} from '../giveawayService.js';
import { isUserEntered, addGiveawayEntry, removeGiveawayEntry } from '../db.js';
import {
  BUTTON_CLAIM_PREFIX,
  BUTTON_COPY_PREFIX,
  BUTTON_LEAVE_PREFIX,
  BUTTON_TOGGLE_PREFIX,
  buttonLeaveId
} from '../ids.js';
import { logger } from '../utils/logger.js';

export async function handleButton(client: Client, interaction: ButtonInteraction) {
  if (interaction.customId.startsWith(BUTTON_COPY_PREFIX)) {
    const id = interaction.customId.slice(BUTTON_COPY_PREFIX.length);
    await interaction.reply({
      content: `📋 **Giveaway ID:** \`${id}\``,
      ephemeral: true
    });
    return;
  }

  if (interaction.customId.startsWith(BUTTON_CLAIM_PREFIX)) {
    await interaction.reply({
      content: '🎫 Your claim request has been received. Staff will create a private channel for you shortly.',
      ephemeral: true
    });
    return;
  }

  if (interaction.customId.startsWith(BUTTON_TOGGLE_PREFIX)) {
    const giveawayId = interaction.customId.slice(BUTTON_TOGGLE_PREFIX.length);

    logger.info(`User ${interaction.user.id} toggling entry for giveaway ${giveawayId}`);

    await ensureGiveawayIsActive(giveawayId);
    const entered = await isUserEntered(giveawayId, interaction.user.id);

    if (entered) {
      const leaveEmbed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle('🎫 Already Entered!')
        .setDescription('You have already entered this giveaway.');
      const leaveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonLeaveId(giveawayId))
          .setLabel('Leave Giveaway')
          .setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        embeds: [leaveEmbed],
        components: [leaveRow],
        ephemeral: true
      });
    } else {
      await addGiveawayEntry(giveawayId, interaction.user.id);
      await refreshGiveawayMessage(client, giveawayId);
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Entered!')
        .setDescription('You have entered the giveaway. Good luck!');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  if (interaction.customId.startsWith(BUTTON_LEAVE_PREFIX)) {
    const giveawayId = interaction.customId.slice(BUTTON_LEAVE_PREFIX.length);

    logger.info(`User ${interaction.user.id} leaving giveaway ${giveawayId}`);

    await ensureGiveawayIsActive(giveawayId);
    await removeGiveawayEntry(giveawayId, interaction.user.id);
    await refreshGiveawayMessage(client, giveawayId);
    const leftEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ Left Giveaway')
      .setDescription('You have left the giveaway.');
    await interaction.reply({
      embeds: [leftEmbed],
      ephemeral: true
    });
  }
}
