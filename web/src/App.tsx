import { useState } from 'react';
import type { FormEvent } from 'react';
import dayjs from 'dayjs';
import './App.css';

type Giveaway = {
  id: string;
  title: string;
  description: string | null;
  endAt: string;
  winnerCount: number;
  channelId: string;
};

type GuildSettings = {
  language: 'en' | 'ja';
  managerRoleIds: string[];
  giveawayChannelIds: string[];
  defaultClaimDeadline: string | null;
};

type OptionItem = {
  id: string;
  name: string;
};

type ViewKey = 'connection' | 'settings' | 'create' | 'manage';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const defaultSettings: GuildSettings = {
  language: 'en',
  managerRoleIds: [],
  giveawayChannelIds: [],
  defaultClaimDeadline: null
};

function App() {
  const [guildId, setGuildId] = useState(import.meta.env.VITE_GUILD_ID ?? '');
  const [channelId, setChannelId] = useState('');
  const [userId, setUserId] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('10m');
  const [winnerCount, setWinnerCount] = useState(1);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [settings, setSettings] = useState<GuildSettings>(defaultSettings);
  const [roleOptions, setRoleOptions] = useState<OptionItem[]>([]);
  const [channelOptions, setChannelOptions] = useState<OptionItem[]>([]);
  const [activeView, setActiveView] = useState<ViewKey>('connection');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [message, setMessage] = useState('');

  const handleErrorMessage = (error: unknown) => {
    setMessage(error instanceof Error ? error.message : 'エラー');
  };

  const closeMenu = () => setIsMenuOpen(false);

  const getAdminHeaders = () => ({
    'Content-Type': 'application/json',
    'x-admin-token': adminToken
  });

  const fetchGiveaways = async () => {
    if (!guildId) {
      return;
    }
    const res = await fetch(`${apiBase}/api/giveaways/${guildId}`);
    const data = await res.json();
    setGiveaways(data.giveaways ?? []);
  };

  const fetchGuildContext = async () => {
    if (!guildId) {
      throw new Error('Guild IDを入力してください。');
    }
    if (!adminToken) {
      throw new Error('Admin Tokenを入力してください。');
    }

    const [settingsRes, optionsRes] = await Promise.all([
      fetch(`${apiBase}/api/settings/${guildId}`),
      fetch(`${apiBase}/api/guilds/${guildId}/options`, {
        headers: {
          'x-admin-token': adminToken
        }
      })
    ]);

    const settingsData = await settingsRes.json().catch(() => ({}));
    if (!settingsRes.ok) {
      throw new Error(settingsData.error ?? '設定の取得に失敗しました。');
    }
    const optionsData = await optionsRes.json().catch(() => ({}));
    if (!optionsRes.ok) {
      throw new Error(optionsData.error ?? 'サーバー情報の取得に失敗しました。');
    }

    const loadedSettings = settingsData.settings ?? defaultSettings;
    const loadedChannels = optionsData.channels ?? [];
    setSettings({
      language: loadedSettings.language === 'ja' ? 'ja' : 'en',
      managerRoleIds: loadedSettings.managerRoleIds ?? [],
      giveawayChannelIds: loadedSettings.giveawayChannelIds ?? [],
      defaultClaimDeadline: loadedSettings.defaultClaimDeadline ?? null
    });
    setRoleOptions(optionsData.roles ?? []);
    setChannelOptions(loadedChannels);
    if (!channelId && loadedChannels.length > 0) {
      const preferredChannelId =
        loadedSettings.giveawayChannelIds?.find((id: string) =>
          loadedChannels.some((channel: OptionItem) => channel.id === id)
        ) ?? loadedChannels[0].id;
      setChannelId(preferredChannelId);
    }
    setMessage('設定と候補一覧を読み込みました。');
  };

  const saveSettings = async () => {
    if (!guildId) {
      throw new Error('Guild IDを入力してください。');
    }

    const res = await fetch(`${apiBase}/api/settings/${guildId}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(settings)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? '設定保存に失敗しました。');
    }
    setMessage('設定を保存しました。');
  };

  const submitGiveaway = async (event: FormEvent) => {
    event.preventDefault();

    const res = await fetch(`${apiBase}/api/giveaways`, {
      method: 'POST',
      headers: { ...getAdminHeaders(), 'x-user-id': userId },
      body: JSON.stringify({
        guildId,
        channelId,
        title,
        description,
        deadline,
        winnerCount
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? '作成に失敗しました。');
    }

    setMessage(`作成完了: ${data.giveaway.title}`);
    await fetchGiveaways();
  };

  const withAdmin = async (path: string) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ guildId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? '操作に失敗しました。');
    }
    await fetchGiveaways();
  };

  const onSelectMulti = (selected: HTMLSelectElement) =>
    Array.from(selected.selectedOptions, (option) => option.value);

  const openView = (view: ViewKey) => {
    setActiveView(view);
    closeMenu();
  };

  return (
    <main className="container">
      <header className="topbar">
        <button className="hamburger" onClick={() => setIsMenuOpen((open) => !open)} aria-label="メニューを開く">
          ☰
        </button>
        <h1>Giveaway Bot Dashboard</h1>
      </header>

      <div className="layout">
        <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
          <button className={activeView === 'connection' ? 'active' : ''} onClick={() => openView('connection')}>
            接続
          </button>
          <button className={activeView === 'settings' ? 'active' : ''} onClick={() => openView('settings')}>
            サーバー設定
          </button>
          <button className={activeView === 'create' ? 'active' : ''} onClick={() => openView('create')}>
            Giveaway作成
          </button>
          <button className={activeView === 'manage' ? 'active' : ''} onClick={() => openView('manage')}>
            開催中管理
          </button>
        </aside>

        <section className="content">
          {activeView === 'connection' && (
            <section className="panel">
              <h2>接続設定</h2>
              <div className="grid">
                <label>
                  Guild ID
                  <input value={guildId} onChange={(e) => setGuildId(e.target.value)} required />
                </label>
                <label>
                  User ID
                  <input value={userId} onChange={(e) => setUserId(e.target.value)} required />
                </label>
                <label>
                  Admin Token
                  <input value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
                </label>
              </div>
              <div className="actions">
                <button
                  onClick={() => {
                    void fetchGuildContext().catch(handleErrorMessage);
                  }}
                >
                  サーバー情報を読み込む
                </button>
              </div>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="panel">
              <h2>コマンド同等のサーバー設定</h2>
              <div className="grid">
                <label>
                  言語
                  <select
                    value={settings.language}
                    onChange={(e) =>
                      setSettings((current) => ({
                        ...current,
                        language: e.target.value === 'ja' ? 'ja' : 'en'
                      }))
                    }
                  >
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                  </select>
                </label>
                <label>
                  既定Claim期限
                  <input
                    value={settings.defaultClaimDeadline ?? ''}
                    onChange={(e) =>
                      setSettings((current) => ({
                        ...current,
                        defaultClaimDeadline: e.target.value.trim() || null
                      }))
                    }
                    placeholder="24h"
                  />
                </label>
              </div>

              <div className="grid">
                <label>
                  Giveaway作成ロール（複数選択）
                  <select
                    multiple
                    value={settings.managerRoleIds}
                    onChange={(e) =>
                      setSettings((current) => ({
                        ...current,
                        managerRoleIds: onSelectMulti(e.currentTarget)
                      }))
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Giveaway対象チャンネル（複数選択）
                  <select
                    multiple
                    value={settings.giveawayChannelIds}
                    onChange={(e) =>
                      setSettings((current) => ({
                        ...current,
                        giveawayChannelIds: onSelectMulti(e.currentTarget)
                      }))
                    }
                  >
                    {channelOptions.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="actions">
                <button
                  onClick={() => {
                    void saveSettings().catch(handleErrorMessage);
                  }}
                >
                  設定を保存
                </button>
              </div>
            </section>
          )}

          {activeView === 'create' && (
            <section className="panel">
              <h2>Giveaway作成</h2>
              <form
                className="grid"
                onSubmit={(event) => {
                  void submitGiveaway(event).catch(handleErrorMessage);
                }}
              >
                <label>
                  投稿チャンネル
                  <select value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
                    <option value="" disabled>
                      チャンネルを選択
                    </option>
                    {channelOptions.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  題名 (必須)
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </label>
                <label>
                  説明
                  <input value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label>
                  期限 (必須)
                  <input value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
                </label>
                <label>
                  当たり人数
                  <input
                    type="number"
                    min={1}
                    value={winnerCount}
                    onChange={(e) => setWinnerCount(Number(e.target.value))}
                    required
                  />
                </label>
                <button type="submit">作成</button>
              </form>
            </section>
          )}

          {activeView === 'manage' && (
            <section className="panel">
              <h2>開催中Giveaway</h2>
              <button onClick={() => void fetchGiveaways().catch(handleErrorMessage)}>一覧更新</button>
              <ul className="giveawayList">
                {giveaways.map((g) => (
                  <li key={g.id}>
                    <div>
                      <strong>{g.title}</strong> / 締切 {dayjs(g.endAt).format('YYYY/MM/DD HH:mm')}
                    </div>
                    <div>{g.description ?? '説明なし'}</div>
                    <div className="actions">
                      <button
                        className="danger"
                        onClick={() => {
                          void withAdmin(`/api/giveaways/${g.id}/end`).catch(handleErrorMessage);
                        }}
                      >
                        強制終了
                      </button>
                      <button
                        onClick={() => {
                          void withAdmin(`/api/giveaways/${g.id}/reroll`).catch(handleErrorMessage);
                        }}
                      >
                        再抽選
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      </div>

      {message && <p className="message">{message}</p>}
    </main>
  );
}

export default App;
