# 修正結果（2026-04-27）

`docs/issues.md` に列挙されていた課題は、以下のとおり対応済みです。

## 対応済み項目

1. UI文言の日本語化（`参加 / 退出`、`説明なし`、`終了`）とテスト整合
2. `/gsettings` のモーダル入力IDと submit 側処理の不一致を解消
3. `/greroll` autocomplete を終了済みGiveaway対象へ変更
4. `stopped` / `ended` 時の参加ボタン無効化
5. 参加トグル時の `active` 状態検証を追加
6. Discordコマンド側（`/gc` `/gend` `/gstop` `/gstart` `/greroll` `/gsettings`）にロール権限チェックを追加
7. `ADMIN_API_TOKEN` 未設定時の保護無効化を解消（未設定はエラー化）
8. CORS を `*` 固定から環境変数 `CORS_ORIGIN` ベースへ変更
9. フロントの `VITE_ADMIN_TOKEN` 依存を廃止
10. `any` 使用を削除し型安全性を改善
11. `gsettings` の矛盾コメント/実装を整理
12. ルートの `logfile` を削除し `.gitignore` に追加
13. `package-lock.json` を削除し lockfile 運用を `pnpm-lock.yaml` に統一
14. Web API 作成権限でクライアント自己申告ロールを信頼しない実装へ変更（Discordメンバー情報で判定）
15. Discordコマンド/API のギルド境界チェックを追加
16. 更新系DB処理で対象なし更新をエラー化
17. `endGiveaway` の失敗握りつぶしを解消し、呼び出し元へ失敗を伝播
18. `/greroll` に終了済みステータス必須チェックを追加
19. API エラー分類を改善（401/403/404/409/500 と 400 バリデーション）
20. テストを追加（エラーマッピング、権限判定ヘルパー、停止状態UI）

## 検証

- `pnpm lint`
- `pnpm build`
- `pnpm test`
