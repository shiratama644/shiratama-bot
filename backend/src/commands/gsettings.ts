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
import { getGuildSettings } from '../db/index.js';
import { assertCanManageGiveaways } from './permissions.js';
import {
    FIELD_SETTINGS_DEFCLAIM,
    FIELD_SETTINGS_LANGUAGE,
    FIELD_SETTINGS_WHERE,
    FIELD_SETTINGS_WHO,
    LANG_EN,
    LANG_JA,
    MODAL_GIVEAWAY_SETTINGS
} from '../ids.js';
import { t } from '../i18n.js';

export const gsettingsCommand: Command = {
    name: 'gsettings',
    description: 'Open settings',
    execute: async (client: Client, interaction: ChatInputCommandInteraction) => {
        await assertCanManageGiveaways(interaction);
        if (!interaction.guildId) return;
        const settings = await getGuildSettings(interaction.guildId);
        const language = settings.language;

        await interaction.showModal(
            new ModalBuilder()
                .setTitle(t(language, 'giveawaySettingsTitle'))
                .setCustomId(MODAL_GIVEAWAY_SETTINGS)
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'language'))
                        .setStringSelectMenuComponent(
                            new StringSelectMenuBuilder()
                                .setCustomId(FIELD_SETTINGS_LANGUAGE)
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(t(language, 'english'))
                                        .setValue(LANG_EN)
                                        .setEmoji("🇺🇸")
                                        .setDefault(settings.language !== LANG_JA),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(t(language, 'japanese'))
                                        .setValue(LANG_JA)
                                        .setEmoji("🇯🇵")
                                        .setDefault(settings.language === LANG_JA)
                                )
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'whoCanCreateGiveaway'))
                        .setRoleSelectMenuComponent(
                            new RoleSelectMenuBuilder()
                                .setCustomId(FIELD_SETTINGS_WHO)
                                .setMinValues(1)
                                .setMaxValues(25)
                                .setDefaultRoles(settings.managerRoleIds)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'whereCanCreateGiveaway'))
                        .setChannelSelectMenuComponent(
                            new ChannelSelectMenuBuilder()
                                .setCustomId(FIELD_SETTINGS_WHERE)
                                .setMinValues(1)
                                .setMaxValues(25)
                                .setChannelTypes([ChannelType.GuildText])
                                .setDefaultChannels(settings.giveawayChannelIds)
                        )
                )
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel(t(language, 'defaultClaimDeadline'))
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId(FIELD_SETTINGS_DEFCLAIM)
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder(t(language, 'defaultClaimDeadlinePlaceholder'))
                                .setRequired(false)
                                .setValue(settings.defaultClaimDeadline ?? '')
                        )
                )
        );
    }
};
