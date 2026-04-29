import { ChatInputCommandInteraction, Client, AutocompleteInteraction } from 'discord.js';
import { Command } from './index.js';
import { startGiveawayAutoRepeat } from '../giveawayService.js';
import { getActiveGiveaways } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';
import { ensureGiveawayInGuild } from '../giveawayService.js';

export const gstartCommand: Command = {
  name: 'gstart',
  description: 'Resume auto-repeat for the selected giveaway',
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
    await startGiveawayAutoRepeat(id);
    await interaction.reply({ content: `Giveaway (${id}) auto-repeat has been resumed.`, ephemeral: true });
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
