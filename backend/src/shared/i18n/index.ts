import { logger } from '../logger/index.js';
import { LANG_EN, LANG_JA } from '../constants/ids.js';

const enMessages = {
    giveawayCreateTitle: 'Giveaway Create',
    giveawaySettingsTitle: 'Giveaway Settings',
    language: 'Language',
    english: 'English',
    japanese: 'Japanese',
    whoCanCreateGiveaway: 'Who Can Create a Giveaway',
    whereCanCreateGiveaway: 'Where Can We Create a Giveaway?',
    defaultClaimDeadline: 'Default Claim Deadline',
    defaultClaimDeadlinePlaceholder: '10m, 1h, 3d, 1w',
    prize: 'Prize',
    prizePlaceholder: '10M etc..',
    autoRepeating: 'Auto Repeating',
    disable: 'Disable',
    enable: 'Enable',
    durationInterval: 'Duration (Interval)',
    durationIntervalDescription: 'If Auto Repeating is enabled, you need to enter an Interval here.',
    durationIntervalPlaceholder: '>= 1m, 1h, 1d10m etc..',
    numberOfWinners: 'Number of Winners',
    description: 'Description',
    settingsSaved: 'Settings saved.',
    giveawayCreated: 'Giveaway created: {title}{autoRepeatSuffix}',
    autoRepeatSuffix: ' (auto-repeat interval: {duration})',
    giveawayEnded: 'Giveaway ({id}) has been ended.',
    giveawayRerolled: 'Giveaway ({id}) has been rerolled.',
    giveawayAutoRepeatResumed: 'Giveaway ({id}) auto-repeat has been resumed.',
    giveawayAutoRepeatStopped: 'Giveaway ({id}) auto-repeat has been stopped.',
    giveawayId: 'Giveaway ID',
    claimRequestReceived: '🎫 Your claim request has been received. Staff will create a private channel for you shortly.',
    alreadyEnteredTitle: '🎫 Already Entered!',
    alreadyEnteredDescription: 'You have already entered this giveaway.',
    leaveGiveaway: 'Leave Giveaway',
    enteredTitle: '✅ Entered!',
    enteredDescription: 'You have entered the giveaway. Good luck!',
    leftGiveawayTitle: '❌ Left Giveaway',
    leftGiveawayDescription: 'You have left the giveaway.',
    errorTitle: '❌ Error',
    pleaseRunInServer: 'Please run this command in a server.',
    couldNotRetrieveRoleInfo: 'Could not retrieve role information.',
    noPermissionManageGiveaways: 'You do not have permission to manage giveaways.',
    pleaseRunInTextChannelInServer: 'Please run this command in a text channel within a server.',
    guildNotFound: 'Guild not found.',
    enterButton: 'Enter',
    copyIdButton: 'Copy ID',
    ended: 'Ended',
    ends: 'Ends',
    host: 'Host',
    entries: 'Entries',
    winners: 'Winners',
    noWinners: 'No winners',
    claimDeadline: 'Claim Deadline',
    claimWindow: 'Claim Window',
    afterEnd: 'after end',
    repeats: 'Repeats',
    every: 'Every',
    clickEnterToParticipate: 'Click 🎉 Enter to participate',
    giveawayNotFound: 'Giveaway not found.',
    cannotManageOtherServers: 'You cannot manage giveaways from other servers.',
    giveawayNotActive: 'This giveaway is not currently active.',
    rerollOnlyEnded: 'Reroll is only available for ended giveaways.',
    targetChannelNotFound: 'Target channel not found.',
    giveawayAlreadyEnded: 'This giveaway has already ended.',
    originalGiveawayMessageNotFound: 'Original giveaway message not found.',
    giveawayMessageNotFound: 'Giveaway message not found.',
    noParticipantsNoWinners: 'No participants entered, so no winners were selected.',
    congratulationsWinners: 'Congratulations {winners}!',
    wonGiveaway: 'You won the giveaway: {title}!',
    claimYourPrizeAuthor: 'Claim Your Prize',
    claimYourPrizeTitle: '🎫 Claim Your Prize',
    claimBy: 'Claim by',
    claimPrizeButton: 'Claim Prize',
    noAutoRepeatIntervalSet: 'This giveaway does not have an auto-repeat interval set.',
    noParticipantsCannotReroll: 'No participants, cannot reroll.',
    newWinners: 'New winner(s): {winners}!',
    prizeLabel: 'Prize',
    claimDeadlineLabel: 'Claim deadline'
} as const satisfies Record<string, string>;

type I18nMessageMap = {
  [K in keyof typeof enMessages]: string;
};

const jaMessages = {
    giveawayCreateTitle: '抽選を作成',
    giveawaySettingsTitle: '抽選設定',
    language: '言語',
    english: '英語',
    japanese: '日本語',
    whoCanCreateGiveaway: '抽選作成権限のあるロール',
    whereCanCreateGiveaway: '抽選を作成できるチャンネル',
    defaultClaimDeadline: 'デフォルトの受取期限',
    defaultClaimDeadlinePlaceholder: '10m, 1h, 3d, 1w',
    prize: '賞品',
    prizePlaceholder: '10M など',
    autoRepeating: '自動繰り返し',
    disable: '無効',
    enable: '有効',
    durationInterval: '繰り返し間隔',
    durationIntervalDescription: '自動繰り返しを有効にする場合、間隔を指定してください。',
    durationIntervalPlaceholder: '>= 1m, 1h, 1d10m など',
    numberOfWinners: '当選者数',
    description: '説明',
    settingsSaved: '設定を保存しました。',
    giveawayCreated: '抽選を作成しました: {title}{autoRepeatSuffix}',
    autoRepeatSuffix: '（自動繰り返し間隔: {duration}）',
    giveawayEnded: '抽選（{id}）を終了しました。',
    giveawayRerolled: '抽選（{id}）を再抽選しました。',
    giveawayAutoRepeatResumed: '抽選（{id}）の自動繰り返しを再開しました。',
    giveawayAutoRepeatStopped: '抽選（{id}）の自動繰り返しを停止しました。',
    giveawayId: '抽選ID',
    claimRequestReceived: '🎫 受け取り申請を受け付けました。スタッフがまもなく専用チャンネルを準備します。',
    alreadyEnteredTitle: '🎫 すでに参加しています',
    alreadyEnteredDescription: 'この抽選にはすでに参加済みです。',
    leaveGiveaway: '参加を取り消す',
    enteredTitle: '✅ 参加しました',
    enteredDescription: '抽選に参加しました。幸運を祈ります！',
    leftGiveawayTitle: '❌ 抽選から離脱しました',
    leftGiveawayDescription: '抽選から離脱しました。',
    errorTitle: '❌ エラー',
    pleaseRunInServer: 'このコマンドはサーバー内で実行してください。',
    couldNotRetrieveRoleInfo: 'ロール情報を取得できませんでした。',
    noPermissionManageGiveaways: '抽選を管理する権限がありません。',
    pleaseRunInTextChannelInServer: 'このコマンドはサーバー内のテキストチャンネルで実行してください。',
    guildNotFound: 'サーバーが見つかりません。',
    enterButton: '参加',
    copyIdButton: 'IDをコピー',
    ended: '終了',
    ends: '終了まで',
    host: '主催者',
    entries: '参加数',
    winners: '当選者',
    noWinners: '当選者なし',
    claimDeadline: '受取期限',
    claimWindow: '受取猶予',
    afterEnd: '終了後',
    repeats: '繰り返し',
    every: '毎',
    clickEnterToParticipate: '🎉 参加ボタンで応募できます',
    giveawayNotFound: '抽選が見つかりません。',
    cannotManageOtherServers: '他のサーバーの抽選は管理できません。',
    giveawayNotActive: 'この抽選は現在開催中ではありません。',
    rerollOnlyEnded: '再抽選は終了済みの抽選でのみ利用できます。',
    targetChannelNotFound: '対象チャンネルが見つかりません。',
    giveawayAlreadyEnded: 'この抽選はすでに終了しています。',
    originalGiveawayMessageNotFound: '元の抽選メッセージが見つかりません。',
    giveawayMessageNotFound: '抽選メッセージが見つかりません。',
    noParticipantsNoWinners: '参加者がいなかったため、当選者は選ばれませんでした。',
    congratulationsWinners: 'おめでとうございます {winners} さん！',
    wonGiveaway: '抽選 {title} に当選しました！',
    claimYourPrizeAuthor: '賞品の受け取り',
    claimYourPrizeTitle: '🎫 賞品を受け取る',
    claimBy: '受取期限',
    claimPrizeButton: '賞品を受け取る',
    noAutoRepeatIntervalSet: 'この抽選には自動繰り返し間隔が設定されていません。',
    noParticipantsCannotReroll: '参加者がいないため再抽選できません。',
    newWinners: '新しい当選者: {winners} さん！',
    prizeLabel: '賞品',
    claimDeadlineLabel: '受取期限'
  } as const satisfies I18nMessageMap;

const _allMessages = {
  [LANG_EN]: enMessages,
  [LANG_JA]: jaMessages,
} as const satisfies Record<(typeof LANG_EN) | (typeof LANG_JA), I18nMessageMap>;

export type BotLanguage = keyof typeof _allMessages;

export const DEFAULT_LANGUAGE: BotLanguage = LANG_EN;

export type I18nKey = {
  [L in BotLanguage]: keyof (typeof _allMessages)[L];
}[BotLanguage];

type TemplateForKey<K extends I18nKey> = {
  [L in BotLanguage]:
    K extends keyof (typeof _allMessages)[L]
      ? (typeof _allMessages)[L][K]
      : never;
}[BotLanguage];

type Primitive =
  | string
  | number
  | boolean
  | bigint
  | Date;

type Trim<S extends string> =
  S extends ` ${infer T}`
    ? Trim<T>
    : S extends `${infer T} `
      ? Trim<T>
      : S;

type ExtractVars<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Trim<Name> | ExtractVars<Rest>
    : never;

type VarsFor<K extends I18nKey> =
  ExtractVars<TemplateForKey<K>> extends never
    ? never
    : {
        [P in ExtractVars<TemplateForKey<K>>]: Primitive;
      };

type ArgsFor<K extends I18nKey> =
  [VarsFor<K>] extends [never]
    ? []
    : [vars: VarsFor<K>];

const messages: Record<
  BotLanguage,
  Partial<Record<I18nKey, string>>
> = _allMessages;

const VARIABLE_REGEX = /\{\s*([^}\s]+)\s*\}/g;

const INTL_LOCALE_MAP: Record<BotLanguage, string> = {
  [LANG_EN]: 'en-US',
  [LANG_JA]: 'ja-JP',
};

const reportError = (message: string) => {
  logger.warn(`[I18n] ${message}`);
};

export function isLanguage(
  lang: string | null | undefined
): lang is BotLanguage {
  return !!lang && lang in messages;
}

export function normalizeLanguage(
  lang?: string | null
): BotLanguage {
  return isLanguage(lang)
    ? lang
    : DEFAULT_LANGUAGE;
}

export function t<K extends I18nKey>(
  language: string | null | undefined,
  key: K,
  ...args: ArgsFor<K>
): string {
  const lang = normalizeLanguage(language);
  const intlLocale = INTL_LOCALE_MAP[lang];

  let template = messages[lang][key];

  if (template == null) {
    reportError(
      `Missing key: "${key}" in language: "${lang}"`
    );

    template = messages[DEFAULT_LANGUAGE][key];
  }

  if (template == null) {
    return String(key);
  }

  const vars =
    args[0] as
      | Record<string, Primitive | undefined>
      | undefined;

  if (!vars) {
    return template;
  }

  return template.replace(
    VARIABLE_REGEX,
    (match, name) => {
      const value = vars[name];

      if (value === undefined) {
        reportError(
          `Variable "${name}" is expected by template but not provided. Key: "${key}"`
        );

        return match;
      }

      if (value instanceof Date) {
        return value.toLocaleString(intlLocale);
      }

      return String(value);
    }
  );
}

export function getFixedT(
  language: string | null | undefined
) {
  const lang = normalizeLanguage(language);

  return <K extends I18nKey>(
    key: K,
    ...args: ArgsFor<K>
  ) => t(lang, key, ...args);
}
