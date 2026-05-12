import {
    ChatInputCommandInteraction,
    Client,
    LabelBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { Command } from './index.js';
import { assertCanManageGiveaways } from './permissions.js';
import { getGuildSettings } from '../db/index.js';
import {
    FIELD_CREATE_AUTOREP,
    FIELD_CREATE_DESCRIPTION,
    FIELD_CREATE_DURATION,
    FIELD_CREATE_PRIZE,
    FIELD_CREATE_WINNERS,
    MODAL_GIVEAWAY_CREATE,
    VALUE_AUTOREP_DISABLE,
    VALUE_AUTOREP_ENABLE,
    VALUE_DEFAULT_WINNERS
} from '../ids.js';
import { t } from '../i18n.js';

export const gcCommand: Command = {
    name: 'gc',
    description: 'Open giveaway creation form',
    execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
        await assertCanManageGiveaways(interaction);
        const settings = interaction.guildId ? await getGuildSettings(interaction.guildId) : null;
        const language = settings?.language;

        interaction.showModal(
            new ModalBuilder()
                .setTitle(t(language, 'giveawayCreateTitle'))
                .setCustomId(MODAL_GIVEAWAY_CREATE)
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'prize'))
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_PRIZE)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(t(language, 'prizePlaceholder'))
                                .setMinLength(1)
                        )
                )

                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'autoRepeating'))
                        .setStringSelectMenuComponent(
                            new StringSelectMenuBuilder()
                                .setCustomId(FIELD_CREATE_AUTOREP)
                                .setMinValues(1)
                                .setMaxValues(1)
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(t(language, 'disable'))
                                        .setValue(VALUE_AUTOREP_DISABLE),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(t(language, 'enable'))
                                        .setValue(VALUE_AUTOREP_ENABLE)
                                )
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'durationInterval'))
                        .setDescription(t(language, 'durationIntervalDescription'))
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_DURATION)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(t(language, 'durationIntervalPlaceholder'))
                                .setMinLength(1)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'numberOfWinners'))
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_WINNERS)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(VALUE_DEFAULT_WINNERS)
                                .setValue(VALUE_DEFAULT_WINNERS)
                                .setMinLength(1)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'description'))
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_DESCRIPTION)
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(false)
                        )
                )
        )
    }
};
