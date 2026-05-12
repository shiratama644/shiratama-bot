# applejp-bot Giveaway Bot

Discord Giveaway Bot（バックエンド）+ 管理Web（フロントエンド）のモノレポです。  
現在は **Node.js + Discord.js + Express + PostgreSQL(Kysely)** と **Vite + React + Vue** で構成されています。

---

## 1. リポジトリ構成

- `backend/`: Discord Bot本体、Giveawayロジック、管理API、DBアクセス
- `web/`: 管理ダッシュボード（React + Vue混在）
- `_test_/`: ルートレベルの Node test（主にUI/ユーティリティ仕様の回帰テスト）

---

## 2. 現在の仕様（機能一覧）

### 2.1 Discordスラッシュコマンド

登録コマンド:

- `/gc`  
  Giveaway作成モーダルを表示して作成
- `/gsettings`  
  サーバー設定モーダルを表示して保存
- `/gend id:<giveawayId>`  
  開催中Giveawayを手動終了
- `/gstop id:<giveawayId>`  
  対象Giveawayの自動リピートを停止
- `/gstart id:<giveawayId>`  
  対象Giveawayの自動リピートを再開（intervalがある場合のみ）
- `/greroll id:<giveawayId>`  
  終了済みGiveawayの再抽選

`/gend` `/gstop` `/gstart` `/greroll` の `id` はオートコンプリート対応です。

---

### 2.2 `/gc` モーダル仕様（Giveaway作成）

入力項目:

- Prize（必須, text）
- Auto Repeating（必須, select: `disable` / `enable`）
- Duration (Interval)（必須, text）
- Number of Winners（必須, text, 初期値 `1`）
- Description（任意, text）

作成時の挙動:

- `Duration` は締切入力として使われます
- Auto Repeating = Enable の場合:
  - `Duration` を interval としても利用
  - `autoRepeat=true` で保存
- Auto Repeating = Disable の場合:
  - 単発Giveawayとして保存
- winnerCount は整数化され、`NaN` の場合は `1` にフォールバック
- claimDeadline はサーバー設定の `defaultClaimDeadline` を引き継ぎ

締切フォーマット（`parseDeadline`）:

- 相対: `10m`, `10h`, `5d`（大文字小文字許容）
- 日付: `YYYY/MM/DD`（その日の `23:59:59.999` 扱い）
- `0h` `0d` など非正の値はエラー

---

### 2.3 `/gsettings` モーダル仕様（サーバー設定）

保存対象:

- `language`: `en` / `ja`（UI選択）
- `managerRoleIds`: Giveaway管理を許可するロールID配列
- `giveawayChannelIds`: Giveaway作成先として許可するチャンネルID配列
- `defaultClaimDeadline`: 例 `10m`, `1h`, `3d`, `1w`（空は `null`）

備考:

- `managerRoleIds` が空なら管理権限チェックは実質無効（誰でも実行可）

---

### 2.4 Giveawayメッセージ（Embed + Button）仕様

作成直後にチャンネルへEmbed投稿され、以下のボタンが表示されます:

- `🎉 Enter`（参加トグル）
- `📋 Copy ID`（Giveaway IDをephemeral表示）

Embed表示要素:

- Ends/Ended タイムスタンプ（相対 + 絶対）
- Host
- Entries
- Winners（開催中は人数、終了後は当選者メンションまたは `No winners`）
- Auto Repeat有効時: `Repeats: Every <interval>`
- Claim期限設定時:
  - 開催中: `Claim Window: <duration> after end`
  - 終了後: `Claim Deadline: <timestamp>`

ステータス別:

- `active`: 緑色, フッター `Click 🎉 Enter to participate`
- `ended` / `stopped`: 赤色, フッター `Ended`

---

### 2.5 ボタン操作仕様

- `giveaway:copy:<id>`  
  Giveaway IDを返信（ephemeral）
- `giveaway:toggle:<id>`  
  未参加なら参加登録、既参加なら「Leave Giveaway」確認導線を表示
- `giveaway:leave:<id>`  
  参加を取り消し
- `giveaway:claim:<id>`  
  Claim受付メッセージを返信（現状は通知のみ）

参加/離脱時は元GiveawayメッセージのEmbed（entriesなど）を更新します。

---

### 2.6 終了・抽選・再抽選・自動リピート仕様

#### 終了（自動/手動）

- Bot起動時に「締切済み未処理Giveaway」を回収して終了処理
- その後30秒ごとに `active && end_at <= now` を監視して終了処理
- 終了時:
  - 参加者からランダム抽選（重複なし）
  - `status=ended` と `winners` を保存
  - 元メッセージを更新
  - 元メッセージへの返信で結果通知

#### claim期限付き終了通知

- `claimDeadline` が有効な場合、終了通知に Claim Embed + `Claim Prize` ボタンを追加
- Claim Embedのフッターに `Claim • <giveawayId>` を設定

#### 自動リピート

- `autoRepeat=true` かつ `interval` があるGiveawayは、**自動終了時のみ**次回を自動作成
- 手動終了（`/gend` や API `/end`）では自動再作成しない

#### 再抽選

- `status=ended` のGiveawayのみ可
- 参加者から再度ランダム抽選して返信
- 当選者がいれば `winners` を更新

---

### 2.7 権限仕様

コマンド実行時:

- DMでは実行不可（guild内のみ）
- `managerRoleIds` が1つ以上設定されている場合、いずれかのロール保有者のみ実行可

管理API:

- 更新系エンドポイントは `x-admin-token` が必須
- `/api/giveaways` 作成時は `x-user-id` も必須
- 作成時、`managerRoleIds` が設定されている場合は Bot経由で対象ユーザーのロールを検証

---

## 3. 管理API仕様（Express）

ベースURL: `http://localhost:3000`（既定）

### 3.1 エンドポイント一覧

- `GET /api/roles/:guildId`  
  作成管理ロール一覧取得
- `PUT /api/roles/:guildId`  
  作成管理ロール一覧更新（`x-admin-token` 必須）

- `GET /api/giveaways/:guildId`  
  開催中Giveaway一覧取得
- `POST /api/giveaways`  
  Giveaway作成（`x-admin-token` + `x-user-id` 必須）
- `POST /api/giveaways/:id/end`  
  Giveaway手動終了（`x-admin-token` 必須）
- `POST /api/giveaways/:id/reroll`  
  Giveaway再抽選（`x-admin-token` 必須）

### 3.2 CORS / Origin 制御

- `CORS_ORIGIN` が設定されている場合:
  - `Origin` が設定値と一致しないリクエストは拒否
  - `Origin` がない場合は admin token を要求
  - `OPTIONS` は200応答

---

## 4. Web管理画面仕様（`web/`）

React画面 (`App.tsx`) + Vueコンポーネント (`RoleEditor.vue`) を併用。

提供UI:

- 基本設定入力（Guild ID / Channel ID / User ID / Admin Token）
- Giveaway作成フォーム（React）
- 開催中Giveaway一覧取得
- 強制終了
- 再抽選
- 作成権限ロール編集（Vue、カンマ区切り入力）

環境変数:

- `VITE_API_BASE_URL`（既定: `http://localhost:3000`）
- `VITE_GUILD_ID`

---

## 5. ID命名仕様（統一済み）

`backend/src/ids.ts` で一元管理:

- Modal IDs
  - `giveaway:create`
  - `giveaway:settings`
- Modal Field IDs
  - `giveaway:create:*`
  - `giveaway:settings:*`
- Button ID Prefix
  - `giveaway:toggle:`
  - `giveaway:copy:`
  - `giveaway:claim:`
  - `giveaway:leave:`
- Select Value
  - `disable`, `enable`
  - 言語: `en`, `ja`
  - winners初期値: `1`
- Embed補助
  - Claim footer prefix: `Claim • `

---

## 6. DB仕様（PostgreSQL）

起動時に `initSchema()` で自動作成/不足カラム追加します。

### `guild_settings`

- `guild_id` (PK)
- `manager_role_ids` (TEXT[])
- `language` (TEXT, default `en`)
- `giveaway_channel_ids` (TEXT[])
- `default_claim_deadline` (TEXT, nullable)

### `giveaways`

- `id` (PK)
- `guild_id`, `channel_id`, `message_id`
- `title`, `description`
- `end_at`
- `winner_count` (`>0`)
- `status` (`active` / `ended` / `stopped`)
- `created_by`, `created_at`
- `interval`, `auto_repeat`
- `claim_deadline`
- `winners` (TEXT[])

### `giveaway_entries`

- `giveaway_id` (FK -> giveaways.id, on delete cascade)
- `user_id`
- `joined_at`
- PK: (`giveaway_id`, `user_id`)

---

## 7. 環境変数

`backend/.env.example` をコピー:

```bash
cp backend/.env.example backend/.env
```

`backend/.env`:

```env
DISCORD_BOT_TOKEN=
DISCORD_APP_ID=
DISCORD_GUILD_ID=
DATABASE_URL=postgres://postgres:postgres@localhost:5432/giveaway
PORT=3000
ADMIN_API_TOKEN=change-me
CORS_ORIGIN=http://localhost:5173
```

`web/.env.example` をコピー:

```bash
cp web/.env.example web/.env
```

`web/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_GUILD_ID=
```

---

## 8. セットアップ / 起動

```bash
npm install
```

バックエンド開発起動:

```bash
npm run dev
```

フロントエンド開発起動:

```bash
npm run dev:web
```

同時起動:

```bash
npm run dev:all
```

---

## 9. 検証コマンド

```bash
npm run lint
npm run build
npm run test
```

---

## 10. 補足（既知の実装上の注意）

- `gsettings` で設定する `giveawayChannelIds` は現在、作成先制限の判定には未使用です（保存はされます）。
- `defaultClaimDeadline` は保存時にフォーマット厳密検証をしていないため、無効値を入れるとClaim表示が出ない場合があります。
