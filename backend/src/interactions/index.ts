import { Interaction, Client, EmbedBuilder, Colors } from 'discord.js';
import { handleModalSubmit } from './modalSubmit.js';
import { handleButton } from './button.js';
import { commands } from '../commands/index.js';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../errors.js';

export async function handleInteraction(client: Client, interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.find(c => c.name === interaction.commandName);
      if (command) {
        await command.execute(client, interaction);
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commands.find(c => c.name === interaction.commandName);
      if (command && command.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(client, interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(client, interaction);
      return;
    }
  } catch (error) {
    logger.error('Interaction error:', error);
    const message = getErrorMessage(error);
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle('❌ Error')
      .setDescription(message);
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
}
