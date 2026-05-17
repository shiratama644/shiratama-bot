import { getDb, runDb } from './client.js';

export type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'settings.update'
  | 'giveaway.create'
  | 'giveaway.end'
  | 'giveaway.reroll';

export async function insertAuditLog(params: {
  guildId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
}): Promise<void> {
  await runDb(async () => {
    await getDb()
      .insertInto('audit_logs')
      .values({
        id: crypto.randomUUID(),
        guild_id: params.guildId ?? null,
        actor_id: params.actorId ?? null,
        action: params.action,
        target_type: params.targetType ?? null,
        target_id: params.targetId ?? null,
        detail: params.detail ?? null
      })
      .execute();
  }, 'insertAuditLog');
}
