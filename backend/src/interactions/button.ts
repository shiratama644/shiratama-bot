import { ButtonInteraction, Client } from 'discord.js';
import { ensureGiveawayIsActive, toggleEntryAndBuildMessage, refreshGiveawayMessage } from '../giveawayService.js';
import { logger } from '../utils/logger.js';

export async function handleButton(client: Client, interaction: ButtonInteraction) {
  if (interaction.customId.startsWith('giveaway:toggle:')) {
    const giveawayId = interaction.customId.split(':')[2];
    
    logger.info(`User ${interaction.user.id} toggling entry for giveaway ${giveawayId}`);

    await ensureGiveawayIsActive(giveawayId);
    const text = await toggleEntryAndBuildMessage(giveawayId, interaction.user.id);
    await refreshGiveawayMessage(client, giveawayId);
    await interaction.reply({ content: text, ephemeral: true });
  }
}
