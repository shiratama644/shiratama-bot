import type { GuildSettings } from '../types.js';
import { getDb, runDb } from './client.js';

export async function getManagerRoleIds(guildId: string): Promise<string[]> {
  const settings = await getGuildSettings(guildId);
  return settings.managerRoleIds;
}

export async function setManagerRoleIds(guildId: string, roleIds: string[]): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('guild_settings')
      .values({
        guild_id: guildId,
        manager_role_ids: roleIds
      })
      .onConflict((oc) =>
        oc.column('guild_id').doUpdateSet({
          manager_role_ids: roleIds
        })
      )
      .execute();
  }, 'setManagerRoleIds');
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return runDb(async () => {
    const row = await getDb()
      .selectFrom('guild_settings')
      .selectAll()
      .where('guild_id', '=', guildId)
      .executeTakeFirst();
    if (!row) {
      return {
        guildId,
        managerRoleIds: [],
        dashboardRoleIds: [],
        language: 'en',
        giveawayChannelIds: [],
        defaultClaimDeadline: null
      };
    }
    return {
      guildId: row.guild_id,
      managerRoleIds: row.manager_role_ids ?? [],
      dashboardRoleIds: row.dashboard_role_ids ?? [],
      language: row.language ?? 'en',
      giveawayChannelIds: row.giveaway_channel_ids ?? [],
      defaultClaimDeadline: row.default_claim_deadline
    };
  }, 'getGuildSettings');
}

export async function setGuildSettings(guildId: string, settings: Partial<Omit<GuildSettings, 'guildId'>>): Promise<void> {
  await runDb(async () => {
    const managerRoleIds = settings.managerRoleIds ?? [];
    const dashboardRoleIds = settings.dashboardRoleIds ?? [];
    const language = settings.language ?? 'en';
    const giveawayChannelIds = settings.giveawayChannelIds ?? [];
    const defaultClaimDeadline = settings.defaultClaimDeadline ?? null;
    await getDb()
      .insertInto('guild_settings')
      .values({
        guild_id: guildId,
        manager_role_ids: managerRoleIds,
        dashboard_role_ids: dashboardRoleIds,
        language,
        giveaway_channel_ids: giveawayChannelIds,
        default_claim_deadline: defaultClaimDeadline
      })
      .onConflict((oc) =>
        oc.column('guild_id').doUpdateSet({
          manager_role_ids: managerRoleIds,
          dashboard_role_ids: dashboardRoleIds,
          language,
          giveaway_channel_ids: giveawayChannelIds,
          default_claim_deadline: defaultClaimDeadline
        })
      )
      .execute();
  }, 'setGuildSettings');
}
