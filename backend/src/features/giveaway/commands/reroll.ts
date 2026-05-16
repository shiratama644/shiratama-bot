import { ChatInputCommandInteraction, Client, AutocompleteInteraction } from 'discord.js';
import { Command } from './index.js';
import { ensureGiveawayInGuild, rerollGiveaway } from '../index.js';
import { getEndedGiveaways, getGuildSettings } from '../../../db/index.js';
import { assertCanManageGiveaways } from '../permissions.js';
import { t } from '../../../shared/i18n/index.js';

export const rerollCommand: Command = {
  name: 'greroll',
  description: 'Reroll an ended giveaway',
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
    const settings = await getGuildSettings(interaction.guildId);
    await interaction.reply({ content: t(settings.language, 'giveawayRerolled', { id }), ephemeral: true });
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
