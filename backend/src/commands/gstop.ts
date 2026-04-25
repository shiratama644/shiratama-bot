import { ChatInputCommandInteraction, Client, AutocompleteInteraction } from 'discord.js';
import { Command } from './index.js';
import { stopGiveawayAutoRepeat } from '../giveawayService.js';
import { getActiveGiveaways } from '../db.js';

export const gstopCommand: Command = {
  name: 'gstop',
  description: '選択したGiveawayの自動作成を停止します',
  options: [
    {
      name: 'id',
      description: 'Giveaway ID',
      type: 3,
      required: true,
      autocomplete: true
    }
  ],
  execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
    const id = interaction.options.getString('id', true);
    await stopGiveawayAutoRepeat(id);
    await interaction.reply({ content: `Giveaway (${id}) の自動作成を停止しました。`, ephemeral: true });
  },
  autocomplete: async (interaction: AutocompleteInteraction) => {
    if (!interaction.guildId) return;
    const active = await getActiveGiveaways(interaction.guildId);
    const focusedValue = interaction.options.getFocused();
    const filtered = active.filter(g => g.title.includes(focusedValue) || g.id.includes(focusedValue));
    await interaction.respond(
      filtered.slice(0, 25).map(g => ({ name: `${g.title} (${g.id})`, value: g.id }))
    );
  }
};
