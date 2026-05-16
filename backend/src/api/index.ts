import { Hono } from 'hono';
import type { Client } from 'discord.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerGiveawayRoutes } from './routes/giveaways.js';
import { registerGuildRoutes } from './routes/guilds.js';
import { registerSettingsRoutes } from './routes/settings.js';

function registerCorsMiddleware(app: Hono): void {
  app.use('*', async (c, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN;
    const requestOrigin = c.req.header('origin');

    if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) {
      return c.json({ error: 'Origin not allowed.' }, 403);
    }

    if (c.req.method === 'OPTIONS') {
      if (allowedOrigin && requestOrigin === allowedOrigin) {
        c.header('Access-Control-Allow-Origin', allowedOrigin);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Vary', 'Origin');
        c.header('Access-Control-Allow-Headers', 'Content-Type');
        c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      }
      return c.body(null, 200);
    }

    await next();

    if (allowedOrigin && requestOrigin === allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Headers', 'Content-Type');
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    }
  });
}

export function createApiApp(client: Client) {
  const app = new Hono();

  registerCorsMiddleware(app);
  registerAuthRoutes(app, client);
  registerGuildRoutes(app, client);
  registerSettingsRoutes(app);
  registerGiveawayRoutes(app, client);

  return app;
}

export type ApiApp = ReturnType<typeof createApiApp>;
