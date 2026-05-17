# 導入候補ライブラリ一覧（web / backend）

`docs/issues/security.md` と `docs/feature-list.md`、`docs/issues/program.md` をもとに、現時点で優先度が高い導入候補を整理します。

## backend

| ライブラリ | 主な用途 | 導入理由（対応したい課題） |
|---|---|---|
| `csrf-csrf` | Double Submit Cookie 方式の CSRF トークン検証 | `security.md` の「CSRF 対策不足（High）」に直接対応。Cookie 属性依存から明示的トークン検証へ移行できる。 |
| `rate-limiter-flexible` | 認証/API単位のレート制限（IP・キー単位） | `security.md` の「API レート制限未実装（High）」対応。`/api/auth/*` と Giveaway 系操作のDoS耐性を上げる。 |
| `ioredis` | Redis クライアント（共有ストア） | `security.md` の「セッション/State ストアがメモリのみ（Medium）」対応。セッション共有化、レート制限カウンタ、将来のジョブ/キャッシュ基盤に再利用可能。 |
| `pino` / `pino-http` | 構造化ログ・HTTPログ・監査ログ基盤 | `security.md` の「監査ログ不足（Medium）」と「内部エラー露出（High）」への土台。外部返却メッセージを抑えつつ、詳細はサーバーログに安全に残せる。 |
| `@sentry/node` | 例外監視・アラート・トレース | 障害検知を強化し、`feature-list.md` の「失敗時リトライ/通知改善」に必要な運用監視を補強。公開後の不具合の早期発見に有効。 |
| `@hono/swagger-ui` + `@hono/zod-openapi` | OpenAPI 生成/公開（API仕様の可視化） | `program.md` にある仕様不一致（入力フォーマットなど）を減らすため、API 入出力仕様を機械可読で統一。フロント・バックの認識差分を抑える。 |

## web

| ライブラリ | 主な用途 | 導入理由（対応したい課題） |
|---|---|---|
| `react-hook-form` + `@hookform/resolvers` | フォーム状態管理とバリデーション連携 | `feature-list.md` の「入力値バリデーションの可視化強化」「下書き保存機能」の実装効率を上げる。エラー表示の一貫化にも有効。 |
| `zod`（web側にも導入） | スキーマ定義・型安全な入力検証 | backend と同じ検証ルールをフロントでも適用しやすくし、`program.md` の仕様不一致や入力ゆらぎを減らす。 |
| `@tanstack/react-table` | 高機能テーブル（検索・ソート・ページング） | `feature-list.md` の「フィルター/検索の拡張」「監査ログ閲覧」「統計ダッシュボード一覧表示」に必要なUI基盤を提供。 |
| `recharts` | グラフ描画（時系列・比較可視化） | `feature-list.md` の「参加・当選統計ダッシュボード」に直結。期間比較や分布表示を実装しやすい。 |
| `next-safe-middleware` | CSP などのセキュリティヘッダー設定支援 | `security.md` の「セキュリティヘッダー未整備（Medium）」に対応。Next.js 側で CSP / Referrer-Policy などを管理しやすい。 |
| `dompurify` | ユーザー入力のHTMLサニタイズ | 将来的に説明文・テンプレート表示などでリッチテキスト化した場合の XSS リスクを低減。防御層を早期に用意できる。 |

## 優先導入順（短期）

1. backend: `csrf-csrf`, `rate-limiter-flexible`, `ioredis`
2. web: `react-hook-form`, `@hookform/resolvers`, `zod`
3. backend/web 共通運用強化: `pino`, `pino-http`, `@sentry/node`
4. UX強化: `@tanstack/react-table`, `recharts`
5. ハードニング: `next-safe-middleware`, `dompurify`

