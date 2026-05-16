import { ChatInputCommandInteraction, Client, AutocompleteInteraction } from 'discord.js';
import { Command } from './index.js';
import { stopGiveawayAutoRepeat } from '../index.js';
import { getActiveGiveaways, getGuildSettings } from '../../../db/index.js';
import { assertCanManageGiveaways } from '../permissions.js';
import { ensureGiveawayInGuild } from '../index.js';
import { t } from '../../../shared/i18n/index.js';
import { respondGiveawayAutocomplete } from './autocomplete.js';

export const stopCommand: Command = {
  name: 'gstop',
  description: 'Stop auto-repeat for the selected giveaway',
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
    await stopGiveawayAutoRepeat(id);
    const settings = await getGuildSettings(interaction.guildId);
    await interaction.reply({ content: t(settings.language, 'giveawayAutoRepeatStopped', { id }), ephemeral: true });
  },
  autocomplete: async (interaction: AutocompleteInteraction) => {
    if (!interaction.guildId) return;
    const active = await getActiveGiveaways(interaction.guildId);
    await respondGiveawayAutocomplete(interaction, active);
  }
};
