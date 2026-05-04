import {
    ChannelSelectMenuBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    LabelBuilder,
    ModalBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { Command } from './index.js';
import { getGuildSettings } from '../db.js';
import { assertCanManageGiveaways } from './permissions.js';

export const gsettingsCommand: Command = {
    name: 'gsettings',
    description: 'Open settings',
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
                        .setLabel("Language")
                        .setStringSelectMenuComponent(
                            new StringSelectMenuBuilder()
                                .setCustomId("df1519548e2443ffb8fbeee6ef9620e2")
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("English")
                                        .setValue("9ef04cfa6ee749c2ba62b79c80290373")
                                        .setEmoji("🇺🇸")
                                        .setDefault(settings.language !== "5370da38d3b64f50a2da0b0369bde6a3"),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("Japanese")
                                        .setValue("5370da38d3b64f50a2da0b0369bde6a3")
                                        .setEmoji("🇯🇵")
                                        .setDefault(settings.language === "5370da38d3b64f50a2da0b0369bde6a3")
                                )
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Who Can Create a Giveaway")
                        .setRoleSelectMenuComponent(
                            new RoleSelectMenuBuilder()
                                .setCustomId("giveaway:who")
                                .setMinValues(1)
                                .setMaxValues(25)
                                .setDefaultRoles(settings.managerRoleIds)
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
                                .setDefaultChannels(settings.giveawayChannelIds)
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
