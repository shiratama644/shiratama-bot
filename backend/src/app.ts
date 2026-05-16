import dotenv from 'dotenv';
import { serve } from '@hono/node-server';
import { buildClient } from './discord/bot.js';
import { createApiApp } from './api/index.js';
import { initSchema } from './db/index.js';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT ?? 3000);

if (!token || !appId || !process.env.DATABASE_URL) {
  throw new Error('DISCORD_BOT_TOKEN / DISCORD_APP_ID / DATABASE_URL are required.');
}

await initSchema();

const client = buildClient(token, appId, guildId);
const app = createApiApp(client);

serve({
  fetch: app.fetch,
  port
});

console.log(`[api] listening on ${port}`);

await client.login(token);
