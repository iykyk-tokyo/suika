# Playables 検証記録（2026-10-07）

検証対象: `npm run build` の `dist/`（three 511.1 KiB / matter 82.4 KiB / index 27.9 KiB / index.html 2.6 KiB）

## 自動テスト

- `npx vitest run`: 13 ファイル 132 テスト PASS
- `node --test scripts/check-bundle.test.mjs`: 5 PASS
- `npm run check:bundle`: エラー 0、警告 0

## ブラウザ手動確認（Chromium / Playwright、開発サーバー）

| 項目 | 結果 | 証跡 |
|---|---|---|
| 起動直後の箱・危険ライン・HUD・狙いゴースト | OK | 01-portrait-start.png |
| クリック落下、0.6 秒以内の 2 回目は無視 | OK | — |
| 同種合体でスコア加算・泡エフェクト | OK（26 → 51 → 782 点） | — |
| キーボード（← → Space ↓ Enter）、Esc は無反応 | OK | — |
| 横長で HUD が左帯に移動、箱は画面内 | OK | 02-landscape-hud.png |
| リロードで盤面とベストを復元（LocalAdapter） | OK | — |
| ゲームオーバー画面と「もう一度」 | OK（snapshot は null で保存、best 維持） | 03-gameover.png |
| 外部リクエスト | `https://www.youtube.com/game_api/v1` とそのリダイレクト先のみ | — |

## SDK ライフサイクル（ローカルハーネス）

公式 Test Suite は Chrome 153 の「ローカルネットワークアクセス」権限（状態 `prompt`）により `http://localhost` の iframe 読み込みがブロックされ、サーバーにリクエストが届かなかった（05-official-test-suite-blocked.png）。代替として、SDK が親へ送る postMessage / MessagePort を記録するハーネス（`#debug&origin=` 付きで埋め込み、3 秒間は iframe 高さ 0）で確認した（04-sdk-harness.png）。

観測されたメッセージ順:

1. 121 ms: `playableIframe` ハンドシェイク（MessagePort 1 個）
2. 123 ms: リソースタイミング 3 件（index / matter / three）
3. 126〜128 ms: コールバック登録 4 件（onPause / onResume / onAudioEnabledChange 等）、`loadData` と `getLanguage` の要求
4. 1151 ms: ハーネスが応答しないため 1 秒タイムアウト → `logWarning` 相当
5. 1154 ms: `firstFrameReady` 相当 → 直後に `gameReady` 相当（この順）

iframe 高さ 0 の間もゲームは停止せず、3 秒後に高さが付くと正しいレイアウトで描画された。言語は `getLanguage` 未応答のため英語にフォールバックした。

## 未実施（ユーザー環境が必要）

- 公式 Test Suite での MUST/SHOULD 判定表示。実 Chrome でローカルネットワーク権限を許可するか、HTTPS トンネル経由で配信すれば実行できる。
- Pause/Resume・Audio トグルの Test Suite ボタン操作。
- Chrome Local Overrides での本番 CSP 再現。
- 実機（iPhone / Android）でのタッチ操作と回転。
- 5 分間プレイでのヒープ推移。
