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

    logger.info(`User ${interaction.user.id} toggling entry for giveaway ${giveawayId}`);

    await ensureGiveawayIsActive(giveawayId);
    const entered = await isUserEntered(giveawayId, interaction.user.id);

    if (entered) {
      const leaveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway:leave:${giveawayId}`)
          .setLabel('Leave Giveaway')
          .setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        content: 'You have already entered in this giveaway.',
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

  if (interaction.customId.startsWith('giveaway:leave:')) {
    const giveawayId = interaction.customId.split(':')[2];

    logger.info(`User ${interaction.user.id} leaving giveaway ${giveawayId}`);

    await ensureGiveawayIsActive(giveawayId);
    await removeGiveawayEntry(giveawayId, interaction.user.id);
    await refreshGiveawayMessage(client, giveawayId);
    await interaction.reply({
      content: '❌ You have left the giveaway.',
      ephemeral: true
    });
  }
}
