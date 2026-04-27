# 現在の問題点一覧

このドキュメントは、2026-04-27 時点でリポジトリ内コードと検証コマンド（`pnpm lint` / `pnpm build` / `pnpm test`）を確認して把握できた問題点を整理したものです。

## 1. テストで再現している不具合

1. **UI文言の期待値と実装が不一致でテストが失敗する**
   - `_test_/giveaway-ui.test.mjs` は日本語文言（`参加 / 退出`, `説明なし`, `終了`）を期待している。
   - `backend/src/giveawayService.ts` の実装は英語文言（`Enter / Leave`, `No description provided.`, `🔴 Ended`）を返している。
   - その結果 `pnpm test` が失敗する（3件 fail）。

## 2. 機能仕様・実装の不整合

2. **`/gsettings` のモーダル実装と submit 処理が噛み合っていない**
   - `backend/src/commands/gsettings.ts` は `RoleSelectMenuBuilder`（customId: `select-roles`）を表示する。
   - `backend/src/interactions/modalSubmit.ts` は `interaction.fields.getTextInputValue('roleIds')` を読み取ろうとしている。
   - 入力コンポーネントIDと取得ロジックが一致しておらず、設定保存フローが壊れる可能性が高い。

3. **`/greroll` の説明と候補取得ロジックが不一致**
   - コマンド説明は「終了したGiveawayを再抽選」。
   - しかし `backend/src/commands/greroll.ts` の autocomplete は `getActiveGiveaways` を使用し、開催中のみ候補に出す。

4. **停止状態 (`stopped`) のGiveawayでも参加ボタンが有効なまま**
   - `backend/src/giveawayService.ts` の `refreshGiveawayMessage` では `status === 'ended'` の時だけボタンを無効化。
   - `stopped` 状態でも押せるため、停止の意味とUI/動作が一致しない。

5. **参加トグル時にGiveaway状態チェックがない**
   - `backend/src/interactions/button.ts` → `toggleGiveawayEntry` 実行時に、対象Giveawayが `active` かどうかの検証がない。
   - 終了後/停止後の参加登録を防ぐ責務がDB側・サービス側に実装されていない。

6. **権限制御の一貫性不足（Discordコマンド側）**
   - API (`backend/src/api.ts`) には管理者トークン/ロール検証がある。
   - しかし `/gend`, `/gstop`, `/gstart`, `/greroll`, `/gc` の実行側にはロール/権限チェックが無く、誰でも操作できる可能性がある。

## 3. セキュリティ・運用上の懸念

7. **`ADMIN_API_TOKEN` 未設定時に管理API保護が無効化される**
   - `backend/src/api.ts` の `requireAdminToken` は、環境変数が未設定だと検証をスキップする。
   - 誤設定時に管理系APIが無認証で実行可能になるリスクがある。

8. **CORS が `*` 固定で管理ヘッダも許可されている**
   - `backend/src/api.ts` で `Access-Control-Allow-Origin: *` と `x-admin-token` を許可。
   - トークン管理が甘い場合、想定外クライアントからの操作面が広がる。

9. **フロント側に管理トークンを持たせる設計になっている**
   - `web/src/App.tsx` は `VITE_ADMIN_TOKEN` を読み込む想定がある。
   - `VITE_` プレフィックスの値はビルド成果物へ露出するため、秘密情報としては不適切。

## 4. 保守性・品質上の問題

10. **型安全性が弱い箇所が残っている (`any` の使用)**
   - `backend/src/commands/index.ts` と `backend/src/utils/logger.ts` で `any` が使われている。
   - 型推論/補完の品質が下がり、将来の不具合混入リスクが上がる。

11. **実装コメントと実コードが矛盾している箇所がある**
   - `backend/src/commands/gsettings.ts` で「未選択を許容するため 0」とコメントしつつ `setMinValues(1)` を設定している。
   - 誤読を招き、保守時の判断ミスにつながる。

12. **ローカル実行ログファイルがリポジトリに含まれている**
   - ルートに `logfile`（PostgreSQLログ）が存在する。
   - 実行環境依存のノイズであり、差分汚染や情報露出の要因になる。

13. **ロックファイル運用が混在している**
    - `pnpm-lock.yaml` と `package-lock.json` が共存している。
    - パッケージマネージャ運用が二重化し、依存再現性やCI運用の混乱要因になる。

## 5. 追加で確認した重要課題（今後の修正向け）

14. **Web API の権限制御がクライアント自己申告値を信用している**
    - `POST /api/giveaways` は `userId` と `roleIds` をリクエストボディから受け取り、そのまま権限判定に使っている。
    - サーバー側で Discord 実ユーザー情報を照合していないため、`roleIds` の偽装や `userId` なりすましで作成制御を回避できる。

15. **ギルド境界チェック不足により他ギルドの Giveaway を操作できる**
    - `/gend`, `/gstart`, `/gstop`, `/greroll` は ID 文字列だけで操作し、対象 Giveaway の `guildId` と実行ギルドの一致確認をしていない。
    - API 側の `POST /api/giveaways/:id/end` と `POST /api/giveaways/:id/reroll` も同様に ID 単独指定で、ギルドスコープ検証がない。

16. **更新系DB処理が「対象なし」を検知しない**
    - `updateGiveawayStatus`, `updateGiveawayAutoRepeat`, `setGiveawayMessageId`, `markGiveawayEnded` は `UPDATE` の結果件数を見ていない。
    - 不正IDでも成功扱いで上位層へ返るため、UI/コマンド上で成功メッセージと実データ状態が乖離しやすい。

17. **`endGiveaway` が失敗を握りつぶすため呼び出し元が誤成功表示しやすい**
    - `endGiveaway` は内部で広く `try/catch` し、例外を投げずにログのみで `return` する分岐が多い。
    - `/gend` や API の終了処理は戻り値だけ見て成功応答するため、実際には終了できていなくても成功に見えるケースがある。

18. **`/greroll` が「終了済みのみ」を強制していない**
    - 説明文は終了 Giveaway 向けだが、`rerollGiveaway` では `status === 'ended'` のチェックが無い。
    - 実装上は開催中 Giveaway でも再抽選メッセージを出せてしまう。

19. **エラー分類が粗く、運用時の原因切り分けが難しい**
    - API は認証失敗・権限不足・入力不正・内部失敗をほぼ一律 `400` で返している。
    - クライアント/監視側で「ユーザー起因かサーバー起因か」を判別しづらい。

20. **テスト範囲が狭く、重要フローの回帰を防ぎにくい**
    - 現在のテストは `_test_/deadline.test.mjs` と `_test_/giveaway-ui.test.mjs` の2ファイルのみ。
    - API 認可、コマンド権限制御、DB更新、インタラクション統合など主要フローに自動テストが無い。

## 補足

- 上記は「現時点でコードと検証実行から確認できる問題点」の一覧です。
- 仕様として意図された挙動が含まれている可能性はあるため、優先度付け時は運用要件との照合が必要です。
