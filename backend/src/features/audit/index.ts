import { insertAuditLog, type AuditAction } from '../../db/index.js';
import { logger } from '../../shared/logger/index.js';

export async function recordAuditEvent(params: {
  guildId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await insertAuditLog(params);
  } catch (error) {
    logger.error('Failed to record audit event', error, params);
  }
}
