import dotenv from 'dotenv';
import { buildClient } from './bot.js';
import { createApiServer } from './api.js';
import { initSchema } from './db.js';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT ?? 3000);

if (!token || !appId || !process.env.DATABASE_URL) {
  throw new Error('DISCORD_BOT_TOKEN / DISCORD_APP_ID / DATABASE_URL は必須です。');
}

await initSchema();

const client = buildClient(token, appId, guildId);
const app = createApiServer(client);

app.listen(port, () => {
  console.log(`[api] listening on ${port}`);
});

await client.login(token);
