# Program課題整理（現状）

最終更新: 2026-05-18

このファイルは、現時点のコード/ドキュメントから確認できる設計・実装運用上の課題をまとめたものです。

## High

1. **ドキュメント参照不整合（ファイル名/参照先）**
   - 現状: `LibToInstall.md` が `docs/feature-list.md` や `security.md` / `program.md` を参照している。
   - 課題: 実ファイル構成との不整合により、参照切れや把握漏れが起きる。
   - 根拠:
     - `/home/runner/work/applejp-bot/applejp-bot/docs/LibToInstall.md`
     - `/home/runner/work/applejp-bot/applejp-bot/docs/FeatureList.md`

2. **認証セッションの期限切れ清掃処理が未実装**
   - 現状: `cleanupExpiredSessions()` が実質 no-op。
   - 課題: 運用時のセッション管理負債（不要データ残存、保守性低下）につながる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/features/auth/sessionStore.ts`

3. **API仕様の機械可読化不足（OpenAPI未導入）**
   - 現状: OpenAPI/Swagger関連実装が確認できない。
   - 課題: フロント/バック間の仕様差分検知が人手依存になりやすい。
   - 根拠:
     - `/home/runner/work/applejp-bot/applejp-bot/backend`
     - `/home/runner/work/applejp-bot/applejp-bot/web`

## Medium

4. **型定義の厳密性不足（言語コード）**
   - 現状: web側 `GuildSettings.language` は `string`、backend側は `z.enum(['en','ja'])`。
   - 課題: フロント側の型からは許容値制約が見えず、型安全性が弱い。
   - 根拠:
     - `/home/runner/work/applejp-bot/applejp-bot/web/src/features/settings/types.ts`
     - `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/schemas/settings.ts`

5. **互換対応フィールドが残存（命名移行の途中状態）**
   - 現状: `dashboardUsableRoleIds` と `dashboardViewRoleIds` の互換吸収ロジックが存在。
   - 課題: データ契約の一本化が遅れると、将来の保守負荷が上がる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/routes/settings.ts`

6. **Web側 settings でスキーマ検証層が見当たらない**
   - 現状: `web/src/features/settings` は `api/client.ts` と `types.ts` のみ。
   - 課題: UI入力時の事前検証やAPI契約の同期が弱くなりやすい。
   - 根拠:
     - `/home/runner/work/applejp-bot/applejp-bot/web/src/features/settings/api/client.ts`
     - `/home/runner/work/applejp-bot/applejp-bot/web/src/features/settings/types.ts`

## Low

7. **Webディレクトリ設計資料が提案ベースで現行実装との差分管理が弱い**
   - 現状: `WebDir.md` は提案構成メモ中心。
   - 課題: 参照資料としての鮮度維持ルールがないと、実装との乖離が進みやすい。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/docs/WebDir.md`

8. **機能バックログの高優先課題が未着手項目中心**
   - 現状: 高優先機能に `未着手` が複数ある。
   - 課題: 仕様化・分割・着手順が曖昧だと進行管理のボトルネックになる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/docs/FeatureList.md`

## 補足（進捗上の良い点）

- root scripts に lint/build/test が定義され、基本的な検証導線は整っている。
- 監査ログ機能や冪等性キー関連は実装が進んでいる。

根拠:
- `/home/runner/work/applejp-bot/applejp-bot/package.json`
- `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/routes/giveaways.ts`
