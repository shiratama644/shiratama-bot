import {
    ChannelSelectMenuBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    LabelBuilder,
    ModalBuilder,
    RoleSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { Command } from './index.js';
import { getGuildSettings } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';

export const gsettingsCommand: Command = {
    name: 'gsettings',
    description: 'Open the settings panel',
    execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
        await assertCanManageGiveaways(interaction);
        if (!interaction.guildId) return;
        const settings = await getGuildSettings(interaction.guildId);

        await interaction.showModal(
            new ModalBuilder()
                .setTitle("Giveaway Settings")
                .setCustomId("giveaway:settings")
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Who Can Create a Giveaway")
                        .setRoleSelectMenuComponent(
                            new RoleSelectMenuBuilder()
                                .setCustomId("giveaway:who")
                                .setMinValues(1)
                                .setMaxValues(25)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Where Can We Create a Giveaway?")
                        .setChannelSelectMenuComponent(
                            new ChannelSelectMenuBuilder()
                                .setCustomId("giveaway:where")
                                .setMinValues(1)
                                .setMaxValues(25)
                                .setChannelTypes([ChannelType.GuildText])
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Default Claim Deadline")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("defclaim")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("10m, 1h, 3d, 1w")
                                .setRequired(false)
                                .setValue(settings.defaultClaimDeadline ?? '')
                        )
                )
        );
    }
};
