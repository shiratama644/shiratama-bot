'use client';

import { useMemo, useState } from 'react';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import * as chrono from 'chrono-node';
import { format } from 'date-fns';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  createGiveaway,
  endGiveaway,
  fetchAuthSession,
  fetchGuildOptions,
  fetchGiveaways,
  fetchSettings,
  getLoginUrl,
  logout,
  rerollGiveaway,
  updateSettings
} from '@/lib/api';

type SelectOption = {
  value: string;
  label: string;
  iconUrl?: string | null;
};

type SectionKey = 'settings' | 'create' | 'active';

type SettingsDraft = {
  guildId: string;
  language: 'en' | 'ja';
  giveawayCreatorRoleIds: string[];
  dashboardViewRoleIds: string[];
  giveawayChannelIds: string[];
  defaultClaimDeadline: string;
};

const INTERVAL_SEGMENT_RE = /(\d+)(w|d|h|m|s)/gi;
const INTERVAL_UNIT_MS: Record<string, number> = {
  w: 7 * 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function parseIntervalMs(input: string): number | null {
  const value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }
  let total = 0;
  let consumed = '';
  for (const match of value.matchAll(INTERVAL_SEGMENT_RE)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    total += amount * INTERVAL_UNIT_MS[unit];
    consumed += match[0];
  }
  if (!total || consumed !== value) {
    return null;
  }
  return total;
}

function OptionLabel({ option }: { option: SelectOption }) {
  return (
    <div className="flex items-center gap-2">
      {option.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.iconUrl} alt="" className="h-5 w-5 rounded-full" />
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs">#</span>
      )}
      <span>{option.label}</span>
    </div>
  );
}

function DashboardContent() {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>('settings');
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineText, setDeadlineText] = useState('');
  const [selectedDeadlineDate, setSelectedDeadlineDate] = useState<Date | null>(null);
  const [winnerCount, setWinnerCount] = useState(1);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [autoRepeat, setAutoRepeat] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchAuthSession,
    retry: false
  });

  const guilds = sessionQuery.data?.guilds;
  const activeGuildId = selectedGuildId ?? guilds?.[0]?.id ?? null;

  const optionsQuery = useQuery({
    queryKey: ['guild-options', activeGuildId],
    queryFn: () => fetchGuildOptions(activeGuildId as string),
    enabled: Boolean(activeGuildId && sessionQuery.data)
  });

  const settingsQuery = useQuery({
    queryKey: ['settings', activeGuildId],
    queryFn: () => fetchSettings(activeGuildId as string),
    enabled: Boolean(activeGuildId && sessionQuery.data)
  });

  const giveawaysQuery = useQuery({
    queryKey: ['giveaways', activeGuildId],
    queryFn: () => fetchGiveaways(activeGuildId as string),
    enabled: Boolean(activeGuildId && sessionQuery.data)
  });

  const roleOptions = useMemo<SelectOption[]>(
    () =>
      (optionsQuery.data?.roles ?? []).map((role) => ({
        value: role.id,
        label: `@${role.name}`
      })),
    [optionsQuery.data?.roles]
  );

  const channelOptions = useMemo<SelectOption[]>(
    () =>
      (optionsQuery.data?.channels ?? []).map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`
      })),
    [optionsQuery.data?.channels]
  );

  const memberMap = useMemo(
    () => new Map((optionsQuery.data?.members ?? []).map((member) => [member.id, member])),
    [optionsQuery.data?.members]
  );

  const channelMap = useMemo(
    () => new Map((optionsQuery.data?.channels ?? []).map((channel) => [channel.id, channel])),
    [optionsQuery.data?.channels]
  );

  const settingsSeed = useMemo<SettingsDraft | null>(() => {
    if (!activeGuildId || !settingsQuery.data) {
      return null;
    }
    return {
      guildId: activeGuildId,
      language: settingsQuery.data.language === 'ja' ? 'ja' : 'en',
      giveawayCreatorRoleIds: settingsQuery.data.giveawayCreatorRoleIds,
      dashboardViewRoleIds: settingsQuery.data.dashboardViewRoleIds,
      giveawayChannelIds: settingsQuery.data.giveawayChannelIds,
      defaultClaimDeadline: settingsQuery.data.defaultClaimDeadline ?? ''
    };
  }, [activeGuildId, settingsQuery.data]);

  const currentSettings =
    settingsDraft && settingsDraft.guildId === activeGuildId ? settingsDraft : settingsSeed;

  const allowedChannelOptions = useMemo(
    () =>
      channelOptions.filter((option) => currentSettings?.giveawayChannelIds.includes(option.value)),
    [channelOptions, currentSettings?.giveawayChannelIds]
  );

  const activeChannelId = allowedChannelOptions.some((option) => option.value === selectedChannelId)
    ? selectedChannelId
    : (allowedChannelOptions[0]?.value ?? '');

  const activeGuildAccess = useMemo(
    () => guilds?.find((guild) => guild.id === activeGuildId) ?? null,
    [guilds, activeGuildId]
  );

  const updateCurrentSettings = (patch: Partial<SettingsDraft>) => {
    if (!settingsSeed) {
      return;
    }
    const base = settingsDraft && settingsDraft.guildId === settingsSeed.guildId ? settingsDraft : settingsSeed;
    setSettingsDraft({ ...base, ...patch });
  };

  const saveSettingsMutation = useMutation({
    mutationFn: () => {
      if (!activeGuildId || !currentSettings) {
        throw new Error('Guild is not selected');
      }
      return updateSettings(activeGuildId, {
        language: currentSettings.language,
        giveawayCreatorRoleIds: currentSettings.giveawayCreatorRoleIds,
        dashboardViewRoleIds: currentSettings.dashboardViewRoleIds,
        giveawayChannelIds: currentSettings.giveawayChannelIds,
        defaultClaimDeadline: currentSettings.defaultClaimDeadline.trim()
          ? currentSettings.defaultClaimDeadline.trim()
          : null
      });
    },
    onSuccess: async () => {
      if (!activeGuildId) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['settings', activeGuildId] });
      setSettingsDraft(null);
      alert('設定を保存しました');
    }
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeGuildId) {
        throw new Error('Guild is not selected');
      }
      if (!activeGuildAccess?.canCreateGiveaway) {
        throw new Error('Giveaway作成権限がありません。');
      }
      if (!activeChannelId) {
        throw new Error('チャンネルを選択してください。');
      }
      if (autoRepeat && !parseIntervalMs(deadlineText)) {
        throw new Error('間隔は 1h / 20m / 1w2d3h の形式で入力してください。');
      }
      if (!autoRepeat && !selectedDeadlineDate) {
        throw new Error('終了日時を入力してください。');
      }
      return createGiveaway({
        guildId: activeGuildId,
        channelId: activeChannelId,
        title,
        description,
        deadline: autoRepeat
          ? deadlineText.trim()
          : format(selectedDeadlineDate as Date, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        winnerCount,
        autoRepeat
      });
    },
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      setDeadlineText('');
      setSelectedDeadlineDate(null);
      setWinnerCount(1);
      setAutoRepeat(false);
      if (activeGuildId) {
        await queryClient.invalidateQueries({ queryKey: ['giveaways', activeGuildId] });
      }
      alert('Giveawayを作成しました');
    }
  });

  const endMutation = useMutation({
    mutationFn: async (giveawayId: string) => {
      if (!activeGuildId) {
        throw new Error('Guild is not selected');
      }
      return endGiveaway(giveawayId, activeGuildId);
    },
    onSuccess: async () => {
      if (!activeGuildId) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['giveaways', activeGuildId] });
    }
  });

  const rerollMutation = useMutation({
    mutationFn: async (giveawayId: string) => {
      if (!activeGuildId) {
        throw new Error('Guild is not selected');
      }
      return rerollGiveaway(giveawayId, activeGuildId);
    },
    onSuccess: (result) => {
      const winnerNames = result.winners.map((winnerId) => memberMap.get(winnerId)?.name ?? 'Unknown user');
      alert(`再抽選完了: ${winnerNames.join(', ')}`);
    }
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] });
    }
  });

  if (sessionQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">読み込み中...</div>;
  }

  if (!sessionQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">AppleJP Bot Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Discord OAuth2でログインすると、サーバー管理者またはダッシュボード閲覧可能ロールのユーザーが利用できます。
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
          >
            Discordでログイン
          </button>
          {sessionQuery.error ? (
            <p className="mt-3 text-xs text-rose-600">{String(sessionQuery.error)}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-lg hover:bg-slate-100"
            aria-label="メニューを開く"
          >
            ☰
          </button>
          <h1 className="text-sm font-semibold sm:text-base">AppleJP Bot Dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          ログアウト
        </button>
      </header>

      <div
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity ${menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white p-4 shadow-xl transition-transform ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">メニュー</h2>
          <button type="button" onClick={() => setMenuOpen(false)} className="text-slate-500">✕</button>
        </div>

        <div className="space-y-2">
          {([
            ['settings', 'サーバー設定'],
            ['create', 'Giveaway作成'],
            ['active', '進行中Giveaway']
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveSection(key);
                setMenuOpen(false);
              }}
              className={`w-full rounded-md px-2 py-2 text-left text-sm ${activeSection === key ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <h3 className="mb-2 mt-6 text-xs font-semibold text-slate-500">サーバー</h3>
        <div className="space-y-2">
          {(guilds ?? []).map((guild) => (
            <button
              type="button"
              key={guild.id}
              onClick={() => {
                setSelectedGuildId(guild.id);
                setSettingsDraft(null);
                setMenuOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${guild.id === activeGuildId ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-100'}`}
            >
              {guild.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guild.iconUrl} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs">🏠</span>
              )}
              <span className="truncate">{guild.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="mx-auto max-w-6xl p-4">
        {activeSection === 'settings' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">サーバー設定</h2>
            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">🌐 言語</span>
                <select
                  value={currentSettings?.language ?? 'en'}
                  onChange={(event) =>
                    updateCurrentSettings({ language: event.target.value === 'ja' ? 'ja' : 'en' })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!currentSettings}
                >
                  <option value="ja">🇯🇵 日本語</option>
                  <option value="en">🇺🇸 English</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">🎁 Giveaway作成可能ロール</span>
                <Select
                  isMulti
                  options={roleOptions}
                  value={roleOptions.filter((option) => currentSettings?.giveawayCreatorRoleIds.includes(option.value))}
                  onChange={(options) => updateCurrentSettings({ giveawayCreatorRoleIds: options.map((option) => option.value) })}
                  formatOptionLabel={(option) => <OptionLabel option={option} />}
                  isDisabled={!currentSettings}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">👀 ダッシュボード閲覧可能ロール</span>
                <Select
                  isMulti
                  options={roleOptions}
                  value={roleOptions.filter((option) => currentSettings?.dashboardViewRoleIds.includes(option.value))}
                  onChange={(options) => updateCurrentSettings({ dashboardViewRoleIds: options.map((option) => option.value) })}
                  formatOptionLabel={(option) => <OptionLabel option={option} />}
                  isDisabled={!currentSettings}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600"># Giveaway作成可能チャンネル</span>
                <Select
                  isMulti
                  options={channelOptions}
                  value={channelOptions.filter((option) => currentSettings?.giveawayChannelIds.includes(option.value))}
                  onChange={(options) =>
                    updateCurrentSettings({ giveawayChannelIds: options.map((option) => option.value) })
                  }
                  formatOptionLabel={(option) => <OptionLabel option={option} />}
                  isDisabled={!currentSettings}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">⏱️ 受け取り期限</span>
                <input
                  value={currentSettings?.defaultClaimDeadline ?? ''}
                  onChange={(event) => updateCurrentSettings({ defaultClaimDeadline: event.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="例: 24h"
                  disabled={!currentSettings}
                />
              </label>

              <button
                type="button"
                onClick={() => saveSettingsMutation.mutate()}
                disabled={saveSettingsMutation.isPending || !currentSettings || !activeGuildAccess?.isAdmin}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                設定を保存
              </button>
              {!activeGuildAccess?.isAdmin ? (
                <p className="text-xs text-slate-500">設定変更はサーバー管理者のみ可能です。</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeSection === 'create' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">Giveaway作成</h2>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createMutation.mutate();
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600"># チャンネル</span>
                <Select
                  options={allowedChannelOptions}
                  value={allowedChannelOptions.find((option) => option.value === activeChannelId) ?? null}
                  onChange={(option) => setSelectedChannelId(option?.value ?? '')}
                  formatOptionLabel={(option) => <OptionLabel option={option} />}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">🎁 タイトル</span>
                <input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">📝 説明</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  rows={3}
                />
              </label>

              <label className="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm">
                <span>自動作成</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoRepeat}
                  onClick={() => setAutoRepeat((value) => !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${autoRepeat ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${autoRepeat ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>

              {!autoRepeat ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">📅 終了日時</span>
                  <DatePicker
                    selected={selectedDeadlineDate}
                    onChange={(date: Date | null) => {
                      const selected = date as Date | null;
                      setSelectedDeadlineDate(selected);
                      if (selected) {
                        setDeadlineText(format(selected, 'yyyy/MM/dd HH:mm'));
                      }
                    }}
                    onChangeRaw={(event) => {
                      if (!event) {
                        return;
                      }
                      const value = (event.target as HTMLInputElement).value;
                      setDeadlineText(value);
                      const parsed = chrono.ja.parseDate(value) ?? chrono.en.parseDate(value);
                      setSelectedDeadlineDate(parsed ?? null);
                    }}
                    showTimeSelect
                    timeIntervals={5}
                    dateFormat="yyyy/MM/dd HH:mm"
                    placeholderText="自然言語 or yyyy/mm/dd"
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              ) : (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">⏱️ 間隔</span>
                  <input
                    required
                    value={deadlineText}
                    onChange={(event) => setDeadlineText(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="1h, 20m, 1w2d3h"
                  />
                </label>
              )}

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">🏆 当選人数</span>
                <input
                  required
                  type="number"
                  min={1}
                  value={winnerCount}
                  onChange={(event) => setWinnerCount(Number(event.target.value))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <button
                type="submit"
                disabled={createMutation.isPending || !activeGuildAccess?.canCreateGiveaway || allowedChannelOptions.length === 0}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Giveawayを作成
              </button>
              {!activeGuildAccess?.canCreateGiveaway ? (
                <p className="text-xs text-slate-500">このサーバーでGiveaway作成権限がありません。</p>
              ) : null}
            </form>
          </section>
        ) : null}

        {activeSection === 'active' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">進行中Giveaway</h2>
            <div className="space-y-3">
              {(giveawaysQuery.data ?? []).map((giveaway) => {
                const creator = memberMap.get(giveaway.createdBy);
                const winners = giveaway.winners.map((winnerId) => memberMap.get(winnerId)).filter(Boolean);
                const channel = channelMap.get(giveaway.channelId);

                return (
                  <article key={giveaway.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">🎉 {giveaway.title}</h3>
                      <span className="text-xs text-slate-500">終了予定: {formatDateTime(giveaway.endAt)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1"># {channel ? `#${channel.name}` : '不明なチャンネル'}</span>
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1">🏅 当選数 {giveaway.winnerCount}</span>
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">作成者:</span>{' '}
                      {creator ? (
                        <span className="inline-flex items-center gap-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={creator.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
                          {creator.name}
                        </span>
                      ) : (
                        '不明なユーザー'
                      )}
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">当選者:</span>{' '}
                      {winners.length > 0 ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {winners.map((winner) => (
                            <span key={winner!.id} className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={winner!.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
                              {winner!.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        '未抽選'
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => endMutation.mutate(giveaway.id)}
                        disabled={endMutation.isPending}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-500 disabled:opacity-50"
                      >
                        終了
                      </button>
                      <button
                        type="button"
                        onClick={() => rerollMutation.mutate(giveaway.id)}
                        disabled={rerollMutation.isPending}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        再抽選
                      </button>
                    </div>
                  </article>
                );
              })}
              {giveawaysQuery.data && giveawaysQuery.data.length === 0 ? (
                <p className="text-sm text-slate-500">進行中Giveawayはありません。</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      {(optionsQuery.isLoading || settingsQuery.isLoading) ? (
        <div className="fixed bottom-4 right-4 rounded-md bg-slate-900 px-3 py-2 text-xs text-white">
          読み込み中...
        </div>
      ) : null}

      {(optionsQuery.error || settingsQuery.error || giveawaysQuery.error) ? (
        <div className="fixed bottom-4 left-4 max-w-sm rounded-md bg-rose-100 px-3 py-2 text-xs text-rose-700">
          {String(optionsQuery.error ?? settingsQuery.error ?? giveawaysQuery.error)}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}
