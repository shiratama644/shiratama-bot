import express, { Request } from 'express';
import {
  getGiveaway,
  getActiveGiveaways,
  getManagerRoleIds,
  setManagerRoleIds
} from './db.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from './giveawayService.js';
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

function requireAdminToken(req: Request): void {
  const adminToken = process.env.ADMIN_API_TOKEN;
  if (!adminToken) {
    throw new AppError('ADMIN_API_TOKEN が未設定です。', 500);
  }
  if (req.header('x-admin-token') !== adminToken) {
    throw new AppError('管理者トークンが不正です。', 401);
  }
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
          res.status(403).json({ error: 'Originヘッダーが必要です。' });
          return;
        }
      }
      if (requestOrigin && requestOrigin !== allowedOrigin) {
        res.status(403).json({ error: '許可されていないOriginです。' });
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

  function handleApiError(error: unknown, res: express.Response) {
    const status = getErrorStatusCode(error);
    const message = getErrorMessage(error);
    res.status(status).json({ error: message });
  }

  app.get('/api/roles/:guildId', async (req, res) => {
    const roleIds = await getManagerRoleIds(req.params.guildId);
    res.json({ roleIds });
  });

  app.put('/api/roles/:guildId', async (req, res) => {
    try {
      requireAdminToken(req);
      const body = rolesSchema.parse(req.body);
      await setManagerRoleIds(req.params.guildId, body.roleIds);
      res.json({ ok: true });
    } catch (error) {
      handleApiError(error, res);
    }
  });

  app.get('/api/giveaways/:guildId', async (req, res) => {
    const giveaways = await getActiveGiveaways(req.params.guildId);
    res.json({ giveaways });
  });

  app.post('/api/giveaways', async (req, res) => {
    try {
      requireAdminToken(req);
      const body = createSchema.parse(req.body);
      const userId = req.header('x-user-id');
      if (!userId) {
        throw new AppError('x-user-id ヘッダーが必要です。', 400);
      }

      const managerRoleIds = await getManagerRoleIds(body.guildId);
      if (managerRoleIds.length > 0) {
        const guild = await client.guilds.fetch(body.guildId).catch(() => null);
        if (!guild) {
          throw new AppError('Guildが見つかりません。', 404);
        }
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          throw new AppError('ユーザーがGuildに存在しません。', 403);
        }
        const hasManagerRole = managerRoleIds.some((id) => member.roles.cache.has(id));
        if (!hasManagerRole) {
          throw new AppError('Giveaway作成権限がありません。', 403);
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
    } catch (error) {
      handleApiError(error, res);
    }
  });

  app.post('/api/giveaways/:id/end', async (req, res) => {
    try {
      requireAdminToken(req);
      const guildId = z.object({ guildId: z.string().min(1) }).parse(req.body).guildId;
      const giveaway = await getGiveaway(req.params.id);
      if (!giveaway) {
        throw new AppError('Giveawayが見つかりません。', 404);
      }
      if (giveaway.guildId !== guildId) {
        throw new AppError('別サーバーのGiveawayは操作できません。', 403);
      }
      await endGiveaway(client, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      handleApiError(error, res);
    }
  });

  app.post('/api/giveaways/:id/reroll', async (req, res) => {
    try {
      requireAdminToken(req);
      const guildId = z.object({ guildId: z.string().min(1) }).parse(req.body).guildId;
      const giveaway = await getGiveaway(req.params.id);
      if (!giveaway) {
        throw new AppError('Giveawayが見つかりません。', 404);
      }
      if (giveaway.guildId !== guildId) {
        throw new AppError('別サーバーのGiveawayは操作できません。', 403);
      }
      const winners = await rerollGiveaway(client, req.params.id);
      res.json({ winners });
    } catch (error) {
      handleApiError(error, res);
    }
  });

  return app;
}
