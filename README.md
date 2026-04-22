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
