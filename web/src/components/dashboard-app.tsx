'use client';

import { useMemo, useState } from 'react';
import Select from 'react-select';
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
  fetchGuildOptions,
  fetchGuilds,
  fetchGiveaways,
  fetchSettings,
  rerollGiveaway,
  updateSettings
} from '@/lib/api';

type SelectOption = {
  value: string;
  label: string;
  iconUrl?: string | null;
};

type SettingsDraft = {
  guildId: string;
  language: 'en' | 'ja';
  managerRoleIds: string[];
  giveawayChannelIds: string[];
  defaultClaimDeadline: string;
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
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [winnerCount, setWinnerCount] = useState(1);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const guildsQuery = useQuery({
    queryKey: ['guilds'],
    queryFn: fetchGuilds
  });

  const activeGuildId = selectedGuildId ?? guildsQuery.data?.[0]?.id ?? null;

  const optionsQuery = useQuery({
    queryKey: ['guild-options', activeGuildId],
    queryFn: () => fetchGuildOptions(activeGuildId as string),
    enabled: Boolean(activeGuildId)
  });

  const settingsQuery = useQuery({
    queryKey: ['settings', activeGuildId],
    queryFn: () => fetchSettings(activeGuildId as string),
    enabled: Boolean(activeGuildId)
  });

  const giveawaysQuery = useQuery({
    queryKey: ['giveaways', activeGuildId],
    queryFn: () => fetchGiveaways(activeGuildId as string),
    enabled: Boolean(activeGuildId)
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

  const userOptions = useMemo<SelectOption[]>(
    () =>
      (optionsQuery.data?.members ?? []).map((member) => ({
        value: member.id,
        label: member.name,
        iconUrl: member.avatarUrl
      })),
    [optionsQuery.data?.members]
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
      managerRoleIds: settingsQuery.data.managerRoleIds,
      giveawayChannelIds: settingsQuery.data.giveawayChannelIds,
      defaultClaimDeadline: settingsQuery.data.defaultClaimDeadline ?? ''
    };
  }, [activeGuildId, settingsQuery.data]);

  const currentSettings =
    settingsDraft && settingsDraft.guildId === activeGuildId ? settingsDraft : settingsSeed;

  const activeChannelId = channelOptions.some((option) => option.value === selectedChannelId)
    ? selectedChannelId
    : (channelOptions[0]?.value ?? '');

  const activeUserId = userOptions.some((option) => option.value === selectedUserId)
    ? selectedUserId
    : (userOptions[0]?.value ?? '');

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
        managerRoleIds: currentSettings.managerRoleIds,
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
      if (!activeChannelId || !activeUserId) {
        throw new Error('チャンネルとユーザーを選択してください。');
      }
      return createGiveaway({
        guildId: activeGuildId,
        channelId: activeChannelId,
        title,
        description,
        deadline,
        winnerCount,
        userId: activeUserId
      });
    },
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      setDeadline('');
      setWinnerCount(1);
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-lg hover:bg-slate-100"
          aria-label="メニューを開く"
        >
          ☰
        </button>
        <h1 className="text-sm font-semibold sm:text-base">AppleJP Bot Dashboard</h1>
      </header>

      <div
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity ${menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white p-4 shadow-xl transition-transform ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">サーバー</h2>
          <button type="button" onClick={() => setMenuOpen(false)} className="text-slate-500">✕</button>
        </div>
        <div className="space-y-2">
          {(guildsQuery.data ?? []).map((guild) => (
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

      <main className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-2">
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
              <span className="mb-1 block text-slate-600">🛡️ 管理ロール</span>
              <Select
                isMulti
                options={roleOptions}
                value={roleOptions.filter((option) => currentSettings?.managerRoleIds.includes(option.value))}
                onChange={(options) => updateCurrentSettings({ managerRoleIds: options.map((option) => option.value) })}
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
              disabled={saveSettingsMutation.isPending || !currentSettings}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              設定を保存
            </button>
          </div>
        </section>

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
                options={channelOptions}
                value={channelOptions.find((option) => option.value === activeChannelId) ?? null}
                onChange={(option) => setSelectedChannelId(option?.value ?? '')}
                formatOptionLabel={(option) => <OptionLabel option={option} />}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">👤 実行ユーザー</span>
              <Select
                options={userOptions}
                value={userOptions.find((option) => option.value === activeUserId) ?? null}
                onChange={(option) => setSelectedUserId(option?.value ?? '')}
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

            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">📅 終了日時 (ISO)</span>
              <input
                required
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="2026-05-31T12:00:00+09:00"
              />
            </label>

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
              disabled={createMutation.isPending}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Giveawayを作成
            </button>
          </form>
        </section>

        <section className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
      </main>

      {(guildsQuery.isLoading || optionsQuery.isLoading || settingsQuery.isLoading) ? (
        <div className="fixed bottom-4 right-4 rounded-md bg-slate-900 px-3 py-2 text-xs text-white">
          読み込み中...
        </div>
      ) : null}

      {(guildsQuery.error || optionsQuery.error || settingsQuery.error || giveawaysQuery.error) ? (
        <div className="fixed bottom-4 left-4 max-w-sm rounded-md bg-rose-100 px-3 py-2 text-xs text-rose-700">
          {String(
            guildsQuery.error ?? optionsQuery.error ?? settingsQuery.error ?? giveawaysQuery.error
          )}
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
