import { 
  ChatInputCommandInteraction, 
  Client, 
  ModalBuilder, 
  LabelBuilder,          // 追加
  RoleSelectMenuBuilder  // 追加
} from 'discord.js';
import { Command } from './index.js';
import { getManagerRoleIds } from '../db.js';

export const gsettingsCommand: Command = {
  name: 'gsettings',
  description: '設定画面を開きます',
  execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) return;
    const roleIds = await getManagerRoleIds(interaction.guildId);
    
    const modal = new ModalBuilder()
      .setCustomId('giveaway:settings')
      .setTitle('Giveaway設定');
      
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('select-roles')
      .setPlaceholder('ロールを複数選択してください')
      .setMinValues(1)  // 元の setRequired(false) に合わせ、未選択(クリア)を許容するために 0 に設定
      .setMaxValues(5);

    // 既に設定されているロールがあれば、デフォルトの選択状態としてセットする
    if (roleIds && roleIds.length > 0) {
      roleSelect.setDefaultRoles(roleIds);
    }

    // モーダル用のセレクトメニューは LabelBuilder でラップする
    const label = new LabelBuilder()
      .setLabel('管理ロール')
      .setRoleSelectMenuComponent(roleSelect);
    
    // addComponents ではなく addLabelComponents を使用する
    modal.addLabelComponents(label);
    
    await interaction.showModal(modal);
  }
};