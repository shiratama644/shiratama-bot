import { useState } from 'react';
import type { FormEvent } from 'react';
import dayjs from 'dayjs';
import { VueRoleEditor } from './components/VueRoleEditor';
import './App.css';

type Giveaway = {
  id: string;
  title: string;
  description: string | null;
  endAt: string;
  winnerCount: number;
  channelId: string;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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
  const [message, setMessage] = useState('');

  const fetchGiveaways = async () => {
    if (!guildId) {
      return;
    }
    const res = await fetch(`${apiBase}/api/giveaways/${guildId}`);
    const data = await res.json();
    setGiveaways(data.giveaways ?? []);
  };


  const submitGiveaway = async (event: FormEvent) => {
    event.preventDefault();

    const res = await fetch(`${apiBase}/api/giveaways`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId, 'x-admin-token': adminToken },
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
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ guildId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? '操作に失敗しました。');
    }
    await fetchGiveaways();
  };

  return (
    <main className="container">
      <h1>Giveaway Bot Dashboard</h1>

      <section className="panel">
        <h2>基本設定</h2>
        <div className="grid">
          <label>
            Guild ID
            <input value={guildId} onChange={(e) => setGuildId(e.target.value)} required />
          </label>
          <label>
            Channel ID
            <input value={channelId} onChange={(e) => setChannelId(e.target.value)} required />
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
      </section>

      <VueRoleEditor apiBase={apiBase} guildId={guildId} adminToken={adminToken} />

      <section className="panel">
        <h2>Giveaway作成 (React)</h2>
        <form
          className="grid"
          onSubmit={(event) => {
            void submitGiveaway(event).catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : 'エラー');
            });
          }}
        >
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

      <section className="panel">
        <h2>開催中Giveaway（追加機能）</h2>
        <button onClick={() => void fetchGiveaways()}>一覧更新</button>
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
                    void withAdmin(`/api/giveaways/${g.id}/end`).catch((error: unknown) => {
                      setMessage(error instanceof Error ? error.message : 'エラー');
                    });
                  }}
                >
                  強制終了
                </button>
                <button
                  onClick={() => {
                    void withAdmin(`/api/giveaways/${g.id}/reroll`).catch((error: unknown) => {
                      setMessage(error instanceof Error ? error.message : 'エラー');
                    });
                  }}
                >
                  再抽選
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {message && <p className="message">{message}</p>}
    </main>
  );
}

export default App;
