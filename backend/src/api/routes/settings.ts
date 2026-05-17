import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getGuildSettings, setGuildSettings } from '../../db/index.js';
import { AppError } from '../../shared/errors/index.js';
import { getSessionGuild, requireSession } from '../../features/auth/index.js';
import { recordAuditEvent } from '../../features/audit/index.js';
import { settingsSchema } from '../schemas/settings.js';
import { requireParam, respondError } from '../utils/response.js';

export function registerSettingsRoutes(app: Hono): void {
  app.get('/api/settings/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = await requireSession(c);
      getSessionGuild(session, guildId);
      const settings = await getGuildSettings(guildId);
      return c.json({ settings });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.put('/api/settings/:guildId', zValidator('json', settingsSchema), async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = await requireSession(c);
      const guild = getSessionGuild(session, guildId);
      if (!guild.isOwner) {
        throw new AppError(
          'Only server owners can update settings. Please ask the server owner to make this change.',
          403
        );
      }
      const body = c.req.valid('json');
      const current = await getGuildSettings(guildId);
      // Backward compatibility for older clients that still send dashboardViewRoleIds.
      const dashboardUsableRoleIds = body.dashboardUsableRoleIds ?? body.dashboardViewRoleIds;

      await setGuildSettings(guildId, {
        language: body.language ?? current.language,
        giveawayCreatorRoleIds: body.giveawayCreatorRoleIds ?? current.giveawayCreatorRoleIds,
        dashboardUsableRoleIds: dashboardUsableRoleIds ?? current.dashboardUsableRoleIds,
        giveawayChannelIds: body.giveawayChannelIds ?? current.giveawayChannelIds,
        defaultClaimDeadline:
          body.defaultClaimDeadline !== undefined ? body.defaultClaimDeadline : current.defaultClaimDeadline
      });
      await recordAuditEvent({
        guildId,
        actorId: session.user.id,
        action: 'settings.update',
        targetType: 'guild_settings',
        targetId: guildId,
        detail: JSON.stringify({
          language: body.language ?? current.language,
          giveawayCreatorRoleIds: body.giveawayCreatorRoleIds ?? current.giveawayCreatorRoleIds,
          dashboardUsableRoleIds: dashboardUsableRoleIds ?? current.dashboardUsableRoleIds,
          giveawayChannelIds: body.giveawayChannelIds ?? current.giveawayChannelIds,
          defaultClaimDeadline:
            body.defaultClaimDeadline !== undefined ? body.defaultClaimDeadline : current.defaultClaimDeadline
        })
      });
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });
}
