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
import { getActiveGiveaways, getDueGiveaways, getGiveaway, getManagerRoleIds, setManagerRoleIds } from './db.js';
import {
  createGiveawayPost,
  endGiveaway,
  refreshGiveawayMessage,
  rerollGiveaway,
  startGiveawayAutoRepeat,
  stopGiveaway,
  stopGiveawayAutoRepeat,
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
      },
      {
        name: 'gend',
        description: '選択したGiveawayを手動で終了します',
        options: [
          {
            name: 'id',
            description: 'Giveaway ID',
            type: 3,
            required: true,
            autocomplete: true
          }
        ]
      },
      {
        name: 'gstop',
        description: '選択したGiveawayの自動作成を停止します',
        options: [
          {
            name: 'id',
            description: 'Giveaway ID',
            type: 3,
            required: true,
            autocomplete: true
          }
        ]
      },
      {
        name: 'gstart',
        description: '選択したGiveawayの自動作成を再開します',
        options: [
          {
            name: 'id',
            description: 'Giveaway ID',
            type: 3,
            required: true,
            autocomplete: true
          }
        ]
      },
      {
        name: 'greroll',
        description: '終了したGiveawayを再抽選します',
        options: [
          {
            name: 'id',
            description: 'Giveaway ID',
            type: 3,
            required: true,
            autocomplete: true
          }
        ]
      },
      {
        name: 'gsettings',
        description: '設定画面を開きます'
      }
    ];

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandBody });
    } else {
      await rest.put(Routes.applicationCommands(appId), { body: commandBody });
    }

    // Recovery logic: check for missed giveaways during downtime
    const now = new Date();
    const missed = await getDueGiveaways(now);
    for (const giveaway of missed) {
      // If bot was down, end the giveaway
      // The requirement says: "botがダウンしてるときにギブアウェイがエンドしたらそのギブアウェイを停止させるようにしてください。自動作成がオンの場合は設定されたとおりに実行する。"
      // "停止させる" here likely means ending it.
      await endGiveaway(client, giveaway.id);
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

      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'giveaway:create') {
          const title = interaction.fields.getTextInputValue('title');
          const description = interaction.fields.getTextInputValue('description');
          const deadline = interaction.fields.getTextInputValue('deadline');
          const interval = interaction.fields.getTextInputValue('interval');
          const winnerCountRaw = interaction.fields.getTextInputValue('winnerCount');
          const winnerCount = Number.parseInt(winnerCountRaw || '1', 10);

          if (!interaction.guildId || !interaction.channelId) {
            throw new Error('サーバー内テキストチャンネルで実行してください。');
          }

          const created = await createGiveawayPost({
            client,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            title,
            description,
            deadlineInput: deadline,
            winnerCount: Number.isNaN(winnerCount) ? 1 : winnerCount,
            createdBy: interaction.user.id,
            interval: interval || undefined
          });

          await interaction.reply({
            content: `Giveawayを作成しました: ${created.title}${interval ? ` (自動作成間隔: ${interval})` : ''}`,
            ephemeral: true
          });
          return;
        }

        if (interaction.customId === 'giveaway:settings') {
          const roleIdsRaw = interaction.fields.getTextInputValue('roleIds');
          const roleIds = roleIdsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
          
          if (!interaction.guildId) throw new Error('Guild not found.');
          await setManagerRoleIds(interaction.guildId, roleIds);

          await interaction.reply({
            content: '設定を保存しました。',
            ephemeral: true
          });
          return;
        }
      }

      if (interaction.isAutocomplete()) {
        if (!interaction.guildId) return;
        const active = await getActiveGiveaways(interaction.guildId);
        const focusedValue = interaction.options.getFocused();
        const filtered = active.filter(g => g.title.includes(focusedValue) || g.id.includes(focusedValue));
        await interaction.respond(
          filtered.slice(0, 25).map(g => ({ name: `${g.title} (${g.id})`, value: g.id }))
        );
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
  const { commandName, options, guildId, user } = interaction;

  if (commandName === 'gc') {
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
      .setPlaceholder('2026/01/01 または 10m');

    const intervalInput = new TextInputBuilder()
      .setCustomId('interval')
      .setLabel('自動作成間隔 (例: 1d, 12h)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('空欄で自動作成なし');

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
      new ActionRowBuilder<TextInputBuilder>().addComponents(intervalInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(winnerCountInput)
    );

    await interaction.showModal(modal);
    return;
  }

  if (commandName === 'gend') {
    const id = options.getString('id', true);
    await endGiveaway(client, id);
    await interaction.reply({ content: `Giveaway (${id}) を終了しました。`, ephemeral: true });
    return;
  }

  if (commandName === 'gstop') {
    const id = options.getString('id', true);
    await stopGiveawayAutoRepeat(id);
    await interaction.reply({ content: `Giveaway (${id}) の自動作成を停止しました。`, ephemeral: true });
    return;
  }

  if (commandName === 'gstart') {
    const id = options.getString('id', true);
    await startGiveawayAutoRepeat(id);
    await interaction.reply({ content: `Giveaway (${id}) の自動作成を再開しました。`, ephemeral: true });
    return;
  }

  if (commandName === 'greroll') {
    const id = options.getString('id', true);
    await rerollGiveaway(client, id);
    await interaction.reply({ content: `Giveaway (${id}) を再抽選しました。`, ephemeral: true });
    return;
  }

  if (commandName === 'gsettings') {
    if (!guildId) return;
    const roleIds = await getManagerRoleIds(guildId);
    const modal = new ModalBuilder().setCustomId('giveaway:settings').setTitle('Giveaway設定');
    const roleIdsInput = new TextInputBuilder()
      .setCustomId('roleIds')
      .setLabel('管理ロールID (カンマ区切り)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(roleIds.join(', '));
    
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdsInput));
    await interaction.showModal(modal);
    return;
  }
}
