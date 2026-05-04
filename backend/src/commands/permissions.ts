import type { ChatInputCommandInteraction } from 'discord.js';
import { getManagerRoleIds } from '../db.js';
import { AppError } from '../errors.js';

export function hasAnyRequiredRole(memberRoleIds: ReadonlySet<string>, requiredRoleIds: readonly string[]): boolean {
  return requiredRoleIds.some((roleId) => memberRoleIds.has(roleId));
}

export async function assertCanManageGiveaways(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    throw new AppError('Please run this command in a server.', 400);
  }

  const managerRoleIds = await getManagerRoleIds(interaction.guildId);
  if (managerRoleIds.length === 0) {
    return;
  }

  const memberRoles = interaction.member?.roles;
  if (!memberRoles || Array.isArray(memberRoles)) {
    throw new AppError('Could not retrieve role information.', 403);
  }

  const hasRole = hasAnyRequiredRole(new Set(memberRoles.cache.keys()), managerRoleIds);
  if (!hasRole) {
    throw new AppError('You do not have permission to manage giveaways.', 403);
  }
}
