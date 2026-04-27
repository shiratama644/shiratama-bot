import { ActionRowBuilder, ChatInputCommandInteraction, Client, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Command } from './index.js';
import { getManagerRoleIds } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';

export const gsettingsCommand: Command = {
  name: 'gsettings',
  description: '設定画面を開きます',
  execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
    await assertCanManageGiveaways(interaction);
    if (!interaction.guildId) return;
    const roleIds = await getManagerRoleIds(interaction.guildId);
    
    const modal = new ModalBuilder()
      .setCustomId('giveaway:settings')
      .setTitle('Giveaway設定');

    const roleIdsInput = new TextInputBuilder()
      .setCustomId('roleIds')
      .setLabel('管理ロールID (カンマ区切り)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    if (roleIds.length > 0) {
      roleIdsInput.setValue(roleIds.join(','));
    }

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdsInput));
    
    await interaction.showModal(modal);
  }
};
