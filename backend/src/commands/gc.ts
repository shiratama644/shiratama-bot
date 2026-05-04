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
import {
    FIELD_CREATE_AUTOREP,
    FIELD_CREATE_DESCRIPTION,
    FIELD_CREATE_DURATION,
    FIELD_CREATE_PRIZE,
    FIELD_CREATE_WINNERS,
    MODAL_GIVEAWAY_CREATE,
    VALUE_AUTOREP_DISABLE,
    VALUE_AUTOREP_ENABLE
} from '../ids.js';

export const gcCommand: Command = {
    name: 'gc',
    description: 'Open giveaway creation form',
    execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
        await assertCanManageGiveaways(interaction);

        interaction.showModal(
            new ModalBuilder()
                .setTitle("Giveaway Create")
                .setCustomId(MODAL_GIVEAWAY_CREATE)
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Prize")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_PRIZE)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("10M etc..")
                                .setMinLength(1)
                        )
                )

                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Auto Repeating")
                        .setStringSelectMenuComponent(
                            new StringSelectMenuBuilder()
                                .setCustomId(FIELD_CREATE_AUTOREP)
                                .setMinValues(1)
                                .setMaxValues(1)
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("Disable")
                                        .setValue(VALUE_AUTOREP_DISABLE),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("Enable")
                                        .setValue(VALUE_AUTOREP_ENABLE)
                                )
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Duration (Interval)")
                        .setDescription("If Auto Repeating is enabled, you need to enter an Interval here.")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_DURATION)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(">= 1m, 1h, 1d10m etc..")
                                .setMinLength(1)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Number of Winners")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_CREATE_WINNERS)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("1")
                                .setValue("1")
                                .setMinLength(1)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Description")
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
