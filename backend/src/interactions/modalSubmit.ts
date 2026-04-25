import { ModalSubmitInteraction, Client } from 'discord.js';
import { createGiveawayPost } from '../giveawayService.js';
import { setManagerRoleIds } from '../db.js';
import { logger } from '../utils/logger.js';

export async function handleModalSubmit(client: Client, interaction: ModalSubmitInteraction) {
  if (interaction.customId === 'giveaway:create') {
    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const deadline = interaction.fields.getTextInputValue('deadline');
    const interval = interaction.fields.getTextInputValue('interval');
    const winnerCountRaw = interaction.fields.getTextInputValue('winnerCount');
    const winnerCount = Number.parseInt(winnerCountRaw || '1', 10);

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
      deadlineInput: deadline,
      winnerCount: Number.isNaN(winnerCount) ? 1 : winnerCount,
      createdBy: interaction.user.id,
      interval: interval || undefined
    });

    await interaction.reply({
      content: `Giveawayを作成しました: ${created.title}${interval ? ` (自動作成間隔: ${interval})` : ''}`,
      ephemeral: true
    });
    return;
  }

  if (interaction.customId === 'giveaway:settings') {
    const roleIdsRaw = interaction.fields.getTextInputValue('roleIds');
    const roleIds = roleIdsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    
    if (!interaction.guildId) throw new Error('Guild not found.');
    
    logger.info(`Updating settings for guild ${interaction.guildId}: roles=${roleIds.join(',')}`);
    await setManagerRoleIds(interaction.guildId, roleIds);

    await interaction.reply({
      content: '設定を保存しました。',
      ephemeral: true
    });
    return;
  }
}
