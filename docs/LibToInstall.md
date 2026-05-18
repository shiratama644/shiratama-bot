# 導入候補ライブラリ一覧（web / backend）

`docs/FeatureList.md` をもとに、現時点で優先度が高い導入候補を整理します。

## backend

| ライブラリ | 主な用途 | 導入理由（対応したい課題） |
|---|---|---|
| `csrf-csrf` | Double Submit Cookie 方式の CSRF トークン検証 | `docs/issues/security.md` の「CSRFトークンの有効期限/ローテーション管理が見えない」課題の改善候補。トークン管理を明示的に整理しやすい。 |
| `rate-limiter-flexible` | 認証/API単位のレート制限（IP・キー単位） | `docs/issues/security.md` の「レート制限キーが `ip:path:method` 固定」課題の改善候補。経路分散・IP分散を考慮した制御へ拡張しやすい。 |
| `pino-http` | 構造化HTTPログ | `docs/issues/security.md` の「クライアントIP判定で `x-forwarded-for` を先頭値で直接採用」課題の運用分析基盤として有効。`pino` と組み合わせて追跡性を強化できる。 |
| `@sentry/node` | 例外監視・アラート・トレース | 障害検知を強化し、`docs/FeatureList.md` の「失敗時リトライ/通知改善」に必要な運用監視を補強。公開後の不具合の早期発見に有効。 |
| `@hono/swagger-ui` + `@hono/zod-openapi` | OpenAPI 生成/公開（API仕様の可視化） | `docs/issues/program.md` にある仕様不一致（入力フォーマットなど）を減らすため、API 入出力仕様を機械可読で統一。フロント・バックの認識差分を抑える。 |

## web

| ライブラリ | 主な用途 | 導入理由（対応したい課題） |
|---|---|---|
| `@tanstack/react-table` | 高機能テーブル（検索・ソート・ページング） | `docs/FeatureList.md` の「フィルター/検索の拡張」「監査ログ閲覧」「統計ダッシュボード一覧表示」に必要なUI基盤を提供。 |
| `recharts` | グラフ描画（時系列・比較可視化） | `docs/FeatureList.md` の「参加・当選統計ダッシュボード」に直結。期間比較や分布表示を実装しやすい。 |
| `next-safe-middleware` | CSP などのセキュリティヘッダー設定支援 | `docs/issues/security.md` の「Web CSP が `unsafe-inline` / `unsafe-eval` を許可」課題の改善候補。Next.js 側でヘッダー方針を一元管理しやすい。 |
| `dompurify` | ユーザー入力のHTMLサニタイズ | 将来的に説明文・テンプレート表示などでリッチテキスト化した場合の XSS リスクを低減。防御層を早期に用意できる。 |

## 導入済みライブラリ

### backend

| ライブラリ | 主な用途 | 補足 |
|---|---|---|
| `ioredis` | Redis クライアント（共有ストア） | セッション共有化、レート制限カウンタ、Giveaway API の冪等性制御に利用。 |
| `pino` | 構造化ログ・監査ログ基盤 | `pino-http` と組み合わせて詳細ログを安全に記録する基盤。 |

### web

| ライブラリ | 主な用途 | 補足 |
|---|---|---|
| `react-hook-form` + `@hookform/resolvers` | フォーム状態管理とバリデーション連携 | 入力値バリデーション可視化や下書き保存実装の基盤。 |
| `zod`（web側にも導入） | スキーマ定義・型安全な入力検証 | backend と検証ルールを揃えやすくし、入力ゆらぎを抑制。 |

## 優先導入順（短期）

1. backend: `csrf-csrf`, `rate-limiter-flexible`
2. backend運用強化: `pino-http`, `@sentry/node`
3. web: `@tanstack/react-table`, `recharts`
4. ハードニング: `next-safe-middleware`, `dompurify`
