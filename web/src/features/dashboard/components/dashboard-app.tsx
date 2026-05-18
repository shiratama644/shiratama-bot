'use client';

import { useMemo, useState } from 'react';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import * as chrono from 'chrono-node';
import { format } from 'date-fns';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
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
  fetchGiveawayUsers,
  fetchGiveaways,
  rerollGiveaway
} from '@/features/giveaways/api/client';
import type { AuthSession } from '@/features/auth/types';
import { fetchAuthSession, getLoginUrl, logout } from '@/features/auth/api/client';
import { fetchGuildOptions } from '@/features/guilds/api/client';
import { fetchSettings, updateSettings } from '@/features/settings/api/client';

type SelectOption = {
  value: string;
  label: string;
  iconType: 'channel' | 'role';
};

type SectionKey = 'settings' | 'giveaway-create' | 'giveaway-list';
type GiveawayFilterKey = 'all' | 'active' | 'claim-open' | 'claim-ended' | 'ended' | 'stopped';
type GiveawaySortKey = 'created-at-desc' | 'created-at-asc' | 'end-at-desc' | 'end-at-asc';

type GiveawaySearchCriteria = {
  status: GiveawayFilterKey;
  creatorId: string;
  channelId: string;
  keyword: string;
  createdFrom: string;
  createdTo: string;
  sort: GiveawaySortKey;
};

type GiveawaySavedFilter = {
  id: string;
  name: string;
  criteria: GiveawaySearchCriteria;
};

type SettingsDraft = {
  guildId: string;
  language: 'en' | 'ja';
  giveawayCreatorRoleIds: string[];
  dashboardUsableRoleIds: string[];
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
const END_OF_DAY_OFFSET_MS = 1;
const MAX_SAVED_GIVEAWAY_FILTERS = 20;

const DEFAULT_GIVEAWAY_SEARCH_CRITERIA: GiveawaySearchCriteria = {
  status: 'all',
  creatorId: '',
  channelId: '',
  keyword: '',
  createdFrom: '',
  createdTo: '',
  sort: 'created-at-desc'
};

const createGiveawayFormSchema = z
  .object({
    title: z.string().trim().min(1, 'タイトルを入力してください。'),
    description: z.string(),
    deadlineText: z.string(),
    winnerCount: z.number().int().min(1, '当選人数は1以上を入力してください。'),
    autoRepeat: z.boolean()
  })
  .superRefine((value, context) => {
    if (value.autoRepeat && !parseIntervalMs(value.deadlineText)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadlineText'],
        message: '間隔は 1h / 20m / 1w2d3h の形式で入力してください。'
      });
    }
  });

type CreateGiveawayFormValues = z.infer<typeof createGiveawayFormSchema>;

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

function stripLeadingMarker(name: string): string {
  return name.replace(/^[@#]/, '').trimStart();
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function readSavedGiveawayFilters(guildId: string | null): GiveawaySavedFilter[] {
  if (!guildId || typeof window === 'undefined') {
    return [];
  }
  const key = `applejp:giveaway-filters:${guildId}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as GiveawaySavedFilter[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is GiveawaySavedFilter =>
      Boolean(
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        item.criteria
      )
    );
  } catch {
    return [];
  }
}

function getClaimState(giveaway: {
  status: 'active' | 'ended' | 'stopped';
  endAt: string;
  claimDeadline: string | null;
}): 'none' | 'open' | 'closed' {
  if (giveaway.status !== 'ended' || !giveaway.claimDeadline) {
    return 'none';
  }
  const claimDurationMs = parseIntervalMs(giveaway.claimDeadline);
  if (!claimDurationMs || claimDurationMs <= 0) {
    return 'none';
  }
  const claimDeadlineAt = new Date(giveaway.endAt).getTime() + claimDurationMs;
  return Date.now() <= claimDeadlineAt ? 'open' : 'closed';
}

function OptionLabel({ option }: { option: SelectOption }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs">
        {option.iconType === 'role' ? '@' : '#'}
      </span>
      <span>{option.label}</span>
    </div>
  );
}

function DashboardContent({
  initialSession,
  initialSessionFetchedAt
}: {
  initialSession: AuthSession | null;
  initialSessionFetchedAt: number;
}) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveawayMenuOpen, setGiveawayMenuOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionKey>('settings');
  const [giveawayFilter, setGiveawayFilter] = useState<GiveawayFilterKey>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.status);
  const [giveawayCreatorFilter, setGiveawayCreatorFilter] = useState<string>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.creatorId);
  const [giveawayChannelFilter, setGiveawayChannelFilter] = useState<string>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.channelId);
  const [giveawayKeywordFilter, setGiveawayKeywordFilter] = useState<string>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.keyword);
  const [giveawayCreatedFromFilter, setGiveawayCreatedFromFilter] = useState<string>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.createdFrom);
  const [giveawayCreatedToFilter, setGiveawayCreatedToFilter] = useState<string>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.createdTo);
  const [giveawaySort, setGiveawaySort] = useState<GiveawaySortKey>(DEFAULT_GIVEAWAY_SEARCH_CRITERIA.sort);
  const [savedGiveawayFilters, setSavedGiveawayFilters] = useState<GiveawaySavedFilter[]>([]);
  const [savedGiveawayFilterName, setSavedGiveawayFilterName] = useState('');
  const [selectedSavedGiveawayFilterId, setSelectedSavedGiveawayFilterId] = useState('');
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [guildOptionsRefreshNonce, setGuildOptionsRefreshNonce] = useState(0);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);

  const [selectedDeadlineDate, setSelectedDeadlineDate] = useState<Date | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => generateClientId());
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors }
  } = useForm<CreateGiveawayFormValues>({
    resolver: zodResolver(createGiveawayFormSchema),
    defaultValues: {
      title: '',
      description: '',
      deadlineText: '',
      winnerCount: 1,
      autoRepeat: false
    }
  });
  const autoRepeat = useWatch({ control, name: 'autoRepeat' }) ?? false;

  const sessionQuery = useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchAuthSession,
    initialData: initialSession,
    initialDataUpdatedAt: initialSessionFetchedAt,
    retry: false
  });

  const guilds = sessionQuery.data?.guilds;
  const activeGuildId = selectedGuildId;

  const optionsQuery = useQuery({
    queryKey: ['guild-options', activeGuildId, guildOptionsRefreshNonce],
    queryFn: () => fetchGuildOptions(activeGuildId as string, guildOptionsRefreshNonce > 0),
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

  const giveawayUserIds = useMemo(
    () => [...new Set((giveawaysQuery.data ?? []).flatMap((giveaway) => [giveaway.createdBy, ...giveaway.winners]))],
    [giveawaysQuery.data]
  );

  const giveawayUsersQuery = useQuery({
    queryKey: ['giveaway-users', activeGuildId, giveawayUserIds.join(',')],
    queryFn: () => fetchGiveawayUsers(activeGuildId as string, giveawayUserIds),
    enabled: Boolean(activeGuildId && sessionQuery.data && giveawayUserIds.length > 0)
  });

  const roleOptions = useMemo<SelectOption[]>(
    () =>
      (optionsQuery.data?.roles ?? []).map((role) => ({
        value: role.id,
        label: stripLeadingMarker(role.name),
        iconType: 'role'
      })),
    [optionsQuery.data?.roles]
  );

  const channelOptions = useMemo<SelectOption[]>(
    () =>
      (optionsQuery.data?.channels ?? []).map((channel) => ({
        value: channel.id,
        label: stripLeadingMarker(channel.name),
        iconType: 'channel'
      })),
    [optionsQuery.data?.channels]
  );

  const channelMap = useMemo(
    () => new Map((optionsQuery.data?.channels ?? []).map((channel) => [channel.id, channel])),
    [optionsQuery.data?.channels]
  );

  const giveawayUserMap = useMemo(
    () => new Map((giveawayUsersQuery.data ?? []).map((user) => [user.id, user])),
    [giveawayUsersQuery.data]
  );

  const giveawayCreatorOptions = useMemo(
    () => {
      const creatorIds = new Set((giveawaysQuery.data ?? []).map((giveaway) => giveaway.createdBy));
      return [...creatorIds]
        .map((creatorId) => {
          const user = giveawayUserMap.get(creatorId);
          return {
            id: creatorId,
            name: user?.name ?? creatorId
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [giveawaysQuery.data, giveawayUserMap]
  );

  const settingsSeed = useMemo<SettingsDraft | null>(() => {
    if (!activeGuildId || !settingsQuery.data) {
      return null;
    }
    return {
      guildId: activeGuildId,
      language: settingsQuery.data.language === 'ja' ? 'ja' : 'en',
      giveawayCreatorRoleIds: settingsQuery.data.giveawayCreatorRoleIds,
      dashboardUsableRoleIds: settingsQuery.data.dashboardUsableRoleIds,
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
  const canEditSettings = Boolean(currentSettings && activeGuildAccess?.isOwner);

  const giveawaySearchCriteria: GiveawaySearchCriteria = {
    status: giveawayFilter,
    creatorId: giveawayCreatorFilter,
    channelId: giveawayChannelFilter,
    keyword: giveawayKeywordFilter,
    createdFrom: giveawayCreatedFromFilter,
    createdTo: giveawayCreatedToFilter,
    sort: giveawaySort
  };

  const persistSavedGiveawayFilters = (next: GiveawaySavedFilter[]) => {
    setSavedGiveawayFilters(next);
    if (!activeGuildId || typeof window === 'undefined') {
      return;
    }
    const key = `applejp:giveaway-filters:${activeGuildId}`;
    window.localStorage.setItem(key, JSON.stringify(next));
  };

  const applyGiveawaySearchCriteria = (criteria: GiveawaySearchCriteria) => {
    setGiveawayFilter(criteria.status);
    setGiveawayCreatorFilter(criteria.creatorId);
    setGiveawayChannelFilter(criteria.channelId);
    setGiveawayKeywordFilter(criteria.keyword);
    setGiveawayCreatedFromFilter(criteria.createdFrom);
    setGiveawayCreatedToFilter(criteria.createdTo);
    setGiveawaySort(criteria.sort);
  };

  const resetGiveawaySearchCriteria = () => {
    applyGiveawaySearchCriteria(DEFAULT_GIVEAWAY_SEARCH_CRITERIA);
    setSelectedSavedGiveawayFilterId('');
  };

  const selectGuild = (guildId: string) => {
    setSelectedGuildId(guildId);
    setGuildOptionsRefreshNonce(0);
    setSettingsDraft(null);
    setSavedGiveawayFilterName('');
    applyGiveawaySearchCriteria(DEFAULT_GIVEAWAY_SEARCH_CRITERIA);
    setSavedGiveawayFilters(readSavedGiveawayFilters(guildId));
    setSelectedSavedGiveawayFilterId('');
  };

  const filteredGiveaways = useMemo(() => {
    const giveaways = giveawaysQuery.data ?? [];
    const keyword = giveawayKeywordFilter.trim().toLowerCase();
    const rawFromMs = giveawayCreatedFromFilter ? new Date(giveawayCreatedFromFilter).getTime() : null;
    const rawToMs = giveawayCreatedToFilter ? new Date(giveawayCreatedToFilter).getTime() : null;
    const fromMs = rawFromMs !== null && !Number.isNaN(rawFromMs) ? rawFromMs : null;
    const toMs = rawToMs !== null && !Number.isNaN(rawToMs) ? rawToMs : null;

    const filtered = giveaways.filter((giveaway) => {
      if (giveawayFilter === 'active' && giveaway.status !== 'active') {
        return false;
      }
      if (giveawayFilter === 'claim-open' && getClaimState(giveaway) !== 'open') {
        return false;
      }
      if (giveawayFilter === 'claim-ended' && getClaimState(giveaway) !== 'closed') {
        return false;
      }
      if (giveawayFilter === 'ended' && giveaway.status !== 'ended') {
        return false;
      }
      if (giveawayFilter === 'stopped' && giveaway.status !== 'stopped') {
        return false;
      }
      if (giveawayCreatorFilter && giveaway.createdBy !== giveawayCreatorFilter) {
        return false;
      }
      if (giveawayChannelFilter && giveaway.channelId !== giveawayChannelFilter) {
        return false;
      }
      if (keyword) {
        const haystack = `${giveaway.title}\n${giveaway.description ?? ''}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      const createdAtMs = new Date(giveaway.createdAt).getTime();
      if (fromMs !== null && createdAtMs < fromMs) {
        return false;
      }
      if (toMs !== null) {
        const endOfDay = toMs + INTERVAL_UNIT_MS.d - END_OF_DAY_OFFSET_MS;
        if (createdAtMs > endOfDay) {
          return false;
        }
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (giveawaySort === 'created-at-asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (giveawaySort === 'end-at-asc') {
        return new Date(a.endAt).getTime() - new Date(b.endAt).getTime();
      }
      if (giveawaySort === 'end-at-desc') {
        return new Date(b.endAt).getTime() - new Date(a.endAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [
    giveawayFilter,
    giveawayCreatorFilter,
    giveawayChannelFilter,
    giveawayKeywordFilter,
    giveawayCreatedFromFilter,
    giveawayCreatedToFilter,
    giveawaySort,
    giveawaysQuery.data
  ]);

  const saveCurrentGiveawayFilter = () => {
    const name = savedGiveawayFilterName.trim();
    if (!name) {
      alert('保存名を入力してください。');
      return;
    }
    const next: GiveawaySavedFilter[] = [
      {
        id: generateClientId(),
        name,
        criteria: giveawaySearchCriteria
      },
      ...savedGiveawayFilters
    ].slice(0, MAX_SAVED_GIVEAWAY_FILTERS);
    persistSavedGiveawayFilters(next);
    setSavedGiveawayFilterName('');
  };

  const applySavedGiveawayFilter = () => {
    const selected = savedGiveawayFilters.find((item) => item.id === selectedSavedGiveawayFilterId);
    if (!selected) {
      return;
    }
    applyGiveawaySearchCriteria(selected.criteria);
  };

  const deleteSavedGiveawayFilter = () => {
    if (!selectedSavedGiveawayFilterId) {
      return;
    }
    const next = savedGiveawayFilters.filter((item) => item.id !== selectedSavedGiveawayFilterId);
    persistSavedGiveawayFilters(next);
    setSelectedSavedGiveawayFilterId('');
  };

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
        dashboardUsableRoleIds: currentSettings.dashboardUsableRoleIds,
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
    mutationFn: async (formValues: CreateGiveawayFormValues) => {
      if (!activeGuildId) {
        throw new Error('Guild is not selected');
      }
      if (!activeGuildAccess?.canCreateGiveaway) {
        throw new Error('Giveaway作成権限がありません。');
      }
      if (!activeChannelId) {
        throw new Error('チャンネルを選択してください。');
      }
      if (!formValues.autoRepeat && !selectedDeadlineDate) {
        throw new Error('終了日時を入力してください。');
      }
        return createGiveaway({
          guildId: activeGuildId,
          channelId: activeChannelId,
          title: formValues.title.trim(),
          description: formValues.description.trim(),
        deadline: formValues.autoRepeat
          ? formValues.deadlineText.trim()
          : format(selectedDeadlineDate as Date, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        winnerCount: formValues.winnerCount,
        autoRepeat: formValues.autoRepeat,
        idempotencyKey: createIdempotencyKey
      });
    },
    onSuccess: async () => {
      reset();
      setSelectedDeadlineDate(null);
      setCreateIdempotencyKey(generateClientId());
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
      const winnerNames = result.winners.map((winnerId) => giveawayUserMap.get(winnerId)?.name ?? winnerId);
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
            Discord OAuth2でログインすると、このBotが参加しているサーバー一覧を確認できます。オーナーまたはダッシュボード使用可能ロールがあるサーバーは選択して操作できます。
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

  if (!activeGuildId) {
    return (
      <div className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">サーバー選択</h1>
          <p className="mt-2 text-sm text-slate-600">
            すべてのサーバー一覧を表示します。サーバーオーナーまたはダッシュボード使用可能ロールがあるサーバーのみ選択できます。
          </p>
          <div className="mt-4 space-y-2">
            {(guilds ?? []).map((guild) => (
              <button
                type="button"
                key={guild.id}
                disabled={!guild.canUseDashboard}
                onClick={() => {
                  selectGuild(guild.id);
                }}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                  guild.canUseDashboard
                    ? 'border-slate-300 hover:bg-slate-50'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                {guild.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={guild.iconUrl} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs">🏠</span>
                )}
                <span className="truncate">{guild.name}</span>
                {!guild.canUseDashboard ? <span className="ml-auto text-xs">権限なし</span> : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="mt-4 rounded-md border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100"
          >
            ログアウト
          </button>
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
          <button
            type="button"
            onClick={() => {
              setActiveSection('settings');
              setMenuOpen(false);
            }}
            className={`w-full rounded-md px-2 py-2 text-left text-sm ${activeSection === 'settings' ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-100'}`}
          >
            サーバー設定
          </button>
          <div>
            <button
              type="button"
              onClick={() => setGiveawayMenuOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100"
            >
              <span>Giveaway</span>
              <span className="text-xs text-slate-500">{giveawayMenuOpen ? '▾' : '▸'}</span>
            </button>
            {giveawayMenuOpen ? (
              <div className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('giveaway-create');
                    setMenuOpen(false);
                  }}
                  className={`w-full rounded-md px-2 py-2 text-left text-sm ${activeSection === 'giveaway-create' ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-100'}`}
                >
                  Giveaway 作成
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('giveaway-list');
                    setMenuOpen(false);
                  }}
                  className={`w-full rounded-md px-2 py-2 text-left text-sm ${activeSection === 'giveaway-list' ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-100'}`}
                >
                  Giveaway 一覧
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <h3 className="mb-2 mt-6 text-xs font-semibold text-slate-500">サーバー</h3>
        <div className="space-y-2">
          {(guilds ?? []).map((guild) => (
            <button
              type="button"
              key={guild.id}
              onClick={() => {
                if (!guild.canUseDashboard) {
                  return;
                }
                selectGuild(guild.id);
                setMenuOpen(false);
              }}
              disabled={!guild.canUseDashboard}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                guild.id === activeGuildId
                  ? 'bg-indigo-100 text-indigo-800'
                  : guild.canUseDashboard
                    ? 'hover:bg-slate-100'
                    : 'cursor-not-allowed text-slate-400'
              }`}
            >
              {guild.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guild.iconUrl} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs">🏠</span>
              )}
              <span className="truncate">{guild.name}</span>
              {!guild.canUseDashboard ? <span className="ml-auto text-[10px]">権限なし</span> : null}
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
                  disabled={!canEditSettings}
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
                  isDisabled={!canEditSettings}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">👀 ダッシュボード使用可能ロール</span>
                <Select
                  isMulti
                  options={roleOptions}
                  value={roleOptions.filter((option) => currentSettings?.dashboardUsableRoleIds.includes(option.value))}
                  onChange={(options) => updateCurrentSettings({ dashboardUsableRoleIds: options.map((option) => option.value) })}
                  formatOptionLabel={(option) => <OptionLabel option={option} />}
                  isDisabled={!canEditSettings}
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
                  isDisabled={!canEditSettings}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">⏱️ 受け取り期限</span>
                <input
                  value={currentSettings?.defaultClaimDeadline ?? ''}
                  onChange={(event) => updateCurrentSettings({ defaultClaimDeadline: event.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="例: 24h"
                  disabled={!canEditSettings}
                />
              </label>

              <button
                type="button"
                onClick={() => saveSettingsMutation.mutate()}
                disabled={saveSettingsMutation.isPending || !canEditSettings}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                設定を保存
              </button>
              {!activeGuildAccess?.isOwner ? (
                <p className="text-xs text-slate-500">設定変更にはサーバーオーナー権限が必要です。オーナーに依頼して設定を更新してください。</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeSection === 'giveaway-create' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">Giveaway作成</h2>
            <form
              className="space-y-4"
              onSubmit={handleSubmit((formValues) => {
                createMutation.mutate(formValues);
              })}
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
                  {...register('title')}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
                {errors.title ? <p className="mt-1 text-xs text-rose-600">{errors.title.message}</p> : null}
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">📝 説明</span>
                <textarea
                  {...register('description')}
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
                  onClick={() => {
                    setValue('autoRepeat', !autoRepeat, { shouldDirty: true, shouldValidate: true });
                  }}
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
                      setValue('deadlineText', selected ? format(selected, 'yyyy/MM/dd HH:mm') : '', {
                        shouldDirty: true,
                        shouldValidate: true
                      });
                    }}
                    onChangeRaw={(event) => {
                      if (!event) {
                        return;
                      }
                      const value = (event.target as HTMLInputElement).value;
                      setValue('deadlineText', value, { shouldDirty: true, shouldValidate: true });
                      const parsed = chrono.ja.parseDate(value) ?? chrono.en.parseDate(value);
                      setSelectedDeadlineDate(parsed ?? null);
                    }}
                    showTimeSelect
                    timeIntervals={5}
                    dateFormat="yyyy/MM/dd HH:mm"
                    placeholderText="自然言語 or yyyy/mm/dd"
                    popperPlacement="bottom-start"
                    popperClassName="dashboard-datepicker-popper"
                    calendarClassName="dashboard-datepicker-calendar"
                    wrapperClassName="w-full"
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              ) : (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">⏱️ 間隔</span>
                  <input
                    required
                    {...register('deadlineText')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="1h, 20m, 1w2d3h"
                  />
                </label>
              )}
              {errors.deadlineText ? <p className="text-xs text-rose-600">{errors.deadlineText.message}</p> : null}

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">🏆 当選人数</span>
                <input
                  required
                  type="number"
                  min={1}
                  {...register('winnerCount', { valueAsNumber: true })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
                {errors.winnerCount ? <p className="mt-1 text-xs text-rose-600">{errors.winnerCount.message}</p> : null}
              </label>

              <button
                type="submit"
                disabled={createMutation.isPending || !activeGuildAccess?.canCreateGiveaway || allowedChannelOptions.length === 0}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Giveawayを作成
              </button>
              {!activeGuildAccess?.canCreateGiveaway ? (
                <p className="text-xs text-slate-500">Giveaway作成権限がありません。作成可能ロール付与または管理者/オーナー権限での実行が必要です。</p>
              ) : null}
              {activeGuildAccess?.canCreateGiveaway && allowedChannelOptions.length === 0 ? (
                <p className="text-xs text-slate-500">作成可能チャンネルが未設定です。サーバー設定で作成先チャンネルを追加してください。</p>
              ) : null}
            </form>
          </section>
        ) : null}

        {activeSection === 'giveaway-list' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 space-y-3">
              <h2 className="text-base font-semibold">Giveaway 一覧</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">ステータス</span>
                  <select
                    value={giveawayFilter}
                    onChange={(event) => setGiveawayFilter(event.target.value as GiveawayFilterKey)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                  >
                    <option value="all">すべて</option>
                    <option value="active">進行中</option>
                    <option value="claim-open">請求受付中</option>
                    <option value="claim-ended">請求終了</option>
                    <option value="ended">終了</option>
                    <option value="stopped">停止</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">作成者</span>
                  <select
                    value={giveawayCreatorFilter}
                    onChange={(event) => setGiveawayCreatorFilter(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                  >
                    <option value="">すべて</option>
                    {giveawayCreatorOptions.map((creator) => (
                      <option key={creator.id} value={creator.id}>
                        {creator.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">チャンネル</span>
                  <select
                    value={giveawayChannelFilter}
                    onChange={(event) => setGiveawayChannelFilter(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                  >
                    <option value="">すべて</option>
                    {channelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">作成日（開始）</span>
                  <input
                    type="date"
                    value={giveawayCreatedFromFilter}
                    onChange={(event) => setGiveawayCreatedFromFilter(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">作成日（終了）</span>
                  <input
                    type="date"
                    value={giveawayCreatedToFilter}
                    onChange={(event) => setGiveawayCreatedToFilter(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">並び替え</span>
                  <select
                    value={giveawaySort}
                    onChange={(event) => setGiveawaySort(event.target.value as GiveawaySortKey)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2"
                  >
                    <option value="created-at-desc">作成日（新しい順）</option>
                    <option value="created-at-asc">作成日（古い順）</option>
                    <option value="end-at-desc">終了日（新しい順）</option>
                    <option value="end-at-asc">終了日（古い順）</option>
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">キーワード（タイトル・説明）</span>
                <input
                  value={giveawayKeywordFilter}
                  onChange={(event) => setGiveawayKeywordFilter(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="例: Nitro"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <input
                  value={savedGiveawayFilterName}
                  onChange={(event) => setSavedGiveawayFilterName(event.target.value)}
                  className="min-w-[180px] rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="保存名"
                />
                <button
                  type="button"
                  onClick={saveCurrentGiveawayFilter}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                >
                  条件を保存
                </button>
                <select
                  value={selectedSavedGiveawayFilterId}
                  onChange={(event) => setSelectedSavedGiveawayFilterId(event.target.value)}
                  className="min-w-[200px] rounded-md border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value="">保存済み条件を選択</option>
                  {savedGiveawayFilters.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applySavedGiveawayFilter}
                  disabled={!selectedSavedGiveawayFilterId}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                >
                  適用
                </button>
                <button
                  type="button"
                  onClick={deleteSavedGiveawayFilter}
                  disabled={!selectedSavedGiveawayFilterId}
                  className="rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  削除
                </button>
                <button
                  type="button"
                  onClick={resetGiveawaySearchCriteria}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                >
                  条件をリセット
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {filteredGiveaways.map((giveaway) => {
                const channel = channelMap.get(giveaway.channelId);
                const creator = giveawayUserMap.get(giveaway.createdBy);
                const winners = giveaway.winners.map((winnerId) => giveawayUserMap.get(winnerId) ?? {
                  id: winnerId,
                  name: winnerId,
                  avatarUrl: ''
                });
                const claimState = getClaimState(giveaway);
                const statusLabel =
                  giveaway.status === 'active'
                    ? '進行中'
                    : giveaway.status === 'stopped'
                      ? '停止'
                      : claimState === 'open'
                        ? '終了（請求受付中）'
                        : claimState === 'closed'
                          ? '終了（請求終了）'
                          : '終了';

                return (
                  <article key={giveaway.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">🎉 {giveaway.title}</h3>
                      <span className="text-xs text-slate-500">
                        {giveaway.status === 'active' ? '終了予定' : '終了日時'}: {formatDateTime(giveaway.endAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px]">#</span>
                        {channel ? stripLeadingMarker(channel.name) : '不明なチャンネル'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-indigo-700">{statusLabel}</span>
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
                        giveaway.createdBy
                      )}
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">当選者:</span>{' '}
                      {winners.length > 0 ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {winners.map((winner) => (
                            <span key={winner.id} className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1">
                              {winner.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={winner.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
                              ) : null}
                              {winner.name}
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
                        disabled={endMutation.isPending || giveaway.status !== 'active'}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-500 disabled:opacity-50"
                      >
                        終了
                      </button>
                      <button
                        type="button"
                        onClick={() => rerollMutation.mutate(giveaway.id)}
                        disabled={rerollMutation.isPending || giveaway.status !== 'ended'}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        再抽選
                      </button>
                    </div>
                  </article>
                );
              })}
              {giveawaysQuery.data && filteredGiveaways.length === 0 ? (
                <p className="text-sm text-slate-500">条件に一致するGiveawayはありません。</p>
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

      {(optionsQuery.error || settingsQuery.error || giveawaysQuery.error || giveawayUsersQuery.error) ? (
        <div className="fixed bottom-4 left-4 flex max-w-sm flex-col gap-2 rounded-md bg-rose-100 px-3 py-2 text-xs text-rose-700">
          <div>
            {String(optionsQuery.error ?? settingsQuery.error ?? giveawaysQuery.error ?? giveawayUsersQuery.error)}
          </div>
          {optionsQuery.error && activeGuildId ? (
            <button
              type="button"
              onClick={() => setGuildOptionsRefreshNonce((current) => current + 1)}
              className="self-start rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
            >
              Discordから再取得
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardApp({
  initialSession,
  initialSessionFetchedAt
}: {
  initialSession: AuthSession | null;
  initialSessionFetchedAt: number;
}) {
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
      <DashboardContent
        initialSession={initialSession}
        initialSessionFetchedAt={initialSessionFetchedAt}
      />
    </QueryClientProvider>
  );
}
