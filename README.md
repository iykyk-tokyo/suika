# Ocean Merge

海の生き物を落として同じ種類を合体させ、進化させていくパズル。YouTube Playables 向け。

## 開発

```bash
npm install
npm run dev          # http://localhost:8080（使用中なら次のポート）
npm test             # Vitest
npm run typecheck
node --test scripts/check-bundle.test.mjs   # ビルド検査スクリプトのテスト
```

## ビルドと提出

```bash
npm run build        # dist/
npm run check:bundle # ファイル名・サイズ・SDK 読込順の検査
npm run zip          # ocean-merge.zip
```

`ocean-merge.zip` を Developer Portal の「Add a new game」にアップロードする。

## Playables 検証手順

1. `npm run dev` を起動し、SDK Test Suite（https://developers.google.com/youtube/gaming/playables/test_suite）の Game URL に開発サーバーの URL を入力する。
2. イベントログで `firstFrameReady` → `gameReady` の順に 1 回ずつ出ることを確認する。
3. Pause / Resume ボタンで物体が止まり、再開後に一気に落ちないことを確認する。Pause 時に `saveData` が記録される。
4. 「ローディング画面モック（初期高さ 0）」を有効にして、描画が止まらないことを確認する。
5. Audio トグルで音が消え、ゲーム内に音量ボタンがないことを確認する。
6. ゲームオーバー後に `sendScore` の値が HUD のベストと一致することを確認する。
7. Chrome DevTools の Local Overrides で `index.html` に本番 CSP を付けてリロードし、コンソールに CSP 違反がないことを確認する。CSP 文字列は Test Suite ガイドに掲載されている。
8. デバイスモードで 9:32、9:16、1:1、16:9、32:9 を確認する。

## 既知の制限

- `three` チャンクは約 511 KiB で「個別ファイル SHOULD < 512 KiB」ぎりぎり。three.js の import を増やすと超える可能性がある（MUST の 30 MiB には抵触しない）。
- 画像・音声ファイルは同梱しない（全てコード生成）。
- 進捗の自動保存は合体から 2 秒間隔。Playables 環境では離脱時の `onPause` で即保存されるが、ローカル開発でブラウザをリロードすると直近 2 秒以内の進捗は失われる。

## IP について

メカニクス（落下・同種合体・進化・上限ラインでのゲームオーバー）は一般的なルールであり、名称・造形・色・音・画面構図は本作独自のもの。提出前に表示タイトルの商標検索（J-PlatPat、USPTO 9 類・41 類）を行うこと。
