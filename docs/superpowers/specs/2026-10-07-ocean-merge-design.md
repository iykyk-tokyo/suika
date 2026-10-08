# Ocean Merge（仮題）設計書 — YouTube Playables 向け落ちもの合体パズル

作成日: 2026-10-07
状態: ユーザーレビュー待ち

## 1. 概要と目的

スイカゲーム型の「落として・同種を合体させて・進化させる」パズルを、YouTube Playables に提出できる完成品として作る。モチーフは海の生き物、描画は three.js、物理は Matter.js、アセットは全てコード生成。

### 1.1 成功条件

- YouTube Playables 認定要件（8 分野）の MUST を全て満たし、SDK Test Suite で `firstFrameReady → gameReady → pause/resume → save/load → sendScore` の呼び出しが確認できる。
- 全アスペクト比（9:32〜32:9）でプレイ可能、タッチとマウスで全操作が完結する。
- `vite build` の成果物を ZIP にしてそのまま提出できる。
- `core` と `physics` の全ロジックが Vitest で検証されている。

### 1.2 スコープ外（やらないこと）

- オンライン対戦、ローカル 2P、タイムアタック等の追加モード。
- 広告（`ytgame.ads`）、ハプティクス、設定画面。
- タイトル画面（起動直後にプレイ開始）。
- 画像・音声ファイルの同梱。

### 1.3 表示タイトルと IP 方針

- 表示タイトルは仮に **「Ocean Merge」（日本語表示: オーシャンマージ）** とする。提出前に J-PlatPat と USPTO（9 類・41 類）で商標検索を行い、衝突があれば改名する。
- 「スイカ」「Suika」「ぷよ」等の他社商標、果物モチーフ、顔付き果物の造形、既存ゲームの画面構図は使わない。説明文・タグにも「スイカゲーム風」と書かない。
- 13 歳以上の一般向けとして提示し、幼児向けを示唆する表現を避ける。

## 2. プラットフォーム制約（設計に直結するもの）

調査資料（iykyk-tokyo/puyo の `reports/YouTube Playables 公開要件.md`）から、本設計が従う制約を抜粋する。

| 区分 | 制約 | 本設計での対応 |
|---|---|---|
| ライフサイクル | `firstFrameReady` を必ず呼び、`gameReady` より前。ローディング中に `gameReady` を呼ばない | 初回描画直後に `firstFrameReady`、アセットがコード生成なので直後に `gameReady` |
| 一時停止 | `onPause` で全実行停止、`onResume` でのみ再開。Page Visibility API 禁止 | rAF 停止・AudioContext 停止・タイマー停止。Page Visibility API は使わない |
| セーブ | `saveData` のみ。`loadData` 完了前の `saveData` 禁止。旧版互換 MUST。終了時フラッシュは 64 KiB まで | 1 つの JSON、`v` でマイグレーション、`onPause` で即保存、サイズ上限を実測で保証 |
| スコア | `sendScore` の最高値はセーブ内の最高値と一致 | ベスト更新時のみ送信し、送信値＝保存値 |
| 通信 | 外部通信ゼロ。CSP `connect-src 'self'` | fetch なし、フォントは同梱せずシステムフォント、Google Fonts も使わない |
| 表示 | 全アスペクト比、向きロック禁止、リサイズで状態維持、ぼやけ禁止 | 正投影カメラのフィット計算、`devicePixelRatio` 追従、`innerHeight === 0` 対策 |
| 入力 | タッチ MUST、マウス MUST、キーボード SHOULD、Esc の `preventDefault` 禁止 | 3 系統全て実装、Esc には何も割り当てない |
| 音声 | `isAudioEnabled` / `onAudioEnabledChange` に従う。ゲーム内全体ミュートボタン禁止 | マスターゲインを直結、ミュート UI なし |
| UI | ゲーム内終了ボタン禁止、閉じる・ミュート・メニューに似たアイコンを近接配置しない | 画面上部にアイコンを置かない |
| 言語 | 英語 MUST、`navigator.language` 禁止 | `getLanguage()` で `ja` 判定、それ以外は英語 |
| コード | WASM・Worker・eval・難読化を避ける。SPA | 純 JS ライブラリのみ。esbuild の minify のみ |
| サイズ | 個別ファイル MUST < 30 MiB、SHOULD < 512 KiB。初期バンドル SHOULD < 15 MiB | three.js を独立チャンクにし、ビルド後にサイズ検査 |

## 3. アーキテクチャ

### 3.1 レイヤーと依存方向

```
app  →  ui, audio, render, physics, playables, core
render  →  core, three
physics →  core, matter-js
ui, audio, playables →  core
core  →  （依存なし）
```

`core` は DOM・three・matter を import しない純粋 TypeScript。他層は `core` の型を介して会話する。

### 3.2 ディレクトリ構成

```
index.html                 SDK スクリプト → main.ts の順で読込
src/
  main.ts                  起動シーケンスのみ
  app/
    Game.ts                状態機械とゲームループ、各層の接続
    InputController.ts     pointer / keyboard を AimCommand に変換
    LayoutPlanner.ts       (w, h) → 盤面ビューポートと HUD 配置（純粋関数）
  core/
    tiers.ts               11 ティアの定義表（as const）
    rules.ts               合体解決、スコア、ゲームオーバー判定
    rng.ts                 シード付き PRNG と次ピース抽選
    save.ts                セーブデータ型、シリアライズ、マイグレーション
    types.ts               共有型（TierId, BodySnapshot, Vec2 など）
  physics/
    PhysicsWorld.ts        インターフェース
    MatterWorld.ts         Matter.js 実装
  render/
    SceneRenderer.ts       three.js のシーン、カメラ、リサイズ
    CreatureMeshFactory.ts ティアごとの手続き的メッシュ生成
    Effects.ts             合体時の泡パーティクル、背景の泡
  audio/
    SfxSynth.ts            Web Audio 合成とマスターゲイン
  playables/
    PlayablesPort.ts       インターフェース
    YtgameAdapter.ts       本番実装
    LocalAdapter.ts        localStorage 実装（開発時のみ）
    createPort.ts          typeof ytgame ガード（唯一の場所）
  ui/
    Hud.ts                 DOM オーバーレイ
    i18n.ts                日英文言
  types/
    ytgame.d.ts            公式 index.d.ts（Apache 2.0）
scripts/
  check-bundle.mjs         dist のサイズ・ファイル名検査
  make-zip.mjs             dist を ZIP 化
docs/superpowers/specs/    本書
```

## 4. ゲームルール

### 4.1 座標系と箱

- 物理のワールド単位は「ユニット」。箱の内寸は幅 10、高さ 13。原点は箱の床中央、y は上向き。
- Matter.js 内部は y 下向き・ピクセル想定なので、`MatterWorld` が 1 ユニット = 50 の倍率と y 反転を吸収する。描画層とコアはユニット座標しか扱わない。
- 危険ライン: y = 11。出現位置: y = 12.2（箱の上端は 13）。

### 4.2 ティア定義（海の生き物 11 段階）

| tier | 名前（ja / en） | 半径（ユニット） | 合体で得る点 |
|---|---|---|---|
| 0 | プランクトン / Plankton | 0.40 | 1 |
| 1 | クリオネ / Sea Angel | 0.52 | 3 |
| 2 | クラゲ / Jellyfish | 0.66 | 6 |
| 3 | フグ / Pufferfish | 0.82 | 10 |
| 4 | カニ / Crab | 1.00 | 15 |
| 5 | タコ / Octopus | 1.20 | 21 |
| 6 | ペンギン / Penguin | 1.42 | 28 |
| 7 | アザラシ / Seal | 1.66 | 36 |
| 8 | イルカ / Dolphin | 1.92 | 45 |
| 9 | サメ / Shark | 2.18 | 55 |
| 10 | クジラ / Whale | 2.45 | 66（2 体が消滅） |

- 「合体で得る点」は tier n の 2 体が触れたときに加算される点。tier 0〜9 は次ティア 1 体が生まれ、tier 10 同士は両方消えて 66 点。
- 色・形状の定義（ベースカラー、アクセントカラー、付属パーツの種類）も同じ表に持ち、描画層はこの表だけを参照する。
- 半径は調整値であり、最大 2 体が横に並んで箱に収まること（2.45 × 4 = 9.8 < 10）を不変条件とする。

### 4.3 進行

1. 落とせるのは tier 0〜4。次ピースは一様乱数（シード付き PRNG）。
2. プレイヤーは箱の上端で x 位置を狙い、落下操作で物体を出現位置から自由落下させる。x は箱の内壁から半径分内側にクランプする。
3. 落下した物体が最初に何かに衝突するか 0.6 秒経過したら、次ピースが操作可能になる。
4. 同 tier の 2 体が接触したら合体。1 物理ステップ内で同じ物体が 2 回合体しないよう、消費済みの物体は除外する。新しい物体は 2 体の中点に、速度は 2 体の平均で生成する。
5. 静止判定（速度 < 0.2 ユニット/秒）の物体の上端（y + 半径）が危険ラインを超えた状態が **1.0 秒連続** したらゲームオーバー。落下中・合体直後の物体は対象外。
6. ゲームオーバー画面でスコアとベストを表示し、「もう一度」でリセット。

### 4.4 コアの公開関数（純粋関数）

```ts
// core/rules.ts
resolveMerges(contacts: readonly ContactPair[], bodies: ReadonlyMap<BodyId, BodyState>): MergeResult
// → { removed: BodyId[]; spawned: SpawnRequest[]; scoreDelta: number }

evaluateGameOver(bodies: readonly BodyState[], dangerY: number, dtSec: number, timer: number): GameOverEval
// → { over: boolean; timer: number }

// core/rng.ts
createRng(seed: number): Rng            // mulberry32
nextDropTier(rng: Rng): TierId          // 0〜4

// core/save.ts
serializeSave(s: SaveData): string
parseSave(raw: string): SaveData | null // 旧版は migrate、壊れていれば null
```

## 5. Playables ライフサイクルとデータフロー

### 5.1 起動シーケンス（`main.ts`）

1. `createPort()` で `PlayablesPort` を得る（`typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV` なら `YtgameAdapter`、それ以外は `LocalAdapter`）。
2. `port.onPause` / `port.onResume` / `port.onAudioEnabledChange` を登録。
3. `port.loadData()` を 1 秒タイムアウト付きで待つ。結果を `parseSave` に通し、`null` なら初期状態で開始し `port.logError()`。
4. `SceneRenderer` と `MatterWorld` を初期化。セーブにスナップショットがあれば盤面を復元。
5. 1 フレーム描画 → `port.firstFrameReady()` → 直後に `port.gameReady()` → ゲームループ開始。

### 5.2 ゲームループ

- `requestAnimationFrame` 駆動。経過時間をアキュムレータに積み、1/60 秒の固定ステップで物理を進める。1 フレームあたり最大 5 ステップ（超過分は捨てる）。
- 各ステップ: 物理 step → 衝突ペア収集 → `resolveMerges` → 物体の追加・削除を物理と描画に反映 → `evaluateGameOver`。
- フレーム末尾で描画と HUD 更新。

### 5.3 一時停止と再開

- `onPause`: rAF をキャンセル、AudioContext を `suspend`、入力を無効化、スナップショットを含むセーブを即実行。
- `onResume`: 前回時刻をリセットしてアキュムレータを 0 にし、rAF 再開。音声は `isAudioEnabled()` の現在値で復帰。

### 5.4 セーブデータ

```ts
type SaveDataV1 = {
  v: 1;
  bestScore: number;
  snapshot: {
    score: number;
    currentTier: TierId;   // 手持ち。欠けている旧セーブは nextTier を手持ちとして読む
    nextTier: TierId;      // 「つぎ」に表示する 1 つ先
    bodies: readonly { t: TierId; x: number; y: number; a: number }[];
  } | null;
};
```

- 保存タイミング: 合体のたび（直近の保存から 2 秒以上経過している場合のみ）、ゲームオーバー時、`onPause` 時。
- ゲームオーバー後は `snapshot` を `null` にして保存する。
- サイズ: 物体 1 件 ≈ 40 文字、現実的な上限 150 体でも約 6 KiB。64 KiB 以内をテストで保証する（200 体で 10 KiB 未満）。
- `v` 不一致は `migrate` で変換。未知の `v` や JSON エラーは `null`。
- `String.isWellFormed()` が false の文字列は保存しない（JSON.stringify 出力なので通常は発生しない）。

### 5.5 スコア送信

- ゲームオーバー時にベストが更新されていれば `saveData` を先に完了させ、その後 `sendScore({ value: bestScore })`。
- 送信失敗は無視し、次回ゲームオーバー時に再送する。送信値は常にセーブ内の `bestScore` と同じ。

## 6. 描画（three.js）

- アートディレクションは「陽だまりの水槽に並ぶソフビ」。色は `render/palette.ts`（Lagoon `#8FEAF0` / Deep `#2E9CCB` / Sand `#FFE3B3` / Coral `#FF7F9C` / Ink `#1E3A5F` / Foam `#F7FFFE`）を描画層と HUD で共有する。
- `WebGLRenderer`（`antialias: true`、`pixelRatio` は `min(devicePixelRatio, 2)`、`NeutralToneMapping`）、`OrthographicCamera` を z 正方向から箱の正面に向ける（入力の座標変換を単純に保つため透視にはしない）。奥行きは背景の層・質感・動きで出す。
- 環境マップは `RoomEnvironment` を `PMREMGenerator` で焼いてコード生成する。光源は `HemisphereLight`、暖色のキーライト、背後上方からの水色のリムライト。
- 背景（`Backdrop`）: 水深グラデーション＋揺れるコースティクスのシェーダー平面、加算合成の光の筋、砂丘 2 層、揺れる海藻、サンゴとヒトデ、上昇する泡（`InstancedMesh`、フレネルの泡シェーダー）。
- 水槽（`Tank`）: 角丸のガラス壁（半透明の `MeshPhysicalMaterial`＋白いツヤ筋）、砂色の床、奥のガラス。危険ラインはコーラル色のドット列、照準ガイドは下へ流れる白いドット列。
- 物体は tier ごとに `CreatureMeshFactory` が 1 回だけジオメトリを組み立ててキャッシュし、物体ごとに `Mesh` を生成。胴体は当たり判定と同じ半径の球。マテリアルはクリアコート付きの `MeshPhysicalMaterial`（クリオネ・クラゲは半透明）。顔は黒目＋ハイライト 2 つ、ほっぺ 2 つ、種ごとの口（にっこり／ω／おちょぼ口）。付属パーツ（触手は `TubeGeometry` の曲線、ヒレ、トゲ、エラ、潮吹きなど）で、種ごとにパーツ構成が異なり色以外でも見分けられる。見た目の大きさは物理半径の 1.6 倍以内。
- 物理の位置と角度を毎フレーム写す。生き物ごとの見た目だけの動きは `CreatureAnimator`（純粋ロジック）が持つ: 合体で生まれた個体のポップイン、上向き速度変化による着地の潰れ（バネ減衰）、呼吸、まばたき。加えて羽・触手・ヒレの揺れ、照準の方への視線、落下前の個体は下を見る。
- 物体の影は奥のガラスに柔らかい円として落とす（シャドウマップは使わない）。
- 合体時は広がる光の輪、はじける泡、きらめく星を出す。ペンギン以上の合体では短く画面を揺らす。
- 狙い中の物体は出現位置に半透明で表示し、上下にふわふわ揺らす。
- HUD の「つぎ」は泡の中に、手持ち（照準に出ている生き物）の 1 つ先の生き物を 3D で表示する。落とすと「つぎ」が手持ちに繰り上がり、新しい「つぎ」を抽選する（`NextPreview` が HUD 要素の矩形にシザーで重ねて描画）。
- `prefers-reduced-motion: reduce` のときは揺れ・ポップ・画面揺れ・背景アニメを止める。
- WebGL が初期化できない場合は Canvas をやめて DOM に日英メッセージを出し `logError`。

## 7. レイアウトと入力

### 7.1 レイアウト

- `LayoutPlanner.plan(w, h)` が純粋関数として `{ boardRect, hudMode }` を返す。
  - 縦長（h / w ≥ 1.2）: 上部 14% を HUD 帯、残りに箱をフィット。`hudMode = 'top'`。
  - 横長（w / h ≥ 1.2）: 左右 22% ずつを HUD、中央に箱。`hudMode = 'sides'`。
  - それ以外: 上部 10% を HUD。`hudMode = 'top'`。
- 箱のフィットはアスペクト保持で `boardRect` に内接させ、残りは背景で埋める（黒帯にしない）。
- `resize` イベントで `innerWidth > 0 && innerHeight > 0` のときだけ適用。0 のときはループを止めず前回の値を維持する。

### 7.2 入力

| 操作 | タッチ | マウス | キーボード |
|---|---|---|---|
| 狙う | ドラッグ中の x | 移動中の x | ← → で 0.25 ユニット刻み（押し続けで連続） |
| 落とす | 指を離す | クリック（押して離す） | Space または ↓ |
| もう一度 | ボタンをタップ | ボタンをクリック | Enter |

- `pointerdown` は盤面領域のみ受け付け、HUD 上のボタンはネイティブの `click`。
- Esc には何も割り当てず `preventDefault` しない。
- 落下は「次ピースが操作可能」なときだけ受け付ける。
- タッチターゲットは 48×48 CSS px 以上。

## 8. 音声

- `SfxSynth` が `AudioContext` を 1 つ持ち、`master GainNode` → `destination`。
- `isAudioEnabled()` の初期値で `master.gain` を 1 または 0 に設定し、`onAudioEnabledChange` で即時反映。
- ブラウザの自動再生制限で `suspended` の場合、最初の `pointerdown` / `keydown` で `resume()` する。
- 効果音は全て合成: 着水（短いノイズ＋ローパス）、合体（tier に応じて音程が上がる正弦波の短いアルペジオ）、ゲームオーバー（下降グライド）。
- ゲーム内にミュートボタンや音量 UI は置かない。

## 9. 多言語

- `port.getLanguage()` の結果が `ja` で始まれば日本語、それ以外と失敗時は英語。
- 文言はスコア、ベスト、次、ゲームオーバー、もう一度、WebGL 非対応メッセージの 6 件。
- 言語設定はセーブに保存しない（`LocalAdapter` は `'ja'` を返す）。

## 10. エラー処理

| 事象 | 対応 |
|---|---|
| `loadData` 失敗・タイムアウト | 初期状態で開始。失敗なら `logError`、タイムアウトなら `logWarning` |
| `saveData` 失敗 | `logError` して継続。次の保存契機で再試行 |
| `sendScore` 失敗 | 無視。次回ゲームオーバー時に再送 |
| WebGL 初期化失敗 | DOM メッセージ、`logError`、ループ開始しない。`firstFrameReady` は呼ぶ（画面は出す） |
| 物理の巨大 dt | アキュムレータ上限 5 ステップで切り捨て |
| 想定外の例外 | `window.onerror` / `unhandledrejection` で `logError`。ゲームは継続を試みる |

## 11. テストと検証

### 11.1 自動テスト（Vitest、node 環境）

- `core/tiers`: 半径の単調増加、2 体が箱に収まる不変条件、11 件であること。
- `core/rules`: 合体の基本、3 体接触時の二重合体防止、最上位同士の消滅、スコア加算、ゲームオーバーのタイマー継続と途切れ。
- `core/rng`: シード再現性、抽選範囲が 0〜4。
- `core/save`: 往復、旧版マイグレーション、破損入力で `null`、200 体で 64 KiB 未満。
- `physics/MatterWorld`: 落下して床で止まる、接触ペアが通知される、追加・削除が反映される、ユニット↔Matter 座標の変換。
- `app/LayoutPlanner`: 代表 9 アスペクト比で箱がビューポート内に収まる。
- `ui/i18n`: `ja-JP` → 日本語、`en-US` / 失敗 → 英語。

### 11.2 ビルド検査（`scripts/check-bundle.mjs`）

- 個別ファイルが 512 KiB 超なら警告、30 MiB 超なら失敗。
- ファイル名が `[A-Za-z0-9_.-]` 以外を含めば失敗。
- `index.html` に `https://www.youtube.com/game_api/v1` の `<script>` が最初のスクリプトとして存在することを確認。
- 総ファイル数と総サイズを出力。

### 11.3 手動検証（README に手順を記載）

1. `npm run dev` を Test Suite（developers.google.com/youtube/gaming/playables/test_suite）に読み込ませ、ライフサイクルのログを確認。
2. Test Suite の「ローディング画面モック（高さ 0）」で描画が止まらないことを確認。
3. Chrome Local Overrides で本番 CSP を付与し、コンソールに違反がないことを確認。
4. DevTools のデバイスモードで 9:32、9:16、1:1、16:9、32:9 を確認。
5. `npm run build && npm run check:bundle && npm run zip` で ZIP を生成。

## 12. ビルドとツールチェーン

- npm、TypeScript strict（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）、`any` 禁止。
- Vite: `base: './'`、`build.target: 'es2022'`、`assetsInlineLimit: 0`、`sourcemap: false`、`manualChunks` で `three` と `matter-js` を分離。
- 依存: `three`、`matter-js`、`@types/matter-js`、`@types/three`。開発: `vite`、`vitest`、`typescript`。
- SDK 型定義は公式 `index.d.ts` を `src/types/ytgame.d.ts` に同梱（ライセンスヘッダ保持）。`SdkErrorType` は `const enum` なので実行時に値参照しない。
- npm scripts: `dev`、`build`、`preview`、`test`、`typecheck`、`check:bundle`、`zip`。

## 13. 既知のリスクと対応

| リスク | 対応 |
|---|---|
| three.js チャンクが 512 KiB（SHOULD）を超える | 必要モジュールのみ import して tree-shake。超過しても MUST ではないため提出は可。超過幅が大きければ Canvas 2D への差し替えを別タスクとして検討 |
| iOS Safari（WKWebView）で 30 fps 程度に落ちる | 物理は固定ステップなので挙動は不変。`pixelRatio` 上限 2 で描画負荷を抑える |
| Matter.js の積み重ね時の微振動 | `restitution: 0.1`、`friction: 0.3`、`positionIterations: 8` から調整。静止判定の速度閾値で吸収 |
| 商標の衝突 | 提出前に J-PlatPat / USPTO を検索。表示文字列は `i18n.ts` に集約し改名を容易にする |
| 既存 Playables との「重複」判定 | 海の生き物モチーフ、three.js の立体表現、泡の演出で差別化 |
