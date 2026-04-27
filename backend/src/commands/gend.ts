import { ChatInputCommandInteraction, Client, AutocompleteInteraction } from 'discord.js';
import { Command } from './index.js';
import { endGiveaway } from '../giveawayService.js';
import { getActiveGiveaways } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';
import { ensureGiveawayInGuild } from '../giveawayService.js';

export const gendCommand: Command = {
  name: 'gend',
  description: '選択したGiveawayを手動で終了します',
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
    await endGiveaway(client, id);
    await interaction.reply({ content: `Giveaway (${id}) を終了しました。`, ephemeral: true });
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
