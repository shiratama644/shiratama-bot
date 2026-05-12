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
} from '../giveaway/index.js';
import { getGuildSettings, isUserEntered, addGiveawayEntry, removeGiveawayEntry } from '../db/index.js';
import {
  BUTTON_CLAIM_PREFIX,
  BUTTON_COPY_PREFIX,
  BUTTON_LEAVE_PREFIX,
  BUTTON_TOGGLE_PREFIX,
  buttonLeaveId
} from '../ids.js';
import { logger } from '../utils/logger.js';
import { t } from '../i18n.js';

export async function handleButton(client: Client, interaction: ButtonInteraction) {
  const settings = interaction.guildId ? await getGuildSettings(interaction.guildId) : null;
  const language = settings?.language ?? 'en';

  if (interaction.customId.startsWith(BUTTON_COPY_PREFIX)) {
    const id = interaction.customId.slice(BUTTON_COPY_PREFIX.length);
    await interaction.reply({
      content: t(language, 'giveawayId', { id }),
      ephemeral: true
    });
    return;
  }

  if (interaction.customId.startsWith(BUTTON_CLAIM_PREFIX)) {
    await interaction.reply({
      content: t(language, 'claimRequestReceived'),
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
        .setTitle(t(language, 'alreadyEnteredTitle'))
        .setDescription(t(language, 'alreadyEnteredDescription'));
      const leaveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonLeaveId(giveawayId))
          .setLabel(t(language, 'leaveGiveaway'))
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
        .setTitle(t(language, 'enteredTitle'))
        .setDescription(t(language, 'enteredDescription'));
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
      .setTitle(t(language, 'leftGiveawayTitle'))
      .setDescription(t(language, 'leftGiveawayDescription'));
    await interaction.reply({
      embeds: [leftEmbed],
      ephemeral: true
    });
  }
}
