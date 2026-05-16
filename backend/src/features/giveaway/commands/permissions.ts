import type { ChatInputCommandInteraction } from 'discord.js';
import { getGiveawayCreatorRoleIds, getGuildSettings } from '../../../db/index.js';
import { AppError } from '../../../shared/errors/index.js';
import { DEFAULT_LANGUAGE, t } from '../../../shared/i18n/index.js';

export function hasAnyRequiredRole(memberRoleIds: ReadonlySet<string>, requiredRoleIds: readonly string[]): boolean {
  return requiredRoleIds.some((roleId) => memberRoleIds.has(roleId));
}

export async function assertCanManageGiveaways(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    throw new AppError(t(DEFAULT_LANGUAGE, 'pleaseRunInServer'), 400);
  }

  const settings = await getGuildSettings(interaction.guildId);
  const language = settings.language;
  const giveawayCreatorRoleIds = await getGiveawayCreatorRoleIds(interaction.guildId);
  if (giveawayCreatorRoleIds.length === 0) {
    return;
  }

  const memberRoles = interaction.member?.roles;
  if (!memberRoles || Array.isArray(memberRoles)) {
    throw new AppError(t(language, 'couldNotRetrieveRoleInfo'), 403);
  }

  const hasRole = hasAnyRequiredRole(new Set(memberRoles.cache.keys()), giveawayCreatorRoleIds);
  if (!hasRole) {
    throw new AppError(t(language, 'noPermissionManageGiveaways'), 403);
  }
}
