import {
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  Interaction,
  ModalBuilder,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from 'discord.js';
import { getDueGiveaways } from './db.js';
import {
  createGiveawayPost,
  endGiveaway,
  refreshGiveawayMessage,
  toggleEntryAndBuildMessage
} from './giveawayService.js';

export function buildClient(token: string, appId: string, guildId?: string): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandBody = [
      {
        name: 'gc',
        description: 'Giveaway作成フォームを開きます'
      }
    ];

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandBody });
    } else {
      await rest.put(Routes.applicationCommands(appId), { body: commandBody });
    }

    setInterval(async () => {
      const due = await getDueGiveaways(new Date());
      for (const giveaway of due) {
        await endGiveaway(client, giveaway.id);
      }
    }, 30_000);
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(client, interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === 'giveaway:create') {
        const title = interaction.fields.getTextInputValue('title');
        const description = interaction.fields.getTextInputValue('description');
        const deadline = interaction.fields.getTextInputValue('deadline');
        const winnerCountRaw = interaction.fields.getTextInputValue('winnerCount');
        const winnerCount = Number.parseInt(winnerCountRaw || '1', 10);

        const created = await createGiveawayPost({
          client,
          guildId: interaction.guildId!,
          channelId: interaction.channelId,
          title,
          description,
          deadlineInput: deadline,
          winnerCount: Number.isNaN(winnerCount) ? 1 : winnerCount,
          createdBy: interaction.user.id
        });

        await interaction.reply({
          content: `Giveawayを作成しました: ${created.title}`,
          ephemeral: true
        });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith('giveaway:toggle:')) {
        const giveawayId = interaction.customId.split(':')[2];
        const text = await toggleEntryAndBuildMessage(giveawayId, interaction.user.id);
        await refreshGiveawayMessage(client, giveawayId);
        await interaction.reply({ content: text, ephemeral: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラーです。';
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: message, ephemeral: true });
        } else {
          await interaction.reply({ content: message, ephemeral: true });
        }
      }
    }
  });

  return client;
}

async function handleSlashCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName !== 'gc') {
    return;
  }

  const modal = new ModalBuilder().setCustomId('giveaway:create').setTitle('Giveaway作成');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('題名 (必須)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('説明')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  const deadlineInput = new TextInputBuilder()
    .setCustomId('deadline')
    .setLabel('期限 (必須: 2026/04/22, 10m, 10h, 5d)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('2026/04/22 または 10m');

  const winnerCountInput = new TextInputBuilder()
    .setCustomId('winnerCount')
    .setLabel('当たり人数 (整数)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue('1');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(deadlineInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(winnerCountInput)
  );

  await interaction.showModal(modal);
}
