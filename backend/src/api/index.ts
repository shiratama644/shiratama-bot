import { Hono } from 'hono';
import type { Client } from 'discord.js';
import { registerCorsMiddleware } from './middleware/cors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerGiveawayRoutes } from './routes/giveaways.js';
import { registerGuildRoutes } from './routes/guilds.js';
import { registerSettingsRoutes } from './routes/settings.js';

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
