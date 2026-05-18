# Security課題整理（現状）

最終更新: 2026-05-18

このファイルは、現時点の実装から確認できるセキュリティ上の懸念点を整理したものです。

## High

1. **Web CSP が `unsafe-inline` / `unsafe-eval` を許可**
   - 現状: `Content-Security-Policy` に危険度の高い許可が含まれている。
   - 影響: XSS 発生時の被害拡大リスクが高い。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/web/next.config.ts`

## Medium

2. **CSRFトークンCookieに `HttpOnly` がない**
   - 現状: CSRFトークンは JS から参照可能な Cookie として配布している。
   - 影響: XSS 成立時にトークン窃取されやすくなる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

3. **リクエストボディサイズ制御が `Content-Length` 依存**
   - 現状: `Transfer-Encoding` 利用時は実体サイズ制御が弱い。
   - 影響: 大きなペイロード投入時の防御が不十分になりうる。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

4. **レート制限キーが `ip:path:method` 固定**
   - 現状: 利用者単位制御や重要API単位制御が限定的。
   - 影響: 経路分散・IP分散時の耐性が十分でない可能性がある。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

5. **IP未取得時にレート制限キーが `unknown:*` に集約される**
   - 現状: `TRUST_PROXY` 無効時に `x-real-ip` も無いとIPが `unknown` になる。
   - 影響: 複数利用者が同一キーで制限され、誤検知や可用性低下につながる可能性がある。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

## Low

6. **CSRFトークンの有効期限/ローテーション管理が見えない**
   - 現状: トークンは Cookie に設定されるが、有効期限や定期更新戦略が明示されていない。
   - 影響: 長期トークン運用時のリスク評価が難しい。
   - 根拠: `/home/runner/work/applejp-bot/applejp-bot/backend/src/api/middleware/security.ts`

7. **セキュリティ課題ドキュメントの運用ルール未整備**
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
