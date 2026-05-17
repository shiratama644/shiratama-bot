# applejp-bot セキュリティ対応状況（外部公開前チェック）

このドキュメントは、`backend` と `web` の現行実装を確認し、**外部公開前に問題だったセキュリティ項目の対応状況**を整理したものです。  
（確認日: 2026-05-17）

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

## 対応状況（2026-05-17 時点）

### 1) CSRF 対策
- **状態**: 対応済み
- **実装**:
  - `backend/src/api/middleware/security.ts` で Double Submit Cookie 方式の CSRF トークンを付与・検証。
  - 状態変更系 API では `Origin` を `CORS_ORIGIN` と照合して拒否。

### 2) API レート制限
- **状態**: 対応済み
- **実装**:
  - `backend/src/api/middleware/security.ts` で認証系と変更系 API のレート制限を適用。
  - 同ミドルウェアでリクエストボディ上限も強制。

### 3) エラーメッセージの内部情報露出
- **状態**: 対応済み
- **実装**:
  - `backend/src/api/utils/response.ts` は公開用の汎用エラーメッセージだけを返す。
  - `backend/src/features/giveaway/interactions/index.ts` は Discord 上でも固定メッセージのみ表示。

### 4) セキュリティヘッダー
- **状態**: 対応済み
- **実装**:
  - `backend/src/api/middleware/security.ts` と `web/next.config.ts` で CSP / HSTS / X-Frame-Options / Referrer-Policy などを明示設定。

### 5) Cookie の Secure 属性
- **状態**: 対応済み
- **実装**:
  - `backend/src/features/auth/cookies.ts` は HTTPS 系 URL 設定から `Secure` を推論し、`NODE_ENV` のみには依存しない。
  - `backend/src/app.ts` は本番環境で `COOKIE_SECURE=false` を拒否。

### 6) セッション / OAuth State ストア
- **状態**: 対応済み
- **実装**:
  - `backend/src/db/authSessions.ts` と `backend/src/features/auth/sessionStore.ts` で DB 永続化へ移行。
  - `auth_sessions` / `oauth_states` テーブルで期限管理し、期限切れデータも定期削除する。

### 7) Discord コマンド権限の初期状態が広すぎる
- **状態**: 対応済み
- **実装**:
  - `backend/src/features/giveaway/permissions.ts` は設定未完了時にオーナー / 管理者のみ許可する。

### 8) Guild メンバー情報の過剰返却
- **状態**: 対応済み
- **実装**:
  - `backend/src/api/routes/guilds.ts` はチャンネル / ロール / ギルド概要のみ返却し、メンバー一覧を返さない。
  - `backend/src/api/routes/giveaways.ts` は Giveaway の作成者 / 当選者として既に関連する user ID だけを対象に限定プロフィール取得を行い、`web/src/components/dashboard-app.tsx` はその限定データだけで表示する。

### 9) DB 接続の暗号化要件がコードで強制されていない
- **状態**: 対応済み
- **実装**:
  - `backend/src/db/client.ts` で本番時 `DATABASE_SSL_MODE=require` を必須化し、証明書検証も既定で有効。

### 10) 監査ログ（セキュリティイベント追跡）の不足
- **状態**: 対応済み
- **実装**:
  - `backend/src/db/auditLogs.ts` と `backend/src/features/audit/index.ts` で監査ログを永続化。
  - 設定変更、作成、終了、再抽選、ログイン成功 / 失敗、ログアウトを記録。

### 11) 入力サイズ上限の不足（リソース消費リスク）
- **状態**: 対応済み
- **実装**:
  - `backend/src/api/schemas/giveaway.ts` と `backend/src/api/schemas/settings.ts` でサイズ上限を付与。
  - `backend/src/api/middleware/security.ts` でリクエストボディ全体の上限も強制。

### 12) 当選者抽選が `Math.random()` 依存（予測可能性・公平性リスク）
- **状態**: 対応済み
- **実装**:
  - `backend/src/features/giveaway/service.ts` の抽選は `crypto.randomInt()` を使用。

---

## まとめ

- 上記 12 項目は現行コードで対策済み。
- 今後の追加機能では、同じ基準（最小権限・公開エラーの固定化・永続監査・HTTPS 前提）を維持する。

---

## 補足

- 現行コードでは SQL は主に Kysely のパラメータバインドを利用しており、明確な SQL Injection 起点は確認しにくい構成です。  
  ただし、外部公開時は上記の認可・防御層（CSRF/Rate Limit/監査）不足がより重大なリスクになります。
