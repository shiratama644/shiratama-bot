import { ModalSubmitInteraction, Client } from 'discord.js';
import { createGiveawayPost } from '../giveaway/index.js';
import { getGuildSettings, setGuildSettings } from '../db/index.js';
import {
  FIELD_CREATE_AUTOREP,
  FIELD_CREATE_DESCRIPTION,
  FIELD_CREATE_DURATION,
  FIELD_CREATE_PRIZE,
  FIELD_CREATE_WINNERS,
  FIELD_SETTINGS_DEFCLAIM,
  FIELD_SETTINGS_LANGUAGE,
  FIELD_SETTINGS_WHERE,
  FIELD_SETTINGS_WHO,
  LANG_EN,
  MODAL_GIVEAWAY_CREATE,
  MODAL_GIVEAWAY_SETTINGS,
  VALUE_AUTOREP_ENABLE
} from '../ids.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../errors.js';
import { t } from '../i18n.js';

export async function handleModalSubmit(client: Client, interaction: ModalSubmitInteraction) {
  if (interaction.customId === MODAL_GIVEAWAY_CREATE) {
    const title = interaction.fields.getTextInputValue(FIELD_CREATE_PRIZE);
    const description = interaction.fields.getTextInputValue(FIELD_CREATE_DESCRIPTION);
    const duration = interaction.fields.getTextInputValue(FIELD_CREATE_DURATION);
    const autoRepValues = interaction.fields.getStringSelectValues(FIELD_CREATE_AUTOREP);
    const autoRep = autoRepValues[0] === VALUE_AUTOREP_ENABLE;
    const winnerCountRaw = interaction.fields.getTextInputValue(FIELD_CREATE_WINNERS);
    const winnerCount = Number.parseInt(winnerCountRaw || '1', 10);

    if (!interaction.guildId || !interaction.channelId) {
      throw new AppError(t('en', 'pleaseRunInTextChannelInServer'), 400);
    }

    const settings = await getGuildSettings(interaction.guildId);
    const language = settings.language;
    const claimDeadline = settings.defaultClaimDeadline ?? null;

    logger.info(`Creating giveaway: ${title} in guild ${interaction.guildId}`);

    const created = await createGiveawayPost({
      client,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      title,
      description,
      deadlineInput: duration,
      winnerCount: Number.isNaN(winnerCount) ? 1 : winnerCount,
      createdBy: interaction.user.id,
      interval: autoRep ? duration : undefined,
      claimDeadline
    });

    await interaction.reply({
      content: t(language, 'giveawayCreated', {
        title: created.title,
        autoRepeatSuffix: autoRep ? t(language, 'autoRepeatSuffix', { duration }) : ''
      }),
      ephemeral: true
    });
    return;
  }

  if (interaction.customId === MODAL_GIVEAWAY_SETTINGS) {
    if (!interaction.guildId) throw new AppError(t('en', 'guildNotFound'), 404);

    const languageValues = interaction.fields.getStringSelectValues(FIELD_SETTINGS_LANGUAGE);
    const language = languageValues[0] ?? LANG_EN;

    const rolesCollection = interaction.fields.getSelectedRoles(FIELD_SETTINGS_WHO);
    const managerRoleIds = rolesCollection ? [...rolesCollection.keys()] : [];

    const channelsCollection = interaction.fields.getSelectedChannels(FIELD_SETTINGS_WHERE);
    const giveawayChannelIds = channelsCollection ? [...channelsCollection.keys()] : [];

    const defclaimRaw = interaction.fields.getTextInputValue(FIELD_SETTINGS_DEFCLAIM);
    const defaultClaimDeadline = defclaimRaw.trim() || null;

    logger.info(`Updating settings for guild ${interaction.guildId}: roles=${managerRoleIds.join(',')}, channels=${giveawayChannelIds.join(',')}`);

    await setGuildSettings(interaction.guildId, {
      managerRoleIds,
      language,
      giveawayChannelIds,
      defaultClaimDeadline
    });

    await interaction.reply({
      content: t(language, 'settingsSaved'),
      ephemeral: true
    });
    return;
  }
}
