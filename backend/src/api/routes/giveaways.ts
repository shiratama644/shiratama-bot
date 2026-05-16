import type { Client } from 'discord.js';
import type { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getGiveaway, getGuildGiveaways, getGuildSettings } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from '../../giveaway/index.js';
import { createSchema, getSessionGuild, guildBodySchema, requireParam, respondError } from '../shared.js';
import { requireSession } from '../session.js';

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
      const guild = getSessionGuild(session, body.guildId);
      if (!guild.canCreateGiveaway) {
        throw new AppError('You do not have permission to create giveaways.', 403);
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
      return c.json({ winners });
    } catch (error) {
      return respondError(c, error);
    }
  });
}
