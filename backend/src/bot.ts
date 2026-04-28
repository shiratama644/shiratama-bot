import {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} from 'discord.js';
import { getDueGiveaways } from './db.js';
import { endGiveaway } from './giveawayService.js';
import { handleInteraction } from './interactions/index.js';
import { commands } from './commands/index.js';
import { logger } from './utils/logger.js';

export function buildClient(token: string, appId: string, guildId?: string): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  client.once('clientReady', async () => {
    logger.info(`Logged in as ${client.user?.tag}`);

    const rest = new REST({ version: '10' }).setToken(token);
    const commandBody = commands.map(c => ({
      name: c.name,
      description: c.description,
      options: c.options
    }));

    try {
      if (guildId) {
        logger.info(`Registering guild commands for ${guildId}`);
        await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandBody });
      } else {
        logger.info('Registering global commands');
        await rest.put(Routes.applicationCommands(appId), { body: commandBody });
      }
    } catch (error) {
      logger.error('Failed to register commands:', error);
    }

    // Recovery logic: check for missed giveaways during downtime
    const now = new Date();
    try {
      const missed = await getDueGiveaways(now);
      if (missed.length > 0) {
        logger.info(`Recovering ${missed.length} missed giveaways`);
        for (const giveaway of missed) {
          await endGiveaway(client, giveaway.id).catch((error) => {
            logger.error(`Failed to recover giveaway ${giveaway.id}`, error);
          });
        }
      }
    } catch (error) {
      logger.error('Failed to recover missed giveaways:', error);
    }

    setInterval(async () => {
      try {
        const due = await getDueGiveaways(new Date());
        for (const giveaway of due) {
          await endGiveaway(client, giveaway.id).catch((error) => {
            logger.error(`Failed to end due giveaway ${giveaway.id}`, error);
          });
        }
      } catch (error) {
        logger.error('Error in giveaway check interval:', error);
      }
    }, 30_000);
  });

  client.on('interactionCreate', async (interaction) => {
    await handleInteraction(client, interaction);
  });

  return client;
}
