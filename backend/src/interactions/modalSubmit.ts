import { ModalSubmitInteraction, Client } from 'discord.js';
import { createGiveawayPost } from '../giveawayService.js';
import { setGuildSettings } from '../db.js';
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
    const claimDeadlineRaw = interaction.fields.getTextInputValue('claim:deadline');
    const claimDeadline = claimDeadlineRaw.trim() || null;

    if (!interaction.guildId || !interaction.channelId) {
      throw new Error('サーバー内テキストチャンネルで実行してください。');
    }

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
      content: `Giveawayを作成しました: ${created.title}${autoRep ? ` (自動作成間隔: ${duration})` : ''}`,
      ephemeral: true
    });
    return;
  }

  if (interaction.customId === 'giveaway:settings') {
    if (!interaction.guildId) throw new Error('Guild not found.');

    const languageValues = interaction.fields.getStringSelectValues('language');
    const language = languageValues[0] ?? 'en';

    const rolesCollection = interaction.fields.getSelectedRoles('giveaway:who');
    const managerRoleIds = rolesCollection ? [...rolesCollection.keys()] : [];

    const channelsCollection = interaction.fields.getSelectedChannels('giveaway:where');
    const giveawayChannelIds = channelsCollection ? [...channelsCollection.keys()] : [];

    const defclaimRaw = interaction.fields.getTextInputValue('defclaim');
    const defaultClaimDeadline = defclaimRaw.trim() || null;

    logger.info(`Updating settings for guild ${interaction.guildId}: lang=${language}, roles=${managerRoleIds.join(',')}, channels=${giveawayChannelIds.join(',')}`);

    await setGuildSettings(interaction.guildId, {
      language,
      managerRoleIds,
      giveawayChannelIds,
      defaultClaimDeadline
    });

    await interaction.reply({
      content: '設定を保存しました。',
      ephemeral: true
    });
    return;
  }
}
