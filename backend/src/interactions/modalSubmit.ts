import { ModalSubmitInteraction, Client } from 'discord.js';
import { createGiveawayPost } from '../giveawayService.js';
import { getGuildSettings, setGuildSettings } from '../db.js';
import { logger } from '../utils/logger.js';

export async function handleModalSubmit(client: Client, interaction: ModalSubmitInteraction) {
  if (interaction.customId === 'giveaway:create') {
    const title = interaction.fields.getTextInputValue('prize');
    const description = interaction.fields.getTextInputValue('description');
    const duration = interaction.fields.getTextInputValue('duration');
    const autoRepValues = interaction.fields.getStringSelectValues('autorep');
    const autoRep = autoRepValues[0] === 'enable';
    const winnerCountRaw = interaction.fields.getTextInputValue('winners');
    const winnerCount = Number.parseInt(winnerCountRaw || '1', 10);

    if (!interaction.guildId || !interaction.channelId) {
      throw new Error('Please run this command in a text channel within a server.');
    }

    const settings = await getGuildSettings(interaction.guildId);
    const claimDeadline = settings.defaultClaimDeadline ?? null;

    logger.info(`Creating giveaway: ${title} in guild ${interaction.guildId}`);

    const created = await createGiveawayPost({
      client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      title,
      description,
      deadlineInput: duration,
      winnerCount: Number.isNaN(winnerCount) ? 1 : winnerCount,
      createdBy: interaction.user.id,
      interval: autoRep ? duration : undefined,
      claimDeadline
    });

    await interaction.reply({
      content: `Giveaway created: ${created.title}${autoRep ? ` (auto-repeat interval: ${duration})` : ''}`,
      ephemeral: true
    });
    return;
  }

  if (interaction.customId === 'giveaway:settings') {
    if (!interaction.guildId) throw new Error('Guild not found.');

    const rolesCollection = interaction.fields.getSelectedRoles('giveaway:who');
    const managerRoleIds = rolesCollection ? [...rolesCollection.keys()] : [];

    const channelsCollection = interaction.fields.getSelectedChannels('giveaway:where');
    const giveawayChannelIds = channelsCollection ? [...channelsCollection.keys()] : [];

    const defclaimRaw = interaction.fields.getTextInputValue('defclaim');
    const defaultClaimDeadline = defclaimRaw.trim() || null;

    logger.info(`Updating settings for guild ${interaction.guildId}: roles=${managerRoleIds.join(',')}, channels=${giveawayChannelIds.join(',')}`);

    await setGuildSettings(interaction.guildId, {
      managerRoleIds,
      giveawayChannelIds,
      defaultClaimDeadline
    });

    await interaction.reply({
      content: 'Settings saved.',
      ephemeral: true
    });
    return;
  }
}
