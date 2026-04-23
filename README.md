# applejp-bot Giveaway Bot

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
pg_ctl -D $PREFIX/var/lib/postgresql -l $PREFIX/var/lib/postgresql/logfile start
createuser -s $(whoami)
psql -d postgres
\password
\q
createdb giveaway
```

`psql -d postgres` 実行後、`\password` の対話プロンプトで「現在のユーザー（`$(whoami)`）」の強固なパスワードを入力してください。

`backend/.env` の `DATABASE_URL` は以下を使えます。

```bash
DATABASE_URL=postgres://DB_USER:DB_PASSWORD@localhost:5432/giveaway
```

- `DB_USER`: `whoami` コマンドの出力値（実際のユーザー名）
- `DB_PASSWORD`: `\password` で実際に設定した値

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
