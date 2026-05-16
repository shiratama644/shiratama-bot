import type { GuildSettings } from '../types.js';
import { getDb, runDb } from './client.js';

export async function getGiveawayCreatorRoleIds(guildId: string): Promise<string[]> {
  const settings = await getGuildSettings(guildId);
  return settings.giveawayCreatorRoleIds;
}

export async function setGiveawayCreatorRoleIds(guildId: string, roleIds: string[]): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('guild_settings')
      .values({
        guild_id: guildId,
        giveaway_creator_role_ids: roleIds
      })
      .onConflict((oc) =>
        oc.column('guild_id').doUpdateSet({
          giveaway_creator_role_ids: roleIds
        })
      )
      .execute();
  }, 'setGiveawayCreatorRoleIds');
}

export const getManagerRoleIds = getGiveawayCreatorRoleIds;
export const setManagerRoleIds = setGiveawayCreatorRoleIds;

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
        giveawayCreatorRoleIds: [],
        dashboardUsableRoleIds: [],
        language: 'en',
        giveawayChannelIds: [],
        defaultClaimDeadline: null
      };
    }
    return {
      guildId: row.guild_id,
      giveawayCreatorRoleIds: row.giveaway_creator_role_ids ?? row.manager_role_ids ?? [],
      dashboardUsableRoleIds: row.dashboard_view_role_ids ?? [],
      language: row.language ?? 'en',
      giveawayChannelIds: row.giveaway_channel_ids ?? [],
      defaultClaimDeadline: row.default_claim_deadline
    };
  }, 'getGuildSettings');
}

export async function setGuildSettings(guildId: string, settings: Partial<Omit<GuildSettings, 'guildId'>>): Promise<void> {
  await runDb(async () => {
    const giveawayCreatorRoleIds = settings.giveawayCreatorRoleIds ?? [];
    const dashboardUsableRoleIds = settings.dashboardUsableRoleIds ?? [];
    const language = settings.language ?? 'en';
    const giveawayChannelIds = settings.giveawayChannelIds ?? [];
    const defaultClaimDeadline = settings.defaultClaimDeadline ?? null;
    await getDb()
      .insertInto('guild_settings')
      .values({
        guild_id: guildId,
        giveaway_creator_role_ids: giveawayCreatorRoleIds,
        dashboard_view_role_ids: dashboardUsableRoleIds,
        language,
        giveaway_channel_ids: giveawayChannelIds,
        default_claim_deadline: defaultClaimDeadline
      })
      .onConflict((oc) =>
        oc.column('guild_id').doUpdateSet({
          giveaway_creator_role_ids: giveawayCreatorRoleIds,
          dashboard_view_role_ids: dashboardUsableRoleIds,
          language,
          giveaway_channel_ids: giveawayChannelIds,
          default_claim_deadline: defaultClaimDeadline
        })
      )
      .execute();
  }, 'setGuildSettings');
}
