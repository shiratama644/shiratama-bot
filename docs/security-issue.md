# applejp-bot セキュリティリスク一覧（外部公開前チェック）

このドキュメントは、`backend` と `web` の現行実装を確認し、**外部公開時点でリスクになり得る事項を網羅的に列挙**したものです。  
（確認日: 2026-05-16）

## 対象範囲

- Backend API (`backend/src/**/*.ts`)
- Discord Bot 処理 (`backend/src/**/*.ts`)
- Web Dashboard (`web/src/**/*.tsx`, `web/src/**/*.ts`)
- 実行/設定ファイル（`.env.example`, `next.config.ts` など）

## 重大度の定義

- **Critical**: 直ちに悪用可能で、機密性・完全性に重大な影響
- **High**: 悪用難易度が低めで、権限奪取・不正操作・大きなサービス影響につながる
- **Medium**: 条件次第で悪用される、または公開運用では事故率が高い
- **Low**: 直接悪用はされにくいが、長期運用で問題化しやすい

---

## リスク一覧（現状）

### 1) CSRF 対策が Cookie 属性依存（トークン検証なし）
- **重大度**: High
- **現状**:
  - 認証は Cookie ベース（`HttpOnly; SameSite=Lax`）だが、状態変更系 API に CSRF トークン検証がない。
  - 該当: `backend/src/api.ts` (`toCookieHeader`, `/api/settings/:guildId`, `/api/giveaways`, `/api/giveaways/:id/end`, `/api/giveaways/:id/reroll`)
- **リスク**:
  - 将来 Cookie 属性変更や同一サイト条件の崩れで、意図しない操作リクエストが成立する余地がある。
- **推奨対応**:
  - CSRF トークン（Double Submit または Synchronizer Token）を導入。
  - 状態変更 API に `Origin`/`Referer` の厳密検証を追加。

### 2) API レート制限が未実装（認証/操作 API の DoS 耐性不足）
- **重大度**: High
- **現状**:
  - `/api/auth/login`, `/api/auth/callback`, `/api/giveaways` などにレート制限がない。
  - 該当: `backend/src/api.ts`
- **リスク**:
  - 外部公開後に連打・ボットアクセスで Discord API / DB / Bot 処理が過負荷化し、可用性低下。
- **推奨対応**:
  - IP / セッション / エンドポイント単位でレート制限を導入。
  - 認証系はさらに厳しい閾値を設定し、失敗回数に応じたバックオフを追加。

### 3) エラーメッセージの内部情報露出
- **重大度**: High
- **現状**:
  - API が `Error.message` をそのままクライアント返却する。
  - Discord Interaction でも `Error.message` をユーザーに表示する。
  - 該当: `backend/src/errors.ts` (`getErrorMessage`), `backend/src/api.ts` (`respondError`), `backend/src/interactions/index.ts`
- **リスク**:
  - 実装詳細・内部状態・外部連携失敗の詳細が攻撃者の足がかりになる。
- **推奨対応**:
  - 外部返却は汎用メッセージに統一し、詳細はサーバーログのみ保存。
  - エラーコード方式（例: `ERR_AUTH_001`）へ移行。

### 4) セキュリティヘッダー未整備（CSP/HSTS/X-Frame-Options など）
- **重大度**: Medium
- **現状**:
  - 明示的なセキュリティヘッダー設定がない。
  - `web/next.config.ts` に header 設定なし。
  - `backend/src/api.ts` も CORS 以外のヘッダーを付与していない。
- **リスク**:
  - クリックジャッキング、不要な参照元送信、将来の XSS 被害拡大を防ぎにくい。
- **推奨対応**:
  - `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` を導入。

### 5) Cookie の Secure 属性が `NODE_ENV` 依存
- **重大度**: Medium
- **現状**:
  - `Secure` は `NODE_ENV === 'production'` のときのみ付与。
  - 該当: `backend/src/api.ts` (`toCookieHeader`, `clearCookieHeader`)
- **リスク**:
  - 本番環境でも環境変数誤設定時に Secure なし Cookie が発行される。
- **推奨対応**:
  - `NODE_ENV` 依存ではなく、HTTPS 前提環境で常時 `Secure` を強制。
  - 起動時に本番設定検証（必須環境変数チェック）を追加。

### 6) セッション/State ストアがプロセスメモリのみ
- **重大度**: Medium
- **現状**:
  - `sessionStore` と `oauthStateStore` が `Map` 実装（単一プロセス内）。
  - 該当: `backend/src/api.ts`
- **リスク**:
  - 再起動・スケールアウトで認証状態が不整合。
  - 多インスタンス公開時に想定外の認証失敗や運用障害が起きやすい。
- **推奨対応**:
  - Redis 等の共有セッションストアへ移行。
  - セッション失効/再発行ポリシーを明文化。

### 7) Discord コマンド権限の初期状態が広すぎる
- **重大度**: Medium
- **現状**:
  - `giveawayCreatorRoleIds` が空の場合、`assertCanManageGiveaways` が許可扱いになる。
  - 該当: `backend/src/commands/permissions.ts`
- **リスク**:
  - 初期設定不備時、サーバー参加者が Giveaway 管理コマンドを実行できる可能性。
- **推奨対応**:
  - デフォルト拒否（オーナー/管理者のみ許可）へ変更。
  - 初回セットアップ完了まで作成系コマンドをロック。

### 8) Guild メンバー全件取得/API 返却による情報露出・負荷増大
- **重大度**: Medium
- **現状**:
  - `getGuildMembers` で全メンバー取得し、`/api/guilds/:guildId/options` で返却。
  - 返却データに `id`, `name`, `avatarUrl` を含む。
  - 該当: `backend/src/api.ts`
- **リスク**:
  - 大規模サーバーで高負荷化。
  - ダッシュボード権限者へ不要なユーザー情報を広く開示。
- **推奨対応**:
  - 最小権限化（必要最小限データのみ）。
  - ページング/検索方式へ変更し、全件取得を避ける。

### 9) DB 接続の暗号化要件がコードで強制されていない
- **重大度**: Medium
- **現状**:
  - `new Pool({ connectionString })` のみで SSL 要件を明示していない。
  - 該当: `backend/src/db/client.ts`
- **リスク**:
  - 構成次第で平文接続となり、ネットワーク盗聴リスクが残る。
- **推奨対応**:
  - 本番は SSL 必須（証明書検証含む）を強制。
  - 起動時に非SSL接続を拒否。

### 10) 監査ログ（セキュリティイベント追跡）の不足
- **重大度**: Medium
- **現状**:
  - コンソールログはあるが、誰が何を変更したかの永続監査ログがない。
  - 該当: `backend/src/utils/logger.ts`, 各 API/Command 実装
- **リスク**:
  - 事故時の原因追跡・不正操作調査が困難。
- **推奨対応**:
  - 設定変更、作成、終了、再抽選、ログイン成功/失敗を監査テーブルに保存。

### 11) 入力サイズ上限の不足（リソース消費リスク）
- **重大度**: Low
- **現状**:
  - `title`, `description`, `deadline` などに実用的な最大長制約がない。
  - 該当: `backend/src/api.ts` (`createSchema`), `backend/src/giveaway/service.ts`
- **リスク**:
  - 極端に大きい入力により Discord API 失敗や処理負荷増大を招く。
- **推奨対応**:
  - Zod で最大長・許可文字を定義し、早期拒否する。

### 12) 当選者抽選が `Math.random()` 依存（予測可能性・公平性リスク）
- **重大度**: Low
- **現状**:
  - `pickWinners` が `Math.random()` を使用。
  - 該当: `backend/src/giveaway/service.ts`
- **リスク**:
  - 厳密な公平性監査が必要な用途では、予測耐性が不十分。
- **推奨対応**:
  - `crypto.getRandomValues` / `crypto.randomInt` 等の暗号学的乱数へ移行。

---

## 外部公開前に最低限実施すべき項目（優先順）

1. CSRF 対策を実装（トークン + Origin 検証）
2. API レート制限を導入（認証系を最優先）
3. エラー返却をサニタイズ（内部詳細非公開化）
4. 本番向け Cookie/TLS/セキュリティヘッダーを強制
5. 権限デフォルトを「拒否」に変更
6. セッションストアを共有化（Redis 等）
7. 監査ログを実装

---

## 補足

- 現行コードでは SQL は主に Kysely のパラメータバインドを利用しており、明確な SQL Injection 起点は確認しにくい構成です。  
  ただし、外部公開時は上記の認可・防御層（CSRF/Rate Limit/監査）不足がより重大なリスクになります。
