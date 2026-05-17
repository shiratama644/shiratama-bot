import dotenv from 'dotenv';
import { serve } from '@hono/node-server';
import { buildClient } from './discord/bot.js';
import { createApiApp } from './api/index.js';
import { initSchema } from './db/index.js';
import { initRedis } from './redis/client.js';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT ?? 3000);

if (!token || !appId || !process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw new Error('DISCORD_BOT_TOKEN / DISCORD_APP_ID / DATABASE_URL / REDIS_URL are required.');
}

if (process.env.NODE_ENV === 'production') {
  if (process.env.COOKIE_SECURE === 'false') {
    throw new Error('COOKIE_SECURE cannot be disabled in production.');
  }
  const requiredHttpsUrls = [
    { key: 'APP_BASE_URL', value: process.env.APP_BASE_URL },
    { key: 'WEB_BASE_URL', value: process.env.WEB_BASE_URL },
    { key: 'CORS_ORIGIN', value: process.env.CORS_ORIGIN }
  ];
  for (const { key, value } of requiredHttpsUrls) {
    if (!value || !value.startsWith('https://')) {
      throw new Error(`${key} must be configured with https:// in production.`);
    }
  }
}

await initSchema();
await initRedis();

const client = buildClient(token, appId, guildId);
const app = createApiApp(client);

serve({
  fetch: app.fetch,
  port
});

console.log(`[api] listening on ${port}`);

await client.login(token);
