import { 
  ChatInputCommandInteraction, 
  Client, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder 
} from 'discord.js';
import { Command } from './index.js';

export const gcCommand: Command = {
  name: 'gc',
  description: 'Giveaway作成フォームを開きます',
  execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
    const modal = new ModalBuilder().setCustomId('giveaway:create').setTitle('Giveaway作成');

    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('題名 (必須)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('説明')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    const deadlineInput = new TextInputBuilder()
      .setCustomId('deadline')
      .setLabel('期限 (必須: 2026/04/22, 10m, 10h, 5d)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('2026/01/01 または 10m');

    const intervalInput = new TextInputBuilder()
      .setCustomId('interval')
      .setLabel('自動作成間隔 (例: 1d, 12h)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('空欄で自動作成なし');

    const winnerCountInput = new TextInputBuilder()
      .setCustomId('winnerCount')
      .setLabel('当たり人数 (整数)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('1');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(deadlineInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(intervalInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(winnerCountInput)
    );

    await interaction.showModal(modal);
  }
};
