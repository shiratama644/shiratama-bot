import express, { Request } from 'express';
import {
  getActiveGiveaways,
  getManagerRoleIds,
  setManagerRoleIds
} from './db.js';
import { createGiveawayPost, endGiveaway, rerollGiveaway } from './giveawayService.js';
import type { Client } from 'discord.js';
import { z } from 'zod';

const rolesSchema = z.object({
  roleIds: z.array(z.string().min(1))
});

const createSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline: z.string().min(1),
  winnerCount: z.number().int().min(1),
  userId: z.string().min(1),
  roleIds: z.array(z.string()).default([])
});

function requireAdminToken(req: Request): void {
  const adminToken = process.env.ADMIN_API_TOKEN;
  if (!adminToken) {
    return;
  }
  if (req.header('x-admin-token') !== adminToken) {
    throw new Error('管理者トークンが不正です。');
  }
}

export function createApiServer(client: Client) {
  const app = express();
  app.use(express.json());

  app.use((_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    if (_.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    next();
  });

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
      const message = error instanceof Error ? error.message : 'エラー';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/giveaways/:guildId', async (req, res) => {
    const giveaways = await getActiveGiveaways(req.params.guildId);
    res.json({ giveaways });
  });

  app.post('/api/giveaways', async (req, res) => {
    try {
      const body = createSchema.parse(req.body);
      const managerRoleIds = await getManagerRoleIds(body.guildId);
      if (managerRoleIds.length > 0 && !body.roleIds.some((id) => managerRoleIds.includes(id))) {
        throw new Error('Giveaway作成権限がありません。');
      }

      const created = await createGiveawayPost({
        client,
        guildId: body.guildId,
        channelId: body.channelId,
        title: body.title,
        description: body.description,
        deadlineInput: body.deadline,
        winnerCount: body.winnerCount,
        createdBy: body.userId,
        interval: undefined // Web API can be extended later if needed
      });
      res.json({ giveaway: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'エラー';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/giveaways/:id/end', async (req, res) => {
    try {
      requireAdminToken(req);
      await endGiveaway(client, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'エラー';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/giveaways/:id/reroll', async (req, res) => {
    try {
      requireAdminToken(req);
      const winners = await rerollGiveaway(client, req.params.id);
      res.json({ winners });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'エラー';
      res.status(400).json({ error: message });
    }
  });

  return app;
}
