import express, { Request, Response, RequestHandler } from 'express';
import {
  getGiveaway,
  getActiveGiveaways,
  getManagerRoleIds,
  setManagerRoleIds
} from './db/index.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from './giveaway/index.js';
import type { Client } from 'discord.js';
import { z } from 'zod';
import { AppError, getErrorMessage, getErrorStatusCode } from './errors.js';

const rolesSchema = z.object({
  roleIds: z.array(z.string().min(1))
});

const createSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline: z.string().min(1),
  winnerCount: z.number().int().min(1)
});
const guildBodySchema = z.object({ guildId: z.string().min(1) });

function requireAdminToken(req: Request): void {
  const adminToken = process.env.ADMIN_API_TOKEN;
  if (!adminToken) {
    throw new AppError('ADMIN_API_TOKEN is not set.', 500);
  }
  if (req.header('x-admin-token') !== adminToken) {
    throw new AppError('Invalid admin token.', 401);
  }
}

function requireParamString(req: Request, key: string): string {
  const value = req.params[key];
  if (!value || Array.isArray(value)) {
    throw new AppError(`Invalid route parameter: ${key}`, 400);
  }
  return value;
}

export function createApiServer(client: Client) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = req.header('origin');
    const adminToken = process.env.ADMIN_API_TOKEN;
    if (allowedOrigin) {
      if (!requestOrigin) {
        if (!adminToken || req.header('x-admin-token') !== adminToken) {
          res.status(403).json({ error: 'Origin header is required.' });
          return;
        }
      }
      if (requestOrigin && requestOrigin !== allowedOrigin) {
        res.status(403).json({ error: 'Origin not allowed.' });
        return;
      }
    }

    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-user-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    }

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    next();
  });

  function handleApiError(error: unknown, res: Response) {
    const status = getErrorStatusCode(error);
    const message = getErrorMessage(error);
    res.status(status).json({ error: message });
  }

  function withApiErrorHandling(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
    return async (req: Request, res: Response) => {
      try {
        await handler(req, res);
      } catch (error) {
        handleApiError(error, res);
      }
    };
  }

  app.get('/api/roles/:guildId', withApiErrorHandling(async (req, res) => {
    const guildId = requireParamString(req, 'guildId');
    const roleIds = await getManagerRoleIds(guildId);
    res.json({ roleIds });
  }));

  app.put('/api/roles/:guildId', withApiErrorHandling(async (req, res) => {
    requireAdminToken(req);
    const body = rolesSchema.parse(req.body);
    const guildId = requireParamString(req, 'guildId');
    await setManagerRoleIds(guildId, body.roleIds);
    res.json({ ok: true });
  }));

  app.get('/api/giveaways/:guildId', withApiErrorHandling(async (req, res) => {
    const guildId = requireParamString(req, 'guildId');
    const giveaways = await getActiveGiveaways(guildId);
    res.json({ giveaways });
  }));

  app.post('/api/giveaways', withApiErrorHandling(async (req, res) => {
    requireAdminToken(req);
    const body = createSchema.parse(req.body);
    const userId = req.header('x-user-id');
    if (!userId) {
      throw new AppError('x-user-id header is required.', 400);
    }

    const managerRoleIds = await getManagerRoleIds(body.guildId);
    if (managerRoleIds.length > 0) {
      const guild = await client.guilds.fetch(body.guildId).catch(() => null);
      if (!guild) {
        throw new AppError('Guild not found.', 404);
      }
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        throw new AppError('User is not a member of this guild.', 403);
      }
      const hasManagerRole = managerRoleIds.some((id) => member.roles.cache.has(id));
      if (!hasManagerRole) {
        throw new AppError('You do not have permission to create giveaways.', 403);
      }
    }

    const created = await createGiveawayPost({
      client,
      guildId: body.guildId,
      channelId: body.channelId,
      title: body.title,
      description: body.description,
      deadlineInput: body.deadline,
      winnerCount: body.winnerCount,
      createdBy: userId,
      interval: undefined // Web API can be extended later if needed
    });
    res.json({ giveaway: created });
  }));

  app.post('/api/giveaways/:id/end', withApiErrorHandling(async (req, res) => {
    requireAdminToken(req);
    const guildId = guildBodySchema.parse(req.body).guildId;
    const id = requireParamString(req, 'id');
    const giveaway = await getGiveaway(id);
    if (!giveaway) {
      throw new AppError('Giveaway not found.', 404);
    }
    if (giveaway.guildId !== guildId) {
      throw new AppError('You cannot manage giveaways from other servers.', 403);
    }
    await endGiveaway(client, id);
    res.json({ ok: true });
  }));

  app.post('/api/giveaways/:id/reroll', withApiErrorHandling(async (req, res) => {
    requireAdminToken(req);
    const guildId = guildBodySchema.parse(req.body).guildId;
    const id = requireParamString(req, 'id');
    const giveaway = await getGiveaway(id);
    if (!giveaway) {
      throw new AppError('Giveaway not found.', 404);
    }
    if (giveaway.guildId !== guildId) {
      throw new AppError('You cannot manage giveaways from other servers.', 403);
    }
    const winners = await rerollGiveaway(client, id);
    res.json({ winners });
  }));

  return app;
}
