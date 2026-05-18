# Program課題整理（現状）

最終更新: 2026-05-18

このファイルは、現時点のコード/ドキュメントから確認できる設計・実装運用上の課題をまとめたものです。

## High

1. **ドキュメント運用ルール未整備（参照更新の属人化）**
   - 現状: docs間の参照は更新されたが、命名・配置変更時にどの文書を追従修正するかのルールが明文化されていない。
   - 課題: 将来の改名/移動時に再び参照切れが発生しやすい。
   - 根拠:
      - `/home/runner/work/applejp-bot/applejp-bot/docs/LibToInstall.md`
      - `/home/runner/work/applejp-bot/applejp-bot/docs/FeatureList.md`

2. **API仕様の機械可読化不足（OpenAPI未導入）**
   - 現状: OpenAPI/Swagger関連実装が確認できない。
   - 課題: フロント/バック間の仕様差分検知が人手依存になりやすい。
   - 根拠:
      - `/home/runner/work/applejp-bot/applejp-bot/backend`
      - `/home/runner/work/applejp-bot/applejp-bot/web`

## Medium

3. **互換対応フィールドが残存（命名移行の途中状態）**
   - 現状: `dashboardUsableRoleIds` と `dashboardViewRoleIds` の互換吸収ロジックが存在。
   - 課題: データ契約の一本化が遅れると、将来の保守負荷が上がる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/routes/settings.ts`

4. **テスト実行導線がビルド成果物依存で壊れやすい**
   - 現状: rootの `_test_` は `backend/dist/*` を直接 import しており、事前ビルドなし実行で失敗する。
   - 課題: 実行順序に依存して失敗しやすく、検証導線の誤用リスクがある。
   - 根拠:
      - `/home/runner/work/applejp-bot/applejp-bot/_test_/shared-errors.test.mjs`
      - `/home/runner/work/applejp-bot/applejp-bot/_test_/giveaway-embed.test.mjs`
      - `/home/runner/work/applejp-bot/applejp-bot/package.json`

## Low

5. **Webディレクトリ設計資料が提案ベースで現行実装との差分管理が弱い**
   - 現状: `WebDir.md` は提案構成メモ中心。
   - 課題: 参照資料としての鮮度維持ルールがないと、実装との乖離が進みやすい。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/docs/WebDir.md`

6. **機能バックログの高優先課題が未着手項目中心**
   - 現状: 高優先機能に `未着手` が複数ある。
   - 課題: 仕様化・分割・着手順が曖昧だと進行管理のボトルネックになる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/docs/FeatureList.md`

## 補足（進捗上の良い点）

- root scripts に lint/build/test が定義され、基本的な検証導線は整っている。
- 監査ログ機能や冪等性キー関連は実装が進んでいる。

根拠:
- `/home/runner/work/applejp-bot/applejp-bot/package.json`
- `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/routes/giveaways.ts`
