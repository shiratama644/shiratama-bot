import type { Client } from 'discord.js';
import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createIdempotencyRecord,
  getGiveaway,
  getGuildGiveaways,
  getGuildSettings,
  getIdempotencyRecord,
  setIdempotencyGiveawayId
} from '../../db/index.js';
import { AppError } from '../../shared/errors/index.js';
import { getSessionGuild, requireSession } from '../../features/auth/index.js';
import { recordAuditEvent } from '../../features/audit/index.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from '../../features/giveaway/index.js';
import { createSchema, guildBodySchema } from '../schemas/giveaway.js';
import { requireParam, respondError } from '../utils/response.js';

export function registerGiveawayRoutes(app: Hono, client: Client): void {
  app.get('/api/giveaways/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = requireSession(c);
      getSessionGuild(session, guildId);
      const giveaways = await getGuildGiveaways(guildId);
      return c.json({ giveaways });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways', zValidator('json', createSchema), async (c) => {
    try {
      const session = requireSession(c);
      const body = c.req.valid('json');
      const idempotencyKey = c.req.header('idempotency-key')?.trim() ?? '';
      const guild = getSessionGuild(session, body.guildId);
      if (!guild.canCreateGiveaway) {
        throw new AppError('You do not have permission to create giveaways.', 403);
      }

      if (idempotencyKey && idempotencyKey.length > 128) {
        throw new AppError('Idempotency key is too long.', 400);
      }

      if (idempotencyKey) {
        const existing = await getIdempotencyRecord(idempotencyKey);
        if (existing) {
          if (existing.actorId !== session.user.id || existing.guildId !== body.guildId) {
            throw new AppError('This idempotency key is already used by another request.', 409);
          }
          if (!existing.giveawayId) {
            throw new AppError('A request with the same idempotency key is still processing.', 409);
          }
          const existingGiveaway = await getGiveaway(existing.giveawayId);
          if (existingGiveaway) {
            return c.json({ giveaway: existingGiveaway });
          }
        } else {
          const createdRecord = await createIdempotencyRecord(idempotencyKey, session.user.id, body.guildId);
          if (!createdRecord) {
            throw new AppError('A request with the same idempotency key is already being processed.', 409);
          }
        }
      }

      const settings = await getGuildSettings(body.guildId);
      if (!settings.giveawayChannelIds.includes(body.channelId)) {
        throw new AppError('This channel is not allowed for giveaway creation.', 403);
      }

      const created = await createGiveawayPost({
        client,
        guildId: body.guildId,
        channelId: body.channelId,
        title: body.title,
        description: body.description,
        deadlineInput: body.deadline,
        winnerCount: body.winnerCount,
        createdBy: session.user.id,
        interval: body.autoRepeat ? body.deadline : undefined,
        claimDeadline: settings.defaultClaimDeadline
      });
      if (idempotencyKey) {
        await setIdempotencyGiveawayId(idempotencyKey, created.id);
      }
      await recordAuditEvent({
        guildId: body.guildId,
        actorId: session.user.id,
        action: 'giveaway.create',
        targetType: 'giveaway',
        targetId: created.id,
        detail: JSON.stringify({
          channelId: body.channelId,
          title: body.title,
          winnerCount: body.winnerCount,
          autoRepeat: Boolean(body.autoRepeat)
        })
      });
      return c.json({ giveaway: created });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways/:id/end', zValidator('json', guildBodySchema), async (c) => {
    try {
      const session = requireSession(c);
      const guildId = c.req.valid('json').guildId;
      getSessionGuild(session, guildId);
      const id = requireParam(c.req.param('id'), 'id');
      const giveaway = await getGiveaway(id);
      if (!giveaway) {
        throw new AppError('Giveaway not found.', 404);
      }
      if (giveaway.guildId !== guildId) {
        throw new AppError('You cannot manage giveaways from other servers.', 403);
      }
      await endGiveaway(client, id);
      await recordAuditEvent({
        guildId,
        actorId: session.user.id,
        action: 'giveaway.end',
        targetType: 'giveaway',
        targetId: id
      });
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways/:id/reroll', zValidator('json', guildBodySchema), async (c) => {
    try {
      const session = requireSession(c);
      const guildId = c.req.valid('json').guildId;
      getSessionGuild(session, guildId);
      const id = requireParam(c.req.param('id'), 'id');
      const giveaway = await getGiveaway(id);
      if (!giveaway) {
        throw new AppError('Giveaway not found.', 404);
      }
      if (giveaway.guildId !== guildId) {
        throw new AppError('You cannot manage giveaways from other servers.', 403);
      }
      const winners = await rerollGiveaway(client, id);
      await recordAuditEvent({
        guildId,
        actorId: session.user.id,
        action: 'giveaway.reroll',
        targetType: 'giveaway',
        targetId: id,
        detail: JSON.stringify({ winnerCount: winners.length })
      });
      return c.json({ winners });
    } catch (error) {
      return respondError(c, error);
    }
  });
}
