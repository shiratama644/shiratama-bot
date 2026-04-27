import { ChatInputCommandInteraction, Client, AutocompleteInteraction } from 'discord.js';
import { Command } from './index.js';
import { ensureGiveawayInGuild, rerollGiveaway } from '../giveawayService.js';
import { getEndedGiveaways } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';

export const grerollCommand: Command = {
  name: 'greroll',
  description: '終了したGiveawayを再抽選します',
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
    await assertCanManageGiveaways(interaction);
    if (!interaction.guildId) {
      return;
    }
    const id = interaction.options.getString('id', true);
    await ensureGiveawayInGuild(id, interaction.guildId);
    await rerollGiveaway(client, id);
    await interaction.reply({ content: `Giveaway (${id}) を再抽選しました。`, ephemeral: true });
  },
  autocomplete: async (interaction: AutocompleteInteraction) => {
    if (!interaction.guildId) return;
    const ended = await getEndedGiveaways(interaction.guildId);
    const focusedValue = interaction.options.getFocused();
    const filtered = ended.filter(g => g.title.includes(focusedValue) || g.id.includes(focusedValue));
    await interaction.respond(
      filtered.slice(0, 25).map(g => ({ name: `${g.title} (${g.id})`, value: g.id }))
    );
  }
};
