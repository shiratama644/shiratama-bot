import { ActionRowBuilder, ChatInputCommandInteraction, Client, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Command } from './index.js';
import { getManagerRoleIds } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';

export const gsettingsCommand: Command = {
    name: 'gsettings',
    description: '設定画面を開きます',
    execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
        await assertCanManageGiveaways(interaction);
        if (!interaction.guildId) return;
        const roleIds = await getManagerRoleIds(interaction.guildId);

        interaction.showModal(
            new ModalBuilder()
                .setTitle("Modal")
                .setCustomId("modal")
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Language")
                        .setStringSelectMenuComponent(
                            new StringSelectMenuBuilder()
                                .setCustomId("language")
                                .setMinValues(1)
                                .setMaxValues(1)
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("English")
                                        .setValue("en")
                                        .setDefault(true),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("日本語")
                                        .setValue("ja")
                                )
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Who Can create a Giveaway")
                        .setRoleSelectMenuComponent(
                            new RoleSelectMenuBuilder()
                                .setCustomId("giveaway:who")
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Where can we create a giveaway?")
                        .setChannelSelectMenuComponent(
                            new ChannelSelectMenuBuilder()
                                .setCustomId("giveaway:where")
                                .setMinValues(1)
                                .setChannelTypes([0])
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Default claim deadline")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("defclaim")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("10m, 1h, 3d, 1w")
                                .setMinLength(1)
                        )
                )
        )

        if (roleIds.length > 0) {
            roleIdsInput.setValue(roleIds.join(','));
        }

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdsInput));

        await interaction.showModal(modal);
    }
};
