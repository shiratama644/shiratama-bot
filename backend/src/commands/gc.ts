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

export const gcCommand: Command = {
    name: 'gc',
    description: 'Giveaway作成フォームを開きます',
    execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
        await assertCanManageGiveaways(interaction);

        interaction.showModal(
            new ModalBuilder()
                .setTitle("Giveaway Create")
                .setCustomId("giveaway:create")
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Prize")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("prize")
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
                                .setCustomId("autorep")
                                .setMinValues(1)
                                .setMaxValues(1)
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("Disable")
                                        .setValue("disable"),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("Enable")
                                        .setValue("enable")
                                )
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Duration (Interval)")
                        .setDescription("If Auto Repeating is enabled, you need to enter an Interval here.")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("duration")
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
                                .setCustomId("winners")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("1")
                                .setValue("1")
                                .setMinLength(1)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Claim Deadline")
                        .setDescription("If you don't enter anything, the default settings will be applied.")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("claim:deadline")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("def, 10m, 6h, 7d, 8w etc..")
                                .setRequired(false)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Description")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("description")
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(false)
                        )
                )
        )
    }
};
