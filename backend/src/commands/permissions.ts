import type { ChatInputCommandInteraction } from 'discord.js';
import { getManagerRoleIds } from '../db.js';
import { AppError } from '../errors.js';

export function hasAnyRequiredRole(memberRoleIds: ReadonlySet<string>, requiredRoleIds: readonly string[]): boolean {
  return requiredRoleIds.some((roleId) => memberRoleIds.has(roleId));
}

export async function assertCanManageGiveaways(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    throw new AppError('サーバー内で実行してください。', 400);
  }

  const managerRoleIds = await getManagerRoleIds(interaction.guildId);
  if (managerRoleIds.length === 0) {
    return;
  }

  const memberRoles = interaction.member?.roles;
  if (!memberRoles || Array.isArray(memberRoles)) {
    throw new AppError('ロール情報を取得できません。', 403);
  }

  const hasRole = hasAnyRequiredRole(new Set(memberRoles.cache.keys()), managerRoleIds);
  if (!hasRole) {
    throw new AppError('Giveaway操作権限がありません。', 403);
  }
}
