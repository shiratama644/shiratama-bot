# shiratama-bot Giveaway Bot

React + Vue.js + Vite のWeb管理画面と、Node.js + Discord.js + PostgreSQL のバックエンドで構成した Giveaway Discord Bot です。

## 主な機能

- Discordスラッシュコマンド `/gc` でモーダル入力からGiveaway作成
  - 題名(必須)
  - 説明
  - 期限(必須: `YYYY/MM/DD` または `10m` / `10h` / `5d`)
  - 当たり人数(整数)
- Embedボタンで参加/退出のトグル
- 締切到達で自動抽選、当選者メンションを**元メッセージへの返信**として送信
- Webダッシュボードで:
  - Giveaway作成権限ロール編集（Vueコンポーネント）
  - Giveaway作成フォーム（React）
  - 開催中Giveaway一覧
  - 強制終了
  - 再抽選

## 構成

- `backend/`: Discord bot + API + PostgreSQL
- `web/`: Vite frontend (React + Vue)

## 環境変数

`backend/.env.example` を `.env` にコピーして設定してください。

```bash
cp backend/.env.example backend/.env
```

`web/.env.example` も必要に応じて設定してください。

```bash
cp web/.env.example web/.env
```

## Termux環境でのPostgreSQL導入

```bash
pkg update && pkg upgrade -y
pkg install -y postgresql
initdb -D $PREFIX/var/lib/postgresql
pg_ctl -D $PREFIX/var/lib/postgresql -l logfile start
createuser -s $(whoami)
psql -c "ALTER USER $(whoami) WITH PASSWORD 'your_strong_password';"
createdb giveaway
```

`your_strong_password` は必ず自分で強力な値に置き換えてください。

`backend/.env` の `DATABASE_URL` は以下を使えます。

```bash
DATABASE_URL=postgres://<db_user>:<db_password>@localhost:5432/giveaway
```

- `<db_user>`: `whoami` で確認できるユーザー名（上記手順の `$(whoami)` と同じ）
- `<db_password>`: `ALTER USER` で設定したパスワード

停止する場合:

```bash
pg_ctl -D $PREFIX/var/lib/postgresql stop
```

## セットアップ

```bash
pnpm install
```

## 開発起動

バックエンド:

```bash
pnpm dev
```

フロントエンド:

```bash
pnpm dev:web
```

## 検証コマンド

```bash
pnpm lint
pnpm build
pnpm test
```
