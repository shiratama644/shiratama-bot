import type { Client } from 'discord.js';
import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getGiveaway,
  getGuildGiveaways,
  getGuildSettings
} from '../../db/index.js';
import { AppError } from '../../shared/errors/index.js';
import { getSessionGuild, requireSession } from '../../features/auth/index.js';
import { recordAuditEvent } from '../../features/audit/index.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from '../../features/giveaway/index.js';
import {
  createIdempotencyRecord,
  getIdempotencyRecord,
  setIdempotencyGiveawayId
} from '../../redis/idempotency.js';
import { createSchema, guildBodySchema } from '../schemas/giveaway.js';
import { requireParam, respondError } from '../utils/response.js';

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const MAX_GIVEAWAY_USER_LOOKUP_IDS = 100;
const giveawayUserLookupSchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .refine((ids) => ids.length > 0, 'At least one user id is required.')
    .refine((ids) => ids.length <= MAX_GIVEAWAY_USER_LOOKUP_IDS, 'Too many user ids requested.')
});

async function resolveGiveawayUsers(client: Client, guildId: string, userIds: string[]) {
  const requestedIds = [...new Set(userIds)];
  if (requestedIds.length === 0) {
    return [];
  }

  const giveaways = await getGuildGiveaways(guildId);
  const allowedIds = new Set<string>();
  for (const giveaway of giveaways) {
    allowedIds.add(giveaway.createdBy);
    for (const winnerId of giveaway.winners) {
      allowedIds.add(winnerId);
    }
  }

  const visibleIds = requestedIds.filter((id) => allowedIds.has(id));
  const users = await Promise.all(
    visibleIds.map(async (id) => {
      const user = await client.users.fetch(id).catch(() => null);
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        name: user.globalName ?? user.username,
        avatarUrl: user.displayAvatarURL({ size: 64, extension: 'png' })
      };
    })
  );

  return users.filter((user): user is NonNullable<typeof user> => user !== null);
}

async function resolveIdempotentGiveaway(
  key: string,
  actorId: string,
  guildId: string
) {
  const existing = await getIdempotencyRecord(key);
  if (!existing) {
    return null;
  }
  if (existing.actorId !== actorId || existing.guildId !== guildId) {
    throw new AppError('This idempotency key is already used by another request.', 409);
  }
  if (!existing.giveawayId) {
    throw new AppError('A request with the same idempotency key is still processing.', 409);
  }
  return getGiveaway(existing.giveawayId);
}

export function registerGiveawayRoutes(app: Hono, client: Client): void {
  app.get('/api/giveaways/:guildId', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = await requireSession(c);
      getSessionGuild(session, guildId);
      const giveaways = await getGuildGiveaways(guildId);
      return c.json({ giveaways });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.get('/api/giveaways/:guildId/users', async (c) => {
    try {
      const guildId = requireParam(c.req.param('guildId'), 'guildId');
      const session = await requireSession(c);
      getSessionGuild(session, guildId);
      const query = giveawayUserLookupSchema.parse({
        ids: c.req.query('ids') ?? ''
      });
      const users = await resolveGiveawayUsers(client, guildId, query.ids);
      return c.json({ users });
    } catch (error) {
      return respondError(c, error);
    }
  });

  app.post('/api/giveaways', zValidator('json', createSchema), async (c) => {
    try {
      const session = await requireSession(c);
      const body = c.req.valid('json');
      const idempotencyKey = c.req.header('idempotency-key')?.trim() ?? '';
      if (idempotencyKey && idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
        throw new AppError('Idempotency key is too long.', 400);
      }
      const guild = getSessionGuild(session, body.guildId);
      if (!guild.canCreateGiveaway) {
        throw new AppError('You do not have permission to create giveaways.', 403);
      }

      if (idempotencyKey) {
        const existingGiveaway = await resolveIdempotentGiveaway(idempotencyKey, session.user.id, body.guildId);
        if (existingGiveaway) {
          return c.json({ giveaway: existingGiveaway });
        }

        const createdRecord = await createIdempotencyRecord(idempotencyKey, session.user.id, body.guildId);
        if (!createdRecord) {
          const collidedGiveaway = await resolveIdempotentGiveaway(idempotencyKey, session.user.id, body.guildId);
          if (collidedGiveaway) {
            return c.json({ giveaway: collidedGiveaway });
          }
          throw new AppError('A request with the same idempotency key is already being processed.', 409);
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
      const session = await requireSession(c);
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
      const session = await requireSession(c);
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
