# Security課題整理（現状）

最終更新: 2026-05-18

このファイルは、現時点の実装から確認できるセキュリティ上の懸念点を整理したものです。

## High

1. **内部エラーメッセージのクライアント露出**
   - 現状: `AppError` のメッセージをそのまま API レスポンスに返している。
   - 影響: 実装都合の詳細（内部状態/制約）が外部に露出し、探索の足がかりになる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/utils/response.ts`

2. **Web CSP が `unsafe-inline` / `unsafe-eval` を許可**
   - 現状: `Content-Security-Policy` に危険度の高い許可が含まれている。
   - 影響: XSS 発生時の被害拡大リスクが高い。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/web/next.config.ts`

3. **クライアントIP判定で `x-forwarded-for` を先頭値で直接採用**
   - 現状: 信頼プロキシ前提の検証なくヘッダ値を利用している。
   - 影響: レート制限回避や追跡精度低下のリスクがある。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

## Medium

4. **CSRFトークンCookieに `HttpOnly` がない**
   - 現状: CSRFトークンは JS から参照可能な Cookie として配布している。
   - 影響: XSS 成立時にトークン窃取されやすくなる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

5. **CORS Origin 検証が `CORS_ORIGIN` 設定依存**
   - 現状: `CORS_ORIGIN` が未設定の場合、state-changing API の Origin 比較が実質無効。
   - 影響: 環境設定ミス時に防御が弱くなる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

6. **リクエストボディサイズ制御が `Content-Length` 依存**
   - 現状: `Transfer-Encoding` 利用時は実体サイズ制御が弱い。
   - 影響: 大きなペイロード投入時の防御が不十分になりうる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

7. **レート制限キーが `ip:path:method` 固定**
   - 現状: 利用者単位制御や重要API単位制御が限定的。
   - 影響: 経路分散・IP分散時の耐性が十分でない可能性がある。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

## Low

8. **CSRFトークンの有効期限/ローテーション管理が見えない**
   - 現状: トークンは Cookie に設定されるが、有効期限や定期更新戦略が明示されていない。
   - 影響: 長期トークン運用時のリスク評価が難しい。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

9. **セキュリティ課題ドキュメントの運用ルール未整備**
   - 現状: `docs/issues/security.md` は作成済みだが、更新トリガー（リリース時・設計変更時など）が明文化されていない。
   - 影響: 時間経過で記述が実装と乖離し、優先度判断がぶれる可能性がある。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/docs/LibToInstall.md`

## 補足（実装済みで評価できる点）

- API 全体にセキュリティミドルウェアを適用している。
- セキュリティヘッダ（XFO, XCTO, Referrer-Policy, CSP 等）は一定レベルで導入済み。
- CSRF チェック・レート制限・サイズ上限チェックが実装済み。

根拠:
- `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/index.ts`
- `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`
