import type { AutocompleteInteraction } from 'discord.js';

type AutocompleteGiveaway = {
  id: string;
  title: string;
};

export async function respondGiveawayAutocomplete(
  interaction: AutocompleteInteraction,
  giveaways: readonly AutocompleteGiveaway[]
): Promise<void> {
  const focusedValue = interaction.options.getFocused();
  const filtered = giveaways.filter((giveaway) =>
    giveaway.title.includes(focusedValue) || giveaway.id.includes(focusedValue)
  );

  await interaction.respond(
    filtered.slice(0, 25).map((giveaway) => ({
      name: `${giveaway.title} (${giveaway.id})`,
      value: giveaway.id
    }))
  );
}
