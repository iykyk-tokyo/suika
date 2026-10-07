# Ocean Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YouTube Playables に提出できる、海の生き物モチーフの「落として同種を合体させる」パズルを TDD で完成させる。

**Architecture:** `core`（純粋ロジック）を中心に、`physics`（Matter.js）、`render`（three.js）、`audio`（Web Audio）、`playables`（SDK 抽象化）、`ui`（DOM HUD）が `core` の型だけを介して会話し、`app/Game` が全部を接続する。物理は 2D、描画は z=0 平面に置いた 3D メッシュ。

**Tech Stack:** TypeScript 5.9 strict、Vite 7、Vitest 4、three 0.186、matter-js 0.20、npm、Node 24。

**Spec:** `docs/superpowers/specs/2026-10-07-ocean-merge-design.md`

## Global Constraints

- `any` 禁止。`tsconfig` は `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` を有効にする。
- `core/` は DOM・three・matter を import しない。
- 外部通信ゼロ。`fetch`、外部フォント、外部画像を使わない。唯一の外部スクリプトは `https://www.youtube.com/game_api/v1`。
- `index.html` では SDK の `<script>` を最初のスクリプトとして置き、`main.ts` より前に読み込む。
- WASM、Web Worker、`eval`、Page Visibility API、`navigator.language`、`alert/confirm/prompt`、localStorage へのセーブ（本番時）を使わない。
- `firstFrameReady()` は `gameReady()` より前、どちらも 1 回だけ呼ぶ。
- セーブは 1 つの JSON 文字列。200 体のスナップショットで 64 KiB 未満。
- `sendScore` に渡す値はセーブ内 `bestScore` と常に一致。
- Esc キーに `preventDefault` しない。ゲーム内に終了ボタン・全体ミュートボタンを置かない。
- 箱の内寸は幅 10 ユニット・高さ 13 ユニット、危険ライン y=11、出現 y=12.2。原点は床中央、y 上向き。
- ティアは 11 段階、半径は `[0.40, 0.52, 0.66, 0.82, 1.00, 1.20, 1.42, 1.66, 1.92, 2.18, 2.45]`、合体点は `[1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]`。
- 表示タイトルは「Ocean Merge」/「オーシャンマージ」。他社商標・果物モチーフを使わない。
- 全ファイル名は `[A-Za-z0-9_.-]` のみ。個別ファイルは 30 MiB 未満（512 KiB 超は警告）。
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` を付ける。

## Review Focus

1. 箱の端ギリギリを狙って落とす → 物体が壁にめり込まず、半径分内側にクランプされる（Task 4 の `clampAimX` テスト）。
2. 長時間一時停止してから再開 → 物理が一気に進まない。1 フレーム最大 5 ステップで切り捨て（Task 13 の `advanceAccumulator` テスト）。
3. Android の非表示 WebView で `innerWidth/innerHeight` が 0 → レイアウトを適用せず前回の値を保つ（Task 7 の `shouldApplyResize` テスト）。
4. 旧版や欠損のあるセーブ JSON → 例外を投げずに `null` か移行済みデータを返す（Task 5 の `parseSave` テスト）。
5. キーのオートリピートで Space を押し続ける → 1 回の落下しか起きない（Task 12 の `mapKeyEvent` の `repeat` テスト）。

---

### Task 1: プロジェクト雛形とティア定義

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/types/ytgame.d.ts`, `src/core/types.ts`, `src/core/tiers.ts`
- Test: `src/core/tiers.test.ts`

**Interfaces:**
- Produces: `TierId`, `BodyId`, `Vec2`, `BodyState`, `ContactPair`, `SpawnRequest`, `MergeResult`（`core/types.ts`）、`TIERS`, `TierDef`, `CreatureShape`, `tierDef(id)`, `nextTier(id)`, `isTierId(n)`, `BOX`, `DROPPABLE_TIER_MAX`, `MAX_TIER`（`core/tiers.ts`）

- [ ] **Step 1: 依存をインストールして設定ファイルを作る**

```bash
cd /Volumes/OWCExpress1M2/work/suika
npm init -y >/dev/null
npm pkg set name=ocean-merge version=0.1.0 private=true type=module
npm pkg set scripts.dev="vite --host" scripts.build="tsc --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.check:bundle="node scripts/check-bundle.mjs" scripts.zip="node scripts/make-zip.mjs"
npm i three@^0.186.0 matter-js@^0.20.0
npm i -D typescript@^5.9.3 vite@^7.3.0 vitest@^4.1.0 @types/three@^0.186.0 @types/matter-js@^0.20.2
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 8080 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          matter: ['matter-js'],
        },
      },
    },
  },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`index.html`（SDK スクリプトが最初のスクリプト。`main.ts` はその後）:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Ocean Merge</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #06203a; }
      #game { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
      #hud { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; color: #eaf6ff; }
    </style>
    <script src="https://www.youtube.com/game_api/v1"></script>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="hud"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules
dist
*.zip
```

`src/main.ts`（仮。Task 14 で置き換える）:

```ts
export {};
```

- [ ] **Step 2: 公式 SDK 型定義を同梱する**

```bash
curl -sSf -o src/types/ytgame.d.ts "https://www.youtube.com/playablesportal/static/youtube_ytgame_web_deploy_mpm_files/index.d.ts"
head -3 src/types/ytgame.d.ts   # "Copyright 2024 Google LLC" のヘッダがあること
grep -c "declare namespace ytgame" src/types/ytgame.d.ts   # 1 以上
```

- [ ] **Step 3: 共有型を書く**

`src/core/types.ts`:

```ts
export type TierId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type BodyId = number;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface BodyState {
  readonly id: BodyId;
  readonly tier: TierId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly angle: number;
}

export interface ContactPair {
  readonly a: BodyId;
  readonly b: BodyId;
}

export interface SpawnRequest {
  readonly tier: TierId;
  readonly position: Vec2;
  readonly velocity: Vec2;
}

export interface MergeResult {
  readonly removed: readonly BodyId[];
  readonly spawned: readonly SpawnRequest[];
  readonly scoreDelta: number;
}
```

- [ ] **Step 4: 失敗するテストを書く**

`src/core/tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOX, DROPPABLE_TIER_MAX, MAX_TIER, TIERS, isTierId, nextTier, tierDef } from './tiers';

describe('TIERS', () => {
  it('has 11 tiers with ids 0..10 in order', () => {
    expect(TIERS).toHaveLength(11);
    TIERS.forEach((t, i) => expect(t.id).toBe(i));
  });

  it('radii strictly increase', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i]!.radius).toBeGreaterThan(TIERS[i - 1]!.radius);
    }
  });

  it('two largest bodies fit side by side in the box', () => {
    expect(TIERS[MAX_TIER].radius * 4).toBeLessThan(BOX.width);
  });

  it('merge scores are triangular numbers', () => {
    expect(TIERS.map((t) => t.mergeScore)).toEqual([1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]);
  });

  it('every tier has both names and a shape', () => {
    for (const t of TIERS) {
      expect(t.nameJa.length).toBeGreaterThan(0);
      expect(t.nameEn.length).toBeGreaterThan(0);
      expect(t.shape.length).toBeGreaterThan(0);
    }
  });
});

describe('tierDef / nextTier / isTierId', () => {
  it('returns the definition for an id', () => {
    expect(tierDef(4).nameEn).toBe('Crab');
  });

  it('nextTier returns id+1 and null for the max tier', () => {
    expect(nextTier(0)).toBe(1);
    expect(nextTier(9)).toBe(10);
    expect(nextTier(MAX_TIER)).toBeNull();
  });

  it('isTierId accepts 0..10 integers only', () => {
    expect(isTierId(0)).toBe(true);
    expect(isTierId(10)).toBe(true);
    expect(isTierId(11)).toBe(false);
    expect(isTierId(-1)).toBe(false);
    expect(isTierId(2.5)).toBe(false);
  });

  it('droppable range and box constants match the spec', () => {
    expect(DROPPABLE_TIER_MAX).toBe(4);
    expect(BOX).toEqual({ width: 10, height: 13, dangerY: 11, spawnY: 12.2 });
  });
});
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `npx vitest run src/core/tiers.test.ts`
Expected: FAIL（`./tiers` が見つからない）

- [ ] **Step 6: ティア定義を実装する**

`src/core/tiers.ts`:

```ts
import type { TierId } from './types';

export type CreatureShape =
  | 'plankton'
  | 'seaAngel'
  | 'jellyfish'
  | 'pufferfish'
  | 'crab'
  | 'octopus'
  | 'penguin'
  | 'seal'
  | 'dolphin'
  | 'shark'
  | 'whale';

export interface TierDef {
  readonly id: TierId;
  readonly nameJa: string;
  readonly nameEn: string;
  readonly radius: number;
  readonly mergeScore: number;
  readonly baseColor: number;
  readonly accentColor: number;
  readonly shape: CreatureShape;
}

export const TIERS: readonly TierDef[] = [
  { id: 0, nameJa: 'プランクトン', nameEn: 'Plankton', radius: 0.4, mergeScore: 1, baseColor: 0xb8f2a6, accentColor: 0x6fcf7a, shape: 'plankton' },
  { id: 1, nameJa: 'クリオネ', nameEn: 'Sea Angel', radius: 0.52, mergeScore: 3, baseColor: 0xf6d9ff, accentColor: 0xff8fcf, shape: 'seaAngel' },
  { id: 2, nameJa: 'クラゲ', nameEn: 'Jellyfish', radius: 0.66, mergeScore: 6, baseColor: 0xc7b8ff, accentColor: 0x8a6cff, shape: 'jellyfish' },
  { id: 3, nameJa: 'フグ', nameEn: 'Pufferfish', radius: 0.82, mergeScore: 10, baseColor: 0xffd27a, accentColor: 0xd98f1f, shape: 'pufferfish' },
  { id: 4, nameJa: 'カニ', nameEn: 'Crab', radius: 1.0, mergeScore: 15, baseColor: 0xff7a5c, accentColor: 0xc73e22, shape: 'crab' },
  { id: 5, nameJa: 'タコ', nameEn: 'Octopus', radius: 1.2, mergeScore: 21, baseColor: 0xe06ca8, accentColor: 0x9c3b73, shape: 'octopus' },
  { id: 6, nameJa: 'ペンギン', nameEn: 'Penguin', radius: 1.42, mergeScore: 28, baseColor: 0x2c3e50, accentColor: 0xf5f5f5, shape: 'penguin' },
  { id: 7, nameJa: 'アザラシ', nameEn: 'Seal', radius: 1.66, mergeScore: 36, baseColor: 0xb0b8c4, accentColor: 0x6c7684, shape: 'seal' },
  { id: 8, nameJa: 'イルカ', nameEn: 'Dolphin', radius: 1.92, mergeScore: 45, baseColor: 0x5fa8e6, accentColor: 0x2a6fb3, shape: 'dolphin' },
  { id: 9, nameJa: 'サメ', nameEn: 'Shark', radius: 2.18, mergeScore: 55, baseColor: 0x6b7f99, accentColor: 0x3b4b60, shape: 'shark' },
  { id: 10, nameJa: 'クジラ', nameEn: 'Whale', radius: 2.45, mergeScore: 66, baseColor: 0x3156a3, accentColor: 0x1c3566, shape: 'whale' },
];

export const MAX_TIER: TierId = 10;
export const DROPPABLE_TIER_MAX: TierId = 4;

export const BOX = {
  width: 10,
  height: 13,
  dangerY: 11,
  spawnY: 12.2,
} as const;

export function isTierId(n: number): n is TierId {
  return Number.isInteger(n) && n >= 0 && n <= MAX_TIER;
}

export function tierDef(id: TierId): TierDef {
  const def = TIERS[id];
  if (def === undefined) {
    throw new Error(`unknown tier ${id}`);
  }
  return def;
}

export function nextTier(id: TierId): TierId | null {
  const n = id + 1;
  return isTierId(n) ? n : null;
}
```

- [ ] **Step 7: テストと型検査が通ることを確認**

Run: `npx vitest run src/core/tiers.test.ts && npx tsc --noEmit`
Expected: PASS（7 tests）、tsc エラーなし

- [ ] **Step 8: コミット**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html .gitignore src
git commit -m "feat: scaffold project and define creature tiers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: シード付き乱数と次ピース抽選

**Files:**
- Create: `src/core/rng.ts`
- Test: `src/core/rng.test.ts`

**Interfaces:**
- Consumes: `TierId`, `DROPPABLE_TIER_MAX`
- Produces: `class Rng { constructor(seed: number); next(): number; nextInt(maxExclusive: number): number; }`, `nextDropTier(rng: Rng): TierId`, `randomSeed(): number`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Rng, nextDropTier, randomSeed } from './rng';

describe('Rng', () => {
  it('is reproducible for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('next() is in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt covers 0..max-1', () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.nextInt(5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('nextDropTier', () => {
  it('only yields tiers 0..4', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const t = nextDropTier(rng);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(4);
    }
  });
});

describe('randomSeed', () => {
  it('returns a non-negative 32-bit integer', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/core/rng.test.ts`
Expected: FAIL（`./rng` が見つからない）

- [ ] **Step 3: 実装**

`src/core/rng.ts`（mulberry32）:

```ts
import { DROPPABLE_TIER_MAX, isTierId } from './tiers';
import type { TierId } from './types';

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

export function nextDropTier(rng: Rng): TierId {
  const n = rng.nextInt(DROPPABLE_TIER_MAX + 1);
  if (!isTierId(n)) {
    throw new Error(`rng produced invalid tier ${n}`);
  }
  return n;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/core/rng.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: コミット**

```bash
git add src/core/rng.ts src/core/rng.test.ts
git commit -m "feat(core): add seeded rng and drop tier picker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 合体解決（resolveMerges）

**Files:**
- Create: `src/core/rules.ts`
- Test: `src/core/rules.test.ts`

**Interfaces:**
- Consumes: `BodyState`, `ContactPair`, `MergeResult`, `tierDef`, `nextTier`
- Produces: `resolveMerges(contacts: readonly ContactPair[], bodies: ReadonlyMap<BodyId, BodyState>): MergeResult`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveMerges } from './rules';
import type { BodyId, BodyState, TierId } from './types';

function body(id: BodyId, tier: TierId, x: number, y: number, vx = 0, vy = 0): BodyState {
  return { id, tier, position: { x, y }, velocity: { x: vx, y: vy }, angle: 0 };
}

function map(...bodies: BodyState[]): ReadonlyMap<BodyId, BodyState> {
  return new Map(bodies.map((b) => [b.id, b]));
}

describe('resolveMerges', () => {
  it('merges two bodies of the same tier into the next tier at the midpoint with averaged velocity', () => {
    const bodies = map(body(1, 2, -1, 1, 2, 0), body(2, 2, 1, 3, 0, 2));
    const r = resolveMerges([{ a: 1, b: 2 }], bodies);
    expect(r.removed).toEqual([1, 2]);
    expect(r.spawned).toEqual([{ tier: 3, position: { x: 0, y: 2 }, velocity: { x: 1, y: 1 } }]);
    expect(r.scoreDelta).toBe(6);
  });

  it('ignores contacts between different tiers', () => {
    const r = resolveMerges([{ a: 1, b: 2 }], map(body(1, 0, 0, 0), body(2, 1, 1, 0)));
    expect(r.removed).toEqual([]);
    expect(r.spawned).toEqual([]);
    expect(r.scoreDelta).toBe(0);
  });

  it('merges each body at most once per step (three-way contact)', () => {
    const bodies = map(body(1, 0, 0, 0), body(2, 0, 1, 0), body(3, 0, 2, 0));
    const r = resolveMerges([{ a: 1, b: 2 }, { a: 2, b: 3 }], bodies);
    expect(r.removed).toEqual([1, 2]);
    expect(r.spawned).toHaveLength(1);
    expect(r.scoreDelta).toBe(1);
  });

  it('handles two independent merges in one step', () => {
    const bodies = map(body(1, 1, 0, 0), body(2, 1, 1, 0), body(3, 4, 5, 0), body(4, 4, 6, 0));
    const r = resolveMerges([{ a: 1, b: 2 }, { a: 3, b: 4 }], bodies);
    expect(r.removed).toEqual([1, 2, 3, 4]);
    expect(r.spawned.map((s) => s.tier)).toEqual([2, 5]);
    expect(r.scoreDelta).toBe(3 + 15);
  });

  it('removes both top-tier bodies without spawning and awards 66', () => {
    const r = resolveMerges([{ a: 1, b: 2 }], map(body(1, 10, -2.5, 2.45), body(2, 10, 2.5, 2.45)));
    expect(r.removed).toEqual([1, 2]);
    expect(r.spawned).toEqual([]);
    expect(r.scoreDelta).toBe(66);
  });

  it('skips contacts that reference unknown bodies', () => {
    const r = resolveMerges([{ a: 1, b: 99 }], map(body(1, 0, 0, 0)));
    expect(r.removed).toEqual([]);
  });

  it('skips self contacts', () => {
    const r = resolveMerges([{ a: 1, b: 1 }], map(body(1, 0, 0, 0)));
    expect(r.removed).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/core/rules.test.ts`
Expected: FAIL（`./rules` が見つからない）

- [ ] **Step 3: 実装**

`src/core/rules.ts`:

```ts
import { nextTier, tierDef } from './tiers';
import type { BodyId, BodyState, ContactPair, MergeResult, SpawnRequest } from './types';

export function resolveMerges(
  contacts: readonly ContactPair[],
  bodies: ReadonlyMap<BodyId, BodyState>,
): MergeResult {
  const consumed = new Set<BodyId>();
  const removed: BodyId[] = [];
  const spawned: SpawnRequest[] = [];
  let scoreDelta = 0;

  for (const { a, b } of contacts) {
    if (a === b || consumed.has(a) || consumed.has(b)) continue;
    const ba = bodies.get(a);
    const bb = bodies.get(b);
    if (ba === undefined || bb === undefined || ba.tier !== bb.tier) continue;

    consumed.add(a);
    consumed.add(b);
    removed.push(a, b);
    scoreDelta += tierDef(ba.tier).mergeScore;

    const upgraded = nextTier(ba.tier);
    if (upgraded !== null) {
      spawned.push({
        tier: upgraded,
        position: { x: (ba.position.x + bb.position.x) / 2, y: (ba.position.y + bb.position.y) / 2 },
        velocity: { x: (ba.velocity.x + bb.velocity.x) / 2, y: (ba.velocity.y + bb.velocity.y) / 2 },
      });
    }
  }

  return { removed, spawned, scoreDelta };
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/core/rules.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add src/core/rules.ts src/core/rules.test.ts
git commit -m "feat(core): resolve same-tier merges

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: ゲームオーバー判定と狙い位置のクランプ

**Files:**
- Modify: `src/core/rules.ts`
- Test: `src/core/rules.test.ts`（追記）

**Interfaces:**
- Produces: `evaluateGameOver(bodies, dtSec, timerSec, options?): GameOverEval`, `GameOverEval { over: boolean; timerSec: number }`, `GameOverOptions { dangerY; restSpeed; holdSec }`, `DEFAULT_GAME_OVER: GameOverOptions`, `clampAimX(x: number, tier: TierId, boxWidth?: number): number`

- [ ] **Step 1: 失敗するテストを追記**

`src/core/rules.test.ts` の末尾に追加:

```ts
import { DEFAULT_GAME_OVER, clampAimX, evaluateGameOver } from './rules';

describe('evaluateGameOver', () => {
  const resting = (y: number, tier: TierId = 4): BodyState => body(1, tier, 0, y);

  it('stays not-over while nothing is above the danger line', () => {
    const r = evaluateGameOver([resting(5)], 0.5, 0);
    expect(r).toEqual({ over: false, timerSec: 0 });
  });

  it('accumulates while a resting body pokes above the line', () => {
    // tier 4 radius 1.0 → top = 10.5 + 1.0 = 11.5 > 11
    const r = evaluateGameOver([resting(10.5)], 0.5, 0);
    expect(r.over).toBe(false);
    expect(r.timerSec).toBeCloseTo(0.5);
  });

  it('declares game over once the timer reaches holdSec', () => {
    const r = evaluateGameOver([resting(10.5)], 0.5, 0.6);
    expect(r.over).toBe(true);
  });

  it('resets the timer when the body is moving', () => {
    const falling: BodyState = { ...resting(10.5), velocity: { x: 0, y: -3 } };
    const r = evaluateGameOver([falling], 0.5, 0.9);
    expect(r).toEqual({ over: false, timerSec: 0 });
  });

  it('resets the timer when nothing is above the line anymore', () => {
    const r = evaluateGameOver([resting(2)], 0.5, 0.9);
    expect(r.timerSec).toBe(0);
  });

  it('uses the radius of the body tier', () => {
    // tier 0 radius 0.4 → top = 10.8 → not above 11
    expect(evaluateGameOver([resting(10.4, 0)], 0.5, 0).timerSec).toBe(0);
  });

  it('default options match the spec', () => {
    expect(DEFAULT_GAME_OVER).toEqual({ dangerY: 11, restSpeed: 0.2, holdSec: 1.0 });
  });
});

describe('clampAimX', () => {
  it('keeps x inside the walls by one radius', () => {
    expect(clampAimX(-100, 4)).toBe(-4);
    expect(clampAimX(100, 4)).toBe(4);
    expect(clampAimX(0.3, 0)).toBe(0.3);
    expect(clampAimX(4.9, 0)).toBeCloseTo(4.6);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/core/rules.test.ts`
Expected: FAIL（`evaluateGameOver` / `clampAimX` が export されていない）

- [ ] **Step 3: 実装を追記**

`src/core/rules.ts` の末尾に追加（先頭の import に `BOX` と `TierId` を足す）:

```ts
import { BOX, nextTier, tierDef } from './tiers';
import type { BodyId, BodyState, ContactPair, MergeResult, SpawnRequest, TierId } from './types';

// ...resolveMerges は既存のまま...

export interface GameOverOptions {
  readonly dangerY: number;
  readonly restSpeed: number;
  readonly holdSec: number;
}

export const DEFAULT_GAME_OVER: GameOverOptions = { dangerY: BOX.dangerY, restSpeed: 0.2, holdSec: 1.0 };

export interface GameOverEval {
  readonly over: boolean;
  readonly timerSec: number;
}

export function evaluateGameOver(
  bodies: readonly BodyState[],
  dtSec: number,
  timerSec: number,
  options: GameOverOptions = DEFAULT_GAME_OVER,
): GameOverEval {
  const offending = bodies.some((b) => {
    const top = b.position.y + tierDef(b.tier).radius;
    const speed = Math.hypot(b.velocity.x, b.velocity.y);
    return top > options.dangerY && speed < options.restSpeed;
  });
  if (!offending) return { over: false, timerSec: 0 };
  const next = timerSec + dtSec;
  return { over: next >= options.holdSec, timerSec: next };
}

export function clampAimX(x: number, tier: TierId, boxWidth: number = BOX.width): number {
  const r = tierDef(tier).radius;
  const limit = boxWidth / 2 - r;
  return Math.min(limit, Math.max(-limit, x));
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/core/rules.test.ts && npx tsc --noEmit`
Expected: PASS（15 tests）

- [ ] **Step 5: コミット**

```bash
git add src/core/rules.ts src/core/rules.test.ts
git commit -m "feat(core): add game-over timer and aim clamping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: セーブデータのスキーマとマイグレーション

**Files:**
- Create: `src/core/save.ts`
- Test: `src/core/save.test.ts`

**Interfaces:**
- Consumes: `TierId`, `isTierId`
- Produces: `SaveData`（= `SaveDataV1`）, `BoardSnapshot`, `SnapshotBody { t: TierId; x: number; y: number; a: number }`, `createEmptySave(): SaveData`, `serializeSave(save: SaveData): string`, `parseSave(raw: string): SaveData | null`, `SAVE_SIZE_LIMIT_BYTES = 65536`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/save.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SAVE_SIZE_LIMIT_BYTES, createEmptySave, parseSave, serializeSave } from './save';
import type { SaveData, SnapshotBody } from './save';
import type { TierId } from './types';

describe('save round trip', () => {
  it('serializes and parses an empty save', () => {
    const s = createEmptySave();
    expect(s).toEqual({ v: 1, bestScore: 0, snapshot: null });
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it('serializes and parses a snapshot', () => {
    const s: SaveData = {
      v: 1,
      bestScore: 120,
      snapshot: { score: 40, nextTier: 2, bodies: [{ t: 3, x: -1.25, y: 0.82, a: 0.5 }] },
    };
    expect(parseSave(serializeSave(s))).toEqual(s);
  });
});

describe('parseSave rejects garbage without throwing', () => {
  it.each(['', 'not json', '[]', 'null', '42', '{"v":999}', '{"v":1}', '{"v":1,"bestScore":"x","snapshot":null}'])(
    'returns null for %j',
    (raw) => {
      expect(parseSave(raw)).toBeNull();
    },
  );

  it('returns null when a snapshot body has an invalid tier', () => {
    const raw = JSON.stringify({ v: 1, bestScore: 0, snapshot: { score: 0, nextTier: 0, bodies: [{ t: 11, x: 0, y: 0, a: 0 }] } });
    expect(parseSave(raw)).toBeNull();
  });

  it('returns null when nextTier is not droppable', () => {
    const raw = JSON.stringify({ v: 1, bestScore: 0, snapshot: { score: 0, nextTier: 9, bodies: [] } });
    expect(parseSave(raw)).toBeNull();
  });

  it('clamps negative or non-finite bestScore to 0', () => {
    expect(parseSave('{"v":1,"bestScore":-5,"snapshot":null}')?.bestScore).toBe(0);
  });
});

describe('size', () => {
  it('keeps 200 bodies under the 64 KiB flush limit', () => {
    const bodies: SnapshotBody[] = Array.from({ length: 200 }, (_, i) => ({ t: (i % 11) as TierId, x: -4.123456, y: 12.123456, a: 3.141592 }));
    const s: SaveData = { v: 1, bestScore: 999999, snapshot: { score: 123456, nextTier: 4, bodies } };
    const bytes = new TextEncoder().encode(serializeSave(s)).length;
    expect(bytes).toBeLessThan(SAVE_SIZE_LIMIT_BYTES);
    expect(bytes).toBeLessThan(12 * 1024);
  });

  it('rounds coordinates to 3 decimals to save space', () => {
    const s: SaveData = { v: 1, bestScore: 0, snapshot: { score: 0, nextTier: 0, bodies: [{ t: 0, x: 1.23456789, y: 2.34567891, a: 3.45678912 }] } };
    const parsed = parseSave(serializeSave(s));
    expect(parsed?.snapshot?.bodies[0]).toEqual({ t: 0, x: 1.235, y: 2.346, a: 3.457 });
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/core/save.test.ts`
Expected: FAIL（`./save` が見つからない）

- [ ] **Step 3: 実装**

`src/core/save.ts`:

```ts
import { DROPPABLE_TIER_MAX, isTierId } from './tiers';
import type { TierId } from './types';

export const SAVE_SIZE_LIMIT_BYTES = 64 * 1024;

export interface SnapshotBody {
  readonly t: TierId;
  readonly x: number;
  readonly y: number;
  readonly a: number;
}

export interface BoardSnapshot {
  readonly score: number;
  readonly nextTier: TierId;
  readonly bodies: readonly SnapshotBody[];
}

export interface SaveDataV1 {
  readonly v: 1;
  readonly bestScore: number;
  readonly snapshot: BoardSnapshot | null;
}

export type SaveData = SaveDataV1;

export function createEmptySave(): SaveData {
  return { v: 1, bestScore: 0, snapshot: null };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function serializeSave(save: SaveData): string {
  const snapshot =
    save.snapshot === null
      ? null
      : {
          score: save.snapshot.score,
          nextTier: save.snapshot.nextTier,
          bodies: save.snapshot.bodies.map((b) => ({ t: b.t, x: round3(b.x), y: round3(b.y), a: round3(b.a) })),
        };
  return JSON.stringify({ v: save.v, bestScore: save.bestScore, snapshot });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseBody(v: unknown): SnapshotBody | null {
  if (!isRecord(v)) return null;
  const { t, x, y, a } = v;
  if (!isFiniteNumber(t) || !isTierId(t)) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(a)) return null;
  return { t, x, y, a };
}

function parseSnapshot(v: unknown): BoardSnapshot | null | undefined {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  const { score, nextTier, bodies } = v;
  if (!isFiniteNumber(score) || score < 0) return undefined;
  if (!isFiniteNumber(nextTier) || !isTierId(nextTier) || nextTier > DROPPABLE_TIER_MAX) return undefined;
  if (!Array.isArray(bodies)) return undefined;
  const parsed: SnapshotBody[] = [];
  for (const b of bodies) {
    const pb = parseBody(b);
    if (pb === null) return undefined;
    parsed.push(pb);
  }
  return { score, nextTier, bodies: parsed };
}

function parseV1(obj: Record<string, unknown>): SaveData | null {
  const bestScoreRaw = obj['bestScore'];
  if (!isFiniteNumber(bestScoreRaw)) return null;
  const bestScore = Math.max(0, Math.floor(bestScoreRaw));
  if (!('snapshot' in obj)) return null;
  const snapshot = parseSnapshot(obj['snapshot']);
  if (snapshot === undefined) return null;
  return { v: 1, bestScore, snapshot };
}

export function parseSave(raw: string): SaveData | null {
  if (raw.trim() === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data['v']) {
    case 1:
      return parseV1(data);
    default:
      return null;
  }
}
```

将来 `v: 2` を足すときは `switch` に `case 2` を追加し、`case 1` は v1 → v2 の変換関数を通す。

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/core/save.test.ts && npx tsc --noEmit`
Expected: PASS（14 tests）

- [ ] **Step 5: コミット**

```bash
git add src/core/save.ts src/core/save.test.ts
git commit -m "feat(core): add save schema, serializer and tolerant parser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 物理ワールド（Matter.js アダプタ）

**Files:**
- Create: `src/physics/PhysicsWorld.ts`, `src/physics/MatterWorld.ts`
- Test: `src/physics/MatterWorld.test.ts`

**Interfaces:**
- Consumes: `BodyId`, `BodyState`, `ContactPair`, `TierId`, `Vec2`, `tierDef`, `BOX`
- Produces:

```ts
export interface PhysicsWorld {
  addBody(tier: TierId, position: Vec2, velocity?: Vec2, angle?: number): BodyId;
  removeBody(id: BodyId): void;
  step(dtSec: number): readonly ContactPair[];   // このステップで新たに始まった接触
  getBodies(): readonly BodyState[];
  getBody(id: BodyId): BodyState | undefined;
  clear(): void;
}
export class MatterWorld implements PhysicsWorld { constructor(); }
export const UNIT_TO_PX = 50;
export function toMatter(p: Vec2): Vec2;   // ユニット→Matter 座標（y 反転、床中央原点→箱左上基準）
export function fromMatter(p: Vec2): Vec2;
```

- [ ] **Step 1: 失敗するテストを書く**

`src/physics/MatterWorld.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOX, tierDef } from '../core/tiers';
import { MatterWorld, UNIT_TO_PX, fromMatter, toMatter } from './MatterWorld';

function settle(world: MatterWorld, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60);
}

describe('coordinate conversion', () => {
  it('maps the floor center to the bottom middle of the Matter box', () => {
    expect(toMatter({ x: 0, y: 0 })).toEqual({ x: (BOX.width / 2) * UNIT_TO_PX, y: BOX.height * UNIT_TO_PX });
  });

  it('round trips', () => {
    const p = { x: -3.2, y: 7.7 };
    const back = fromMatter(toMatter(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe('MatterWorld', () => {
  it('adds a body and reports it in unit coordinates', () => {
    const w = new MatterWorld();
    const id = w.addBody(3, { x: 1.5, y: 12 });
    const b = w.getBody(id);
    expect(b?.tier).toBe(3);
    expect(b?.position.x).toBeCloseTo(1.5);
    expect(b?.position.y).toBeCloseTo(12);
    expect(w.getBodies()).toHaveLength(1);
  });

  it('a dropped body falls and rests on the floor', () => {
    const w = new MatterWorld();
    const id = w.addBody(4, { x: 0, y: 12 });
    settle(w, 4);
    const b = w.getBody(id);
    expect(b).toBeDefined();
    expect(b!.position.y).toBeCloseTo(tierDef(4).radius, 1);
    expect(Math.hypot(b!.velocity.x, b!.velocity.y)).toBeLessThan(0.2);
  });

  it('bodies stay inside the walls', () => {
    const w = new MatterWorld();
    const id = w.addBody(2, { x: 4.3, y: 12 }, { x: 20, y: 0 });
    settle(w, 3);
    const b = w.getBody(id)!;
    expect(b.position.x).toBeLessThanOrEqual(BOX.width / 2 - tierDef(2).radius + 0.05);
    expect(b.position.x).toBeGreaterThanOrEqual(-BOX.width / 2 + tierDef(2).radius - 0.05);
  });

  it('reports a contact when two bodies touch', () => {
    const w = new MatterWorld();
    const a = w.addBody(1, { x: 0, y: 0.52 });
    const b = w.addBody(1, { x: 0, y: 6 });
    const seen: Array<{ a: number; b: number }> = [];
    for (let i = 0; i < 240; i++) {
      for (const c of w.step(1 / 60)) seen.push(c);
    }
    const pair = seen.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    expect(pair).toBeDefined();
  });

  it('does not report wall or floor contacts as pairs', () => {
    const w = new MatterWorld();
    w.addBody(1, { x: 0, y: 5 });
    let count = 0;
    for (let i = 0; i < 240; i++) count += w.step(1 / 60).length;
    expect(count).toBe(0);
  });

  it('removes bodies and clears the world', () => {
    const w = new MatterWorld();
    const id = w.addBody(0, { x: 0, y: 5 });
    w.removeBody(id);
    expect(w.getBody(id)).toBeUndefined();
    w.addBody(0, { x: 0, y: 5 });
    w.clear();
    expect(w.getBodies()).toEqual([]);
  });

  it('applies initial velocity and angle', () => {
    const w = new MatterWorld();
    const id = w.addBody(5, { x: 0, y: 8 }, { x: 3, y: 0 }, 1.2);
    const b = w.getBody(id)!;
    expect(b.velocity.x).toBeGreaterThan(0);
    expect(b.angle).toBeCloseTo(1.2, 1);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/physics/MatterWorld.test.ts`
Expected: FAIL（`./MatterWorld` が見つからない）

- [ ] **Step 3: インターフェースと実装**

`src/physics/PhysicsWorld.ts`:

```ts
import type { BodyId, BodyState, ContactPair, TierId, Vec2 } from '../core/types';

export interface PhysicsWorld {
  addBody(tier: TierId, position: Vec2, velocity?: Vec2, angle?: number): BodyId;
  removeBody(id: BodyId): void;
  step(dtSec: number): readonly ContactPair[];
  getBodies(): readonly BodyState[];
  getBody(id: BodyId): BodyState | undefined;
  clear(): void;
}
```

`src/physics/MatterWorld.ts`:

```ts
import { Bodies, Body, Composite, Engine, Events } from 'matter-js';
import type { IEventCollision } from 'matter-js';
import { BOX, tierDef } from '../core/tiers';
import type { BodyId, BodyState, ContactPair, TierId, Vec2 } from '../core/types';
import type { PhysicsWorld } from './PhysicsWorld';

export const UNIT_TO_PX = 50;
const WALL_THICKNESS_PX = 200;

export function toMatter(p: Vec2): Vec2 {
  return { x: (p.x + BOX.width / 2) * UNIT_TO_PX, y: (BOX.height - p.y) * UNIT_TO_PX };
}

export function fromMatter(p: Vec2): Vec2 {
  return { x: p.x / UNIT_TO_PX - BOX.width / 2, y: BOX.height - p.y / UNIT_TO_PX };
}

// Matter の速度は px/step（1 step = 16.666 ms）。ユニット/秒へ換算する。
const STEP_MS = 1000 / 60;
function velocityFromMatter(v: Vec2): Vec2 {
  const perSec = 1000 / STEP_MS;
  return { x: (v.x / UNIT_TO_PX) * perSec, y: (-v.y / UNIT_TO_PX) * perSec };
}
function velocityToMatter(v: Vec2): Vec2 {
  const perStep = STEP_MS / 1000;
  return { x: v.x * UNIT_TO_PX * perStep, y: -v.y * UNIT_TO_PX * perStep };
}

interface Tracked {
  readonly id: BodyId;
  readonly tier: TierId;
  readonly body: Body;
}

export class MatterWorld implements PhysicsWorld {
  private readonly engine: Engine;
  private readonly tracked = new Map<BodyId, Tracked>();
  private readonly byMatterId = new Map<number, BodyId>();
  private pendingContacts: ContactPair[] = [];
  private nextId: BodyId = 1;

  constructor() {
    this.engine = Engine.create({ positionIterations: 8, velocityIterations: 6 });
    this.engine.gravity.y = 1;
    const w = BOX.width * UNIT_TO_PX;
    const h = BOX.height * UNIT_TO_PX;
    const t = WALL_THICKNESS_PX;
    const walls = [
      Bodies.rectangle(w / 2, h + t / 2, w + 2 * t, t, { isStatic: true, label: 'floor' }),
      Bodies.rectangle(-t / 2, h / 2 - t, t, h + 4 * t, { isStatic: true, label: 'wall' }),
      Bodies.rectangle(w + t / 2, h / 2 - t, t, h + 4 * t, { isStatic: true, label: 'wall' }),
    ];
    Composite.add(this.engine.world, walls);
    Events.on(this.engine, 'collisionStart', (ev: IEventCollision<Engine>) => {
      for (const pair of ev.pairs) {
        const a = this.byMatterId.get(pair.bodyA.id);
        const b = this.byMatterId.get(pair.bodyB.id);
        if (a !== undefined && b !== undefined) this.pendingContacts.push({ a, b });
      }
    });
  }

  addBody(tier: TierId, position: Vec2, velocity: Vec2 = { x: 0, y: 0 }, angle = 0): BodyId {
    const id = this.nextId++;
    const m = toMatter(position);
    const body = Bodies.circle(m.x, m.y, tierDef(tier).radius * UNIT_TO_PX, {
      restitution: 0.1,
      friction: 0.3,
      frictionStatic: 0.5,
      density: 0.002,
      label: `creature-${tier}`,
    });
    Body.setAngle(body, -angle);
    Body.setVelocity(body, velocityToMatter(velocity));
    Composite.add(this.engine.world, body);
    this.tracked.set(id, { id, tier, body });
    this.byMatterId.set(body.id, id);
    return id;
  }

  removeBody(id: BodyId): void {
    const t = this.tracked.get(id);
    if (t === undefined) return;
    Composite.remove(this.engine.world, t.body);
    this.tracked.delete(id);
    this.byMatterId.delete(t.body.id);
  }

  step(dtSec: number): readonly ContactPair[] {
    this.pendingContacts = [];
    Engine.update(this.engine, dtSec * 1000);
    return this.pendingContacts;
  }

  getBodies(): readonly BodyState[] {
    return [...this.tracked.values()].map((t) => this.toState(t));
  }

  getBody(id: BodyId): BodyState | undefined {
    const t = this.tracked.get(id);
    return t === undefined ? undefined : this.toState(t);
  }

  clear(): void {
    for (const id of [...this.tracked.keys()]) this.removeBody(id);
  }

  private toState(t: Tracked): BodyState {
    return {
      id: t.id,
      tier: t.tier,
      position: fromMatter(t.body.position),
      velocity: velocityFromMatter(t.body.velocity),
      angle: -t.body.angle,
    };
  }
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/physics/MatterWorld.test.ts && npx tsc --noEmit`
Expected: PASS（9 tests）。「falls and rests」が落ちる場合は `settle` の秒数ではなく `density`/`restitution` を疑う。壁テストが落ちる場合は `WALL_THICKNESS_PX` と壁の中心座標を確認。

- [ ] **Step 5: コミット**

```bash
git add src/physics
git commit -m "feat(physics): add Matter.js world adapter with unit coordinates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: レイアウト計画（LayoutPlanner）

**Files:**
- Create: `src/app/LayoutPlanner.ts`
- Test: `src/app/LayoutPlanner.test.ts`

**Interfaces:**
- Consumes: `BOX`
- Produces:

```ts
export type HudMode = 'top' | 'sides';
export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface LayoutPlan {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly hudMode: HudMode;
  readonly boardRect: Rect;          // 盤面表示域（CSS px、左上原点）
  readonly unitsPerPx: number;       // 1 CSS px が何ユニットか
}
export const BOARD_UNITS = { width: 12, height: 14, originX: -6, originY: -0.5 } as const; // 盤面表示域のユニット範囲
export function planLayout(width: number, height: number): LayoutPlan;
export function shouldApplyResize(width: number, height: number): boolean;
```

- [ ] **Step 1: 失敗するテストを書く**

`src/app/LayoutPlanner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOARD_UNITS, planLayout, shouldApplyResize } from './LayoutPlanner';

const ASPECTS: ReadonlyArray<readonly [number, number]> = [
  [360, 1280], // 9:32
  [360, 840], // 9:21
  [360, 640], // 9:16
  [600, 800], // 3:4
  [800, 800], // 1:1
  [800, 600], // 4:3
  [1280, 720], // 16:9
  [1680, 720], // 21:9
  [2560, 720], // 32:9
];

describe('planLayout', () => {
  it.each(ASPECTS)('fits the board inside a %ix%i viewport', (w, h) => {
    const plan = planLayout(w, h);
    const r = plan.boardRect;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(w + 0.001);
    expect(r.y + r.height).toBeLessThanOrEqual(h + 0.001);
    expect(r.width / r.height).toBeCloseTo(BOARD_UNITS.width / BOARD_UNITS.height, 3);
    expect(plan.unitsPerPx).toBeCloseTo(BOARD_UNITS.width / r.width, 6);
  });

  it('uses top HUD for portrait and sides for landscape', () => {
    expect(planLayout(360, 640).hudMode).toBe('top');
    expect(planLayout(800, 800).hudMode).toBe('top');
    expect(planLayout(1280, 720).hudMode).toBe('sides');
  });

  it('reserves 14% top band in portrait', () => {
    const plan = planLayout(360, 1000);
    expect(plan.boardRect.y).toBeGreaterThanOrEqual(140);
  });

  it('centers the board horizontally in portrait', () => {
    const r = planLayout(360, 1000).boardRect;
    expect(r.x + r.width / 2).toBeCloseTo(180, 3);
  });

  it('keeps the board out of the side bands in landscape', () => {
    const r = planLayout(1000, 500).boardRect;
    expect(r.x).toBeGreaterThanOrEqual(220);
    expect(r.x + r.width).toBeLessThanOrEqual(780);
  });
});

describe('shouldApplyResize', () => {
  it('rejects zero or negative sizes (hidden WebView)', () => {
    expect(shouldApplyResize(0, 0)).toBe(false);
    expect(shouldApplyResize(360, 0)).toBe(false);
    expect(shouldApplyResize(0, 640)).toBe(false);
  });
  it('accepts positive sizes', () => {
    expect(shouldApplyResize(1, 1)).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/LayoutPlanner.test.ts`
Expected: FAIL（`./LayoutPlanner` が見つからない）

- [ ] **Step 3: 実装**

`src/app/LayoutPlanner.ts`:

```ts
export type HudMode = 'top' | 'sides';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutPlan {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly hudMode: HudMode;
  readonly boardRect: Rect;
  readonly unitsPerPx: number;
}

// 箱（幅 10、高さ 13）の周りに左右 1、下 0.5、上 0.5 ユニットの余白を足した表示域。
export const BOARD_UNITS = { width: 12, height: 14, originX: -6, originY: -0.5 } as const;

const PORTRAIT_TOP_RATIO = 0.14;
const SQUARE_TOP_RATIO = 0.1;
const LANDSCAPE_SIDE_RATIO = 0.22;

function fitAspect(area: Rect, aspect: number): Rect {
  let width = area.width;
  let height = width / aspect;
  if (height > area.height) {
    height = area.height;
    width = height * aspect;
  }
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

export function planLayout(width: number, height: number): LayoutPlan {
  const ratio = height / width;
  let hudMode: HudMode;
  let area: Rect;
  if (ratio >= 1.2) {
    hudMode = 'top';
    const top = height * PORTRAIT_TOP_RATIO;
    area = { x: 0, y: top, width, height: height - top };
  } else if (width / height >= 1.2) {
    hudMode = 'sides';
    const side = width * LANDSCAPE_SIDE_RATIO;
    area = { x: side, y: 0, width: width - 2 * side, height };
  } else {
    hudMode = 'top';
    const top = height * SQUARE_TOP_RATIO;
    area = { x: 0, y: top, width, height: height - top };
  }
  const boardRect = fitAspect(area, BOARD_UNITS.width / BOARD_UNITS.height);
  return { viewport: { width, height }, hudMode, boardRect, unitsPerPx: BOARD_UNITS.width / boardRect.width };
}

export function shouldApplyResize(width: number, height: number): boolean {
  return width > 0 && height > 0;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/app/LayoutPlanner.test.ts`
Expected: PASS（15 tests）

- [ ] **Step 5: コミット**

```bash
git add src/app/LayoutPlanner.ts src/app/LayoutPlanner.test.ts
git commit -m "feat(app): add responsive layout planner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 多言語文言（i18n）

**Files:**
- Create: `src/ui/i18n.ts`
- Test: `src/ui/i18n.test.ts`

**Interfaces:**
- Produces: `Lang = 'ja' | 'en'`, `MessageKey = 'title' | 'score' | 'best' | 'next' | 'gameOver' | 'playAgain' | 'webglUnsupported'`, `resolveLang(tag: string | null): Lang`, `t(lang: Lang, key: MessageKey): string`, `creatureName(lang: Lang, tier: TierId): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/ui/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { creatureName, resolveLang, t } from './i18n';

describe('resolveLang', () => {
  it('maps ja-* to ja', () => {
    expect(resolveLang('ja')).toBe('ja');
    expect(resolveLang('ja-JP')).toBe('ja');
    expect(resolveLang('JA-jp')).toBe('ja');
  });
  it('falls back to en', () => {
    expect(resolveLang('en-US')).toBe('en');
    expect(resolveLang('es-419')).toBe('en');
    expect(resolveLang('')).toBe('en');
    expect(resolveLang(null)).toBe('en');
    expect(resolveLang('japanese')).toBe('en');
  });
});

describe('t', () => {
  it('returns Japanese and English strings', () => {
    expect(t('ja', 'playAgain')).toBe('もう一度');
    expect(t('en', 'playAgain')).toBe('Play again');
    expect(t('en', 'title')).toBe('Ocean Merge');
    expect(t('ja', 'title')).toBe('オーシャンマージ');
  });
  it('has every key in both languages', () => {
    const keys = ['title', 'score', 'best', 'next', 'gameOver', 'playAgain', 'webglUnsupported'] as const;
    for (const k of keys) {
      expect(t('ja', k).length).toBeGreaterThan(0);
      expect(t('en', k).length).toBeGreaterThan(0);
    }
  });
});

describe('creatureName', () => {
  it('uses the tier table', () => {
    expect(creatureName('ja', 10)).toBe('クジラ');
    expect(creatureName('en', 10)).toBe('Whale');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/ui/i18n.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/ui/i18n.ts`:

```ts
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';

export type Lang = 'ja' | 'en';

export type MessageKey = 'title' | 'score' | 'best' | 'next' | 'gameOver' | 'playAgain' | 'webglUnsupported';

const MESSAGES: Readonly<Record<Lang, Readonly<Record<MessageKey, string>>>> = {
  ja: {
    title: 'オーシャンマージ',
    score: 'スコア',
    best: 'ベスト',
    next: 'つぎ',
    gameOver: 'ゲームオーバー',
    playAgain: 'もう一度',
    webglUnsupported: 'この端末では WebGL が使えないため、ゲームを表示できません。',
  },
  en: {
    title: 'Ocean Merge',
    score: 'Score',
    best: 'Best',
    next: 'Next',
    gameOver: 'Game Over',
    playAgain: 'Play again',
    webglUnsupported: 'WebGL is not available on this device, so the game cannot be displayed.',
  },
};

export function resolveLang(tag: string | null): Lang {
  if (tag === null) return 'en';
  const lower = tag.toLowerCase();
  return lower === 'ja' || lower.startsWith('ja-') ? 'ja' : 'en';
}

export function t(lang: Lang, key: MessageKey): string {
  return MESSAGES[lang][key];
}

export function creatureName(lang: Lang, tier: TierId): string {
  const def = tierDef(tier);
  return lang === 'ja' ? def.nameJa : def.nameEn;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/ui/i18n.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: コミット**

```bash
git add src/ui/i18n.ts src/ui/i18n.test.ts
git commit -m "feat(ui): add ja/en messages and language resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Playables ポート（SDK 抽象化とローカル実装）

**Files:**
- Create: `src/playables/PlayablesPort.ts`, `src/playables/withTimeout.ts`, `src/playables/LocalAdapter.ts`, `src/playables/YtgameAdapter.ts`, `src/playables/createPort.ts`
- Test: `src/playables/withTimeout.test.ts`, `src/playables/LocalAdapter.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PlayablesPort {
  readonly inPlayablesEnv: boolean;
  firstFrameReady(): void;
  gameReady(): void;
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
  sendScore(value: number): Promise<void>;
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  getLanguage(): Promise<string>;
  logError(): void;
  logWarning(): void;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export class LocalAdapter implements PlayablesPort { constructor(storage: StorageLike); static readonly KEY = 'ocean-merge-save'; }
export class YtgameAdapter implements PlayablesPort {}
export function createPort(): PlayablesPort;
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T>;
```

- [ ] **Step 1: 失敗するテストを書く**

`src/playables/withTimeout.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  it('resolves with the inner value when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, () => 'late')).resolves.toBe('ok');
  });

  it('falls back when the inner promise never settles', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const p = withTimeout(never, 1000, () => 'fallback');
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBe('fallback');
    vi.useRealTimers();
  });

  it('propagates rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 50, () => 'late')).rejects.toThrow('x');
  });
});
```

`src/playables/LocalAdapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LocalAdapter } from './LocalAdapter';
import type { StorageLike } from './PlayablesPort';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('LocalAdapter', () => {
  it('is not the playables env', () => {
    expect(new LocalAdapter(memoryStorage()).inPlayablesEnv).toBe(false);
  });

  it('loads empty string when nothing is stored', async () => {
    await expect(new LocalAdapter(memoryStorage()).loadData()).resolves.toBe('');
  });

  it('saves and loads through the storage', async () => {
    const storage = memoryStorage();
    const port = new LocalAdapter(storage);
    await port.saveData('{"v":1}');
    expect(storage.map.get(LocalAdapter.KEY)).toBe('{"v":1}');
    await expect(port.loadData()).resolves.toBe('{"v":1}');
  });

  it('reports audio enabled and ja language', async () => {
    const port = new LocalAdapter(memoryStorage());
    expect(port.isAudioEnabled()).toBe(true);
    await expect(port.getLanguage()).resolves.toBe('ja');
  });

  it('lifecycle hooks return unsubscribe functions and never throw', () => {
    const port = new LocalAdapter(memoryStorage());
    expect(typeof port.onPause(() => {})).toBe('function');
    expect(typeof port.onResume(() => {})).toBe('function');
    expect(typeof port.onAudioEnabledChange(() => {})).toBe('function');
    expect(() => {
      port.firstFrameReady();
      port.gameReady();
      port.logError();
      port.logWarning();
    }).not.toThrow();
  });

  it('sendScore resolves', async () => {
    await expect(new LocalAdapter(memoryStorage()).sendScore(10)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/playables`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装**

`src/playables/PlayablesPort.ts`:

```ts
export interface PlayablesPort {
  readonly inPlayablesEnv: boolean;
  firstFrameReady(): void;
  gameReady(): void;
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
  sendScore(value: number): Promise<void>;
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  getLanguage(): Promise<string>;
  logError(): void;
  logWarning(): void;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
```

`src/playables/withTimeout.ts`:

```ts
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
```

`src/playables/LocalAdapter.ts`（開発時のみ。本番では使われない）:

```ts
import type { PlayablesPort, StorageLike } from './PlayablesPort';

export class LocalAdapter implements PlayablesPort {
  static readonly KEY = 'ocean-merge-save';
  readonly inPlayablesEnv = false;

  constructor(private readonly storage: StorageLike) {}

  firstFrameReady(): void {}
  gameReady(): void {}

  loadData(): Promise<string> {
    return Promise.resolve(this.storage.getItem(LocalAdapter.KEY) ?? '');
  }

  saveData(data: string): Promise<void> {
    this.storage.setItem(LocalAdapter.KEY, data);
    return Promise.resolve();
  }

  sendScore(): Promise<void> {
    return Promise.resolve();
  }

  isAudioEnabled(): boolean {
    return true;
  }

  onAudioEnabledChange(): () => void {
    return () => {};
  }

  onPause(): () => void {
    return () => {};
  }

  onResume(): () => void {
    return () => {};
  }

  getLanguage(): Promise<string> {
    return Promise.resolve('ja');
  }

  logError(): void {}
  logWarning(): void {}
}
```

`src/playables/YtgameAdapter.ts`（`ytgame` は `src/types/ytgame.d.ts` のグローバル）:

```ts
import type { PlayablesPort } from './PlayablesPort';

export class YtgameAdapter implements PlayablesPort {
  readonly inPlayablesEnv = true;

  firstFrameReady(): void {
    ytgame.game.firstFrameReady();
  }

  gameReady(): void {
    ytgame.game.gameReady();
  }

  loadData(): Promise<string> {
    return ytgame.game.loadData();
  }

  saveData(data: string): Promise<void> {
    return ytgame.game.saveData(data);
  }

  sendScore(value: number): Promise<void> {
    return ytgame.engagement.sendScore({ value: Math.floor(value) });
  }

  isAudioEnabled(): boolean {
    return ytgame.system.isAudioEnabled();
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    return ytgame.system.onAudioEnabledChange(cb);
  }

  onPause(cb: () => void): () => void {
    return ytgame.system.onPause(cb);
  }

  onResume(cb: () => void): () => void {
    return ytgame.system.onResume(cb);
  }

  getLanguage(): Promise<string> {
    return ytgame.system.getLanguage();
  }

  logError(): void {
    ytgame.health.logError();
  }

  logWarning(): void {
    ytgame.health.logWarning();
  }
}
```

`src/playables/createPort.ts`（`typeof ytgame` ガードはこのファイルだけ）:

```ts
import { LocalAdapter } from './LocalAdapter';
import type { PlayablesPort } from './PlayablesPort';
import { YtgameAdapter } from './YtgameAdapter';

export function createPort(): PlayablesPort {
  const inPlayables = typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV;
  if (inPlayables) return new YtgameAdapter();
  return new LocalAdapter(window.localStorage);
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/playables && npx tsc --noEmit`
Expected: PASS（9 tests）。`ytgame` が未定義と tsc に言われたら `tsconfig.json` の `include` に `src` が入っていて `src/types/ytgame.d.ts` が読まれているか確認。

- [ ] **Step 5: コミット**

```bash
git add src/playables
git commit -m "feat(playables): abstract the Playables SDK behind a port

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 効果音の合成（SfxSynth）

**Files:**
- Create: `src/audio/SfxSynth.ts`

**Interfaces:**
- Produces: `class SfxSynth { constructor(); setEnabled(enabled: boolean): void; unlock(): void; suspend(): void; resume(): void; playDrop(): void; playMerge(tier: TierId): void; playGameOver(): void; }`

単体テストは置かない（Web Audio は node にない）。Task 14 の手動確認で検証する。

- [ ] **Step 1: 実装**

`src/audio/SfxSynth.ts`:

```ts
import type { TierId } from '../core/types';

export class SfxSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  private ensure(): { ctx: AudioContext; master: GainNode } | null {
    if (this.ctx !== null && this.master !== null) return { ctx: this.ctx, master: this.master };
    if (typeof AudioContext === 'undefined') return null;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 1 : 0;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return { ctx, master };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master !== null) this.master.gain.value = enabled ? 1 : 0;
  }

  // 最初のユーザー操作で呼ぶ。自動再生制限で suspended のときに再開する。
  unlock(): void {
    const a = this.ensure();
    if (a !== null && a.ctx.state === 'suspended') void a.ctx.resume();
  }

  suspend(): void {
    if (this.ctx !== null && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx !== null && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  playDrop(): void {
    const a = this.ensure();
    if (a === null) return;
    const { ctx, master } = a;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  playMerge(tier: TierId): void {
    const a = this.ensure();
    if (a === null) return;
    const { ctx, master } = a;
    const base = 330 * Math.pow(1.12, tier);
    const now = ctx.currentTime;
    [0, 0.06, 0.12].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * [1, 1.25, 1.5][i]!;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);
      osc.connect(gain).connect(master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
  }

  playGameOver(): void {
    const a = this.ensure();
    if (a === null) return;
    const { ctx, master } = a;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 1.0);
  }
}
```

- [ ] **Step 2: 型検査**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/audio/SfxSynth.ts
git commit -m "feat(audio): synthesize drop, merge and game-over sounds

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 描画（three.js メッシュ生成・シーン・エフェクト）

**Files:**
- Create: `src/render/CreatureMeshFactory.ts`, `src/render/SceneRenderer.ts`, `src/render/Effects.ts`
- Test: `src/render/CreatureMeshFactory.test.ts`

**Interfaces:**
- Consumes: `TierId`, `BodyState`, `BodyId`, `Vec2`, `tierDef`, `TIERS`, `BOX`, `LayoutPlan`, `BOARD_UNITS`
- Produces:

```ts
// CreatureMeshFactory.ts
export class CreatureMeshFactory {
  createCreature(tier: TierId): Group;          // name 'body' の Mesh（SphereGeometry 半径 = tier 半径）を含む
  createGhost(tier: TierId): Group;             // 半透明の狙い表示
  dispose(): void;
}
// SceneRenderer.ts
export class SceneRenderer {
  static tryCreate(canvas: HTMLCanvasElement): SceneRenderer | null;   // WebGL 不可なら null
  applyLayout(plan: LayoutPlan, devicePixelRatio: number): void;
  syncBodies(bodies: readonly BodyState[]): void;
  setAim(tier: TierId | null, x: number): void;                        // null で非表示
  spawnMergeEffect(position: Vec2, tier: TierId): void;
  render(dtSec: number): void;
  clientToUnit(clientX: number, clientY: number): Vec2;
  dispose(): void;
}
// Effects.ts
export class Effects { constructor(scene: Scene); burst(position: Vec2, radius: number, color: number): void; update(dtSec: number): void; }
```

- [ ] **Step 1: 失敗するテストを書く**

`src/render/CreatureMeshFactory.test.ts`:

```ts
import { Box3, Mesh, SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TIERS, tierDef } from '../core/tiers';
import { CreatureMeshFactory } from './CreatureMeshFactory';

describe('CreatureMeshFactory', () => {
  const factory = new CreatureMeshFactory();

  it.each(TIERS.map((t) => [t.id] as const))('tier %i has a body sphere with the tier radius', (id) => {
    const group = factory.createCreature(id);
    const body = group.getObjectByName('body');
    expect(body).toBeInstanceOf(Mesh);
    const geom = (body as Mesh).geometry;
    expect(geom).toBeInstanceOf(SphereGeometry);
    expect((geom as SphereGeometry).parameters.radius).toBeCloseTo(tierDef(id).radius);
  });

  it.each(TIERS.map((t) => [t.id] as const))('tier %i stays within 1.6x the physics radius', (id) => {
    const group = factory.createCreature(id);
    const size = new Box3().setFromObject(group).getSize(new Vector3());
    const limit = tierDef(id).radius * 2 * 1.6;
    expect(size.x).toBeLessThanOrEqual(limit);
    expect(size.y).toBeLessThanOrEqual(limit);
  });

  it('has two eyes on every creature', () => {
    for (const t of TIERS) {
      const eyes = factory.createCreature(t.id).children.filter((c) => c.name === 'eye');
      expect(eyes).toHaveLength(2);
    }
  });

  it('ghost is translucent', () => {
    const ghost = factory.createGhost(3);
    const body = ghost.getObjectByName('body') as Mesh;
    const mat = body.material;
    expect(Array.isArray(mat)).toBe(false);
    if (!Array.isArray(mat)) {
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBeLessThan(1);
    }
  });

  it('shares geometry between creatures of the same tier', () => {
    const a = factory.createCreature(2).getObjectByName('body') as Mesh;
    const b = factory.createCreature(2).getObjectByName('body') as Mesh;
    expect(a.geometry).toBe(b.geometry);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/render/CreatureMeshFactory.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: メッシュ生成を実装**

`src/render/CreatureMeshFactory.ts`:

```ts
import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshToonMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { CreatureShape, TierDef } from '../core/tiers';
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';

interface Part {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

const EYE_COLOR = 0x1b1b2f;

function eyes(r: number): Part[] {
  const er = r * 0.12;
  return [
    { name: 'eye', geometry: new SphereGeometry(er, 12, 12), color: EYE_COLOR, position: [-r * 0.35, r * 0.25, r * 0.85] },
    { name: 'eye', geometry: new SphereGeometry(er, 12, 12), color: EYE_COLOR, position: [r * 0.35, r * 0.25, r * 0.85] },
  ];
}

function appendages(shape: CreatureShape, def: TierDef): Part[] {
  const r = def.radius;
  const c = def.accentColor;
  switch (shape) {
    case 'plankton':
      return [{ name: 'spike', geometry: new TorusGeometry(r * 0.9, r * 0.06, 8, 24), color: c, position: [0, 0, 0] }];
    case 'seaAngel':
      return [
        { name: 'wing', geometry: new ConeGeometry(r * 0.35, r * 0.9, 12), color: c, position: [-r * 0.9, 0, 0], rotation: [0, 0, Math.PI / 2] },
        { name: 'wing', geometry: new ConeGeometry(r * 0.35, r * 0.9, 12), color: c, position: [r * 0.9, 0, 0], rotation: [0, 0, -Math.PI / 2] },
      ];
    case 'jellyfish':
      return [-0.5, -0.17, 0.17, 0.5].map((k) => ({
        name: 'tentacle',
        geometry: new CylinderGeometry(r * 0.07, r * 0.04, r * 0.9, 8),
        color: c,
        position: [r * k, -r * 0.95, 0] as const,
      }));
    case 'pufferfish':
      return [
        { name: 'fin', geometry: new ConeGeometry(r * 0.3, r * 0.5, 10), color: c, position: [r * 1.05, 0, 0], rotation: [0, 0, -Math.PI / 2] },
        { name: 'fin', geometry: new ConeGeometry(r * 0.25, r * 0.4, 10), color: c, position: [0, r * 1.05, 0] },
      ];
    case 'crab':
      return [
        { name: 'claw', geometry: new SphereGeometry(r * 0.35, 12, 12), color: c, position: [-r * 1.05, r * 0.3, 0] },
        { name: 'claw', geometry: new SphereGeometry(r * 0.35, 12, 12), color: c, position: [r * 1.05, r * 0.3, 0] },
      ];
    case 'octopus':
      return [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75].map((k) => ({
        name: 'tentacle',
        geometry: new CylinderGeometry(r * 0.09, r * 0.05, r * 0.8, 8),
        color: c,
        position: [r * k, -r * 0.95, 0] as const,
      }));
    case 'penguin':
      return [
        { name: 'belly', geometry: new SphereGeometry(r * 0.72, 20, 20), color: c, position: [0, -r * 0.1, r * 0.35] },
        { name: 'beak', geometry: new ConeGeometry(r * 0.15, r * 0.35, 10), color: 0xf5a623, position: [0, r * 0.05, r * 1.0], rotation: [Math.PI / 2, 0, 0] },
      ];
    case 'seal':
      return [
        { name: 'flipper', geometry: new ConeGeometry(r * 0.3, r * 0.7, 10), color: c, position: [-r * 1.0, -r * 0.4, 0], rotation: [0, 0, Math.PI / 2.4] },
        { name: 'flipper', geometry: new ConeGeometry(r * 0.3, r * 0.7, 10), color: c, position: [r * 1.0, -r * 0.4, 0], rotation: [0, 0, -Math.PI / 2.4] },
        { name: 'nose', geometry: new SphereGeometry(r * 0.12, 10, 10), color: EYE_COLOR, position: [0, -r * 0.05, r * 0.98] },
      ];
    case 'dolphin':
      return [
        { name: 'fin', geometry: new ConeGeometry(r * 0.3, r * 0.6, 10), color: c, position: [0, r * 1.05, 0] },
        { name: 'snout', geometry: new ConeGeometry(r * 0.3, r * 0.6, 12), color: c, position: [r * 1.05, -r * 0.1, 0], rotation: [0, 0, -Math.PI / 2] },
      ];
    case 'shark':
      return [
        { name: 'fin', geometry: new ConeGeometry(r * 0.4, r * 0.7, 4), color: c, position: [0, r * 1.05, 0] },
        { name: 'tail', geometry: new ConeGeometry(r * 0.35, r * 0.6, 4), color: c, position: [-r * 1.1, 0, 0], rotation: [0, 0, Math.PI / 2] },
        { name: 'snout', geometry: new ConeGeometry(r * 0.35, r * 0.5, 12), color: c, position: [r * 1.05, -r * 0.1, 0], rotation: [0, 0, -Math.PI / 2] },
      ];
    case 'whale':
      return [
        { name: 'tail', geometry: new ConeGeometry(r * 0.45, r * 0.6, 4), color: c, position: [-r * 1.1, r * 0.1, 0], rotation: [0, 0, Math.PI / 2] },
        { name: 'belly', geometry: new SphereGeometry(r * 0.8, 20, 20), color: 0xdfe9f5, position: [0, -r * 0.25, r * 0.3] },
        { name: 'spout', geometry: new CylinderGeometry(r * 0.05, r * 0.12, r * 0.5, 8), color: 0xbfe6ff, position: [r * 0.2, r * 1.15, 0] },
      ];
  }
}

export class CreatureMeshFactory {
  private readonly bodyGeometries = new Map<TierId, SphereGeometry>();
  private readonly materials = new Map<number, MeshToonMaterial>();
  private readonly ghostMaterials = new Map<number, MeshToonMaterial>();

  private bodyGeometry(tier: TierId): SphereGeometry {
    let g = this.bodyGeometries.get(tier);
    if (g === undefined) {
      g = new SphereGeometry(tierDef(tier).radius, 32, 24);
      this.bodyGeometries.set(tier, g);
    }
    return g;
  }

  private material(color: number, ghost: boolean): MeshToonMaterial {
    const cache = ghost ? this.ghostMaterials : this.materials;
    let m = cache.get(color);
    if (m === undefined) {
      m = ghost
        ? new MeshToonMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })
        : new MeshToonMaterial({ color });
      cache.set(color, m);
    }
    return m;
  }

  private build(tier: TierId, ghost: boolean): Group {
    const def = tierDef(tier);
    const group = new Group();
    const body = new Mesh(this.bodyGeometry(tier), this.material(def.baseColor, ghost));
    body.name = 'body';
    group.add(body);
    const parts = ghost ? [] : [...appendages(def.shape, def), ...eyes(def.radius)];
    for (const p of parts) {
      const mesh = new Mesh(p.geometry, this.material(p.color, ghost));
      mesh.name = p.name;
      mesh.position.set(p.position[0], p.position[1], p.position[2]);
      if (p.rotation !== undefined) mesh.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
      group.add(mesh);
    }
    return group;
  }

  createCreature(tier: TierId): Group {
    return this.build(tier, false);
  }

  createGhost(tier: TierId): Group {
    return this.build(tier, true);
  }

  dispose(): void {
    for (const g of this.bodyGeometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const m of this.ghostMaterials.values()) m.dispose();
    this.bodyGeometries.clear();
    this.materials.clear();
    this.ghostMaterials.clear();
  }
}
```

付属パーツのジオメトリは生成ごとに作られるが、物体数は最大でも百数十で寿命が短いため許容する。`dispose` でメモリリークがないことは Task 16 の長時間プレイ確認で見る。

- [ ] **Step 4: メッシュ生成のテストが通ることを確認**

Run: `npx vitest run src/render/CreatureMeshFactory.test.ts`
Expected: PASS（25 tests）。「1.6x」テストが落ちたティアは付属パーツの `position` を内側に寄せる。

- [ ] **Step 5: エフェクトを実装**

`src/render/Effects.ts`:

```ts
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, Scene } from 'three';
import type { Vec2 } from '../core/types';

interface Burst {
  readonly points: Points;
  readonly velocities: Float32Array;
  life: number;
}

const BURST_LIFE = 0.4;
const BURST_COUNT = 18;

export class Effects {
  private readonly bursts: Burst[] = [];

  constructor(private readonly scene: Scene) {}

  burst(position: Vec2, radius: number, color: number): void {
    const positions = new Float32Array(BURST_COUNT * 3);
    const velocities = new Float32Array(BURST_COUNT * 3);
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (i / BURST_COUNT) * Math.PI * 2;
      const speed = radius * (2 + Math.random() * 2);
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = 0.5;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = Math.sin(angle) * speed + radius * 1.5;
      velocities[i * 3 + 2] = 0;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({ color, size: radius * 0.25, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    const points = new Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: BURST_LIFE });
  }

  update(dtSec: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.life -= dtSec;
      const attr = b.points.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] = arr[j]! + b.velocities[j]! * dtSec;
        arr[j + 1] = arr[j + 1]! + b.velocities[j + 1]! * dtSec;
      }
      attr.needsUpdate = true;
      const mat = b.points.material as PointsMaterial;
      mat.opacity = Math.max(0, b.life / BURST_LIFE);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        mat.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}
```

- [ ] **Step 6: シーンレンダラーを実装**

`src/render/SceneRenderer.ts`:

```ts
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import type { LayoutPlan } from '../app/LayoutPlanner';
import { BOARD_UNITS } from '../app/LayoutPlanner';
import { BOX, tierDef } from '../core/tiers';
import type { BodyId, BodyState, TierId, Vec2 } from '../core/types';
import { CreatureMeshFactory } from './CreatureMeshFactory';
import { Effects } from './Effects';

const WALL_COLOR = 0x9fd3ff;
const DANGER_COLOR = 0xff6b6b;

export class SceneRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly factory = new CreatureMeshFactory();
  private readonly effects: Effects;
  private readonly meshes = new Map<BodyId, Group>();
  private ghost: Group | null = null;
  private ghostTier: TierId | null = null;
  private readonly aimLine: Mesh;
  private plan: LayoutPlan | null = null;

  static tryCreate(canvas: HTMLCanvasElement): SceneRenderer | null {
    try {
      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      return new SceneRenderer(renderer);
    } catch {
      return null;
    }
  }

  private constructor(private readonly renderer: WebGLRenderer) {
    this.renderer.setClearColor(new Color(0x06203a));
    this.camera.position.set(0, 0, 50);
    this.camera.lookAt(0, 0, 0);
    this.effects = new Effects(this.scene);

    const hemi = new HemisphereLight(0xcfeeff, 0x0a2a4a, 1.1);
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 10, 12);
    this.scene.add(hemi, sun);

    const wallMat = new MeshStandardMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.22, roughness: 0.2 });
    const thickness = 0.3;
    const floor = new Mesh(new BoxGeometry(BOX.width + thickness * 2, thickness, 3), wallMat);
    floor.position.set(0, -thickness / 2, 0);
    const left = new Mesh(new BoxGeometry(thickness, BOX.height, 3), wallMat);
    left.position.set(-BOX.width / 2 - thickness / 2, BOX.height / 2, 0);
    const right = new Mesh(new BoxGeometry(thickness, BOX.height, 3), wallMat);
    right.position.set(BOX.width / 2 + thickness / 2, BOX.height / 2, 0);
    this.scene.add(floor, left, right);

    const danger = new Mesh(new PlaneGeometry(BOX.width, 0.06), new MeshBasicMaterial({ color: DANGER_COLOR, transparent: true, opacity: 0.7 }));
    danger.position.set(0, BOX.dangerY, -1);
    this.scene.add(danger);

    this.aimLine = new Mesh(new PlaneGeometry(0.04, BOX.height), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
    this.aimLine.position.set(0, BOX.height / 2, -1.5);
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    const backdrop = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: 0x0b3558 }));
    backdrop.position.set(0, BOX.height / 2, -20);
    this.scene.add(backdrop);
  }

  applyLayout(plan: LayoutPlan, devicePixelRatio: number): void {
    this.plan = plan;
    const { width, height } = plan.viewport;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    const upp = plan.unitsPerPx;
    const boardCenterX = BOARD_UNITS.originX + BOARD_UNITS.width / 2;
    const boardCenterY = BOARD_UNITS.originY + BOARD_UNITS.height / 2;
    const boardPxCx = plan.boardRect.x + plan.boardRect.width / 2;
    const boardPxCy = plan.boardRect.y + plan.boardRect.height / 2;
    const camCx = boardCenterX + (width / 2 - boardPxCx) * upp;
    const camCy = boardCenterY - (height / 2 - boardPxCy) * upp;
    const halfW = (width / 2) * upp;
    const halfH = (height / 2) * upp;
    this.camera.left = camCx - halfW;
    this.camera.right = camCx + halfW;
    this.camera.top = camCy + halfH;
    this.camera.bottom = camCy - halfH;
    this.camera.updateProjectionMatrix();
  }

  clientToUnit(clientX: number, clientY: number): Vec2 {
    const x = this.camera.left + (clientX / (this.plan?.viewport.width ?? 1)) * (this.camera.right - this.camera.left);
    const y = this.camera.top - (clientY / (this.plan?.viewport.height ?? 1)) * (this.camera.top - this.camera.bottom);
    return { x, y };
  }

  syncBodies(bodies: readonly BodyState[]): void {
    const alive = new Set<BodyId>();
    for (const b of bodies) {
      alive.add(b.id);
      let g = this.meshes.get(b.id);
      if (g === undefined) {
        g = this.factory.createCreature(b.tier);
        this.meshes.set(b.id, g);
        this.scene.add(g);
      }
      g.position.set(b.position.x, b.position.y, 0);
      g.rotation.z = b.angle;
    }
    for (const [id, g] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(g);
        this.meshes.delete(id);
      }
    }
  }

  setAim(tier: TierId | null, x: number): void {
    if (tier === null) {
      if (this.ghost !== null) this.ghost.visible = false;
      this.aimLine.visible = false;
      return;
    }
    if (this.ghost === null || this.ghostTier !== tier) {
      if (this.ghost !== null) this.scene.remove(this.ghost);
      this.ghost = this.factory.createGhost(tier);
      this.ghostTier = tier;
      this.scene.add(this.ghost);
    }
    this.ghost.visible = true;
    this.ghost.position.set(x, BOX.spawnY, 0);
    this.aimLine.visible = true;
    this.aimLine.position.x = x;
  }

  spawnMergeEffect(position: Vec2, tier: TierId): void {
    const def = tierDef(tier);
    this.effects.burst(position, def.radius, def.accentColor);
  }

  render(dtSec: number): void {
    this.effects.update(dtSec);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.factory.dispose();
    this.renderer.dispose();
  }
}
```

- [ ] **Step 7: 型検査**

Run: `npx tsc --noEmit && npx vitest run src/render`
Expected: エラーなし、PASS

- [ ] **Step 8: コミット**

```bash
git add src/render
git commit -m "feat(render): add procedural sea creatures, scene and merge effects

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: 入力の変換（InputController）

**Files:**
- Create: `src/app/InputController.ts`
- Test: `src/app/InputController.test.ts`

**Interfaces:**
- Produces:

```ts
export type GameInput =
  | { readonly type: 'aim'; readonly clientX: number; readonly clientY: number }
  | { readonly type: 'drop' }
  | { readonly type: 'nudge'; readonly direction: -1 | 1 }
  | { readonly type: 'restart' };
export function mapKeyEvent(key: string, repeat: boolean): GameInput | null;
export interface PointerLike { readonly clientX: number; readonly clientY: number; readonly button?: number }
export function mapPointerDown(e: PointerLike): GameInput | null;   // 左ボタンのみ aim
export function mapPointerMove(e: PointerLike, pressed: boolean): GameInput | null; // マウスは常時、タッチは押下中のみ aim
export function mapPointerUp(e: PointerLike, pressed: boolean): readonly GameInput[]; // aim → drop
export class InputController {
  constructor(target: HTMLElement, onInput: (input: GameInput) => void, onFirstInteraction: () => void);
  dispose(): void;
}
```

- [ ] **Step 1: 失敗するテストを書く**

`src/app/InputController.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapKeyEvent, mapPointerDown, mapPointerMove, mapPointerUp } from './InputController';

describe('mapKeyEvent', () => {
  it('maps arrows to nudges and allows repeat for movement', () => {
    expect(mapKeyEvent('ArrowLeft', false)).toEqual({ type: 'nudge', direction: -1 });
    expect(mapKeyEvent('ArrowRight', true)).toEqual({ type: 'nudge', direction: 1 });
  });

  it('maps Space and ArrowDown to drop but ignores key auto-repeat', () => {
    expect(mapKeyEvent(' ', false)).toEqual({ type: 'drop' });
    expect(mapKeyEvent('ArrowDown', false)).toEqual({ type: 'drop' });
    expect(mapKeyEvent(' ', true)).toBeNull();
    expect(mapKeyEvent('ArrowDown', true)).toBeNull();
  });

  it('maps Enter to restart and ignores Escape and others', () => {
    expect(mapKeyEvent('Enter', false)).toEqual({ type: 'restart' });
    expect(mapKeyEvent('Escape', false)).toBeNull();
    expect(mapKeyEvent('a', false)).toBeNull();
  });
});

describe('pointer mapping', () => {
  it('pointerdown with the primary button aims', () => {
    expect(mapPointerDown({ clientX: 10, clientY: 20, button: 0 })).toEqual({ type: 'aim', clientX: 10, clientY: 20 });
    expect(mapPointerDown({ clientX: 10, clientY: 20, button: 2 })).toBeNull();
  });

  it('pointermove aims while pressed or for hover (mouse)', () => {
    expect(mapPointerMove({ clientX: 1, clientY: 2 }, true)).toEqual({ type: 'aim', clientX: 1, clientY: 2 });
    expect(mapPointerMove({ clientX: 1, clientY: 2 }, false)).toEqual({ type: 'aim', clientX: 1, clientY: 2 });
  });

  it('pointerup after a press aims to the release point then drops', () => {
    expect(mapPointerUp({ clientX: 5, clientY: 6 }, true)).toEqual([{ type: 'aim', clientX: 5, clientY: 6 }, { type: 'drop' }]);
  });

  it('pointerup without a press does nothing', () => {
    expect(mapPointerUp({ clientX: 5, clientY: 6 }, false)).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/InputController.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/app/InputController.ts`:

```ts
export type GameInput =
  | { readonly type: 'aim'; readonly clientX: number; readonly clientY: number }
  | { readonly type: 'drop' }
  | { readonly type: 'nudge'; readonly direction: -1 | 1 }
  | { readonly type: 'restart' };

export interface PointerLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly button?: number;
}

export function mapKeyEvent(key: string, repeat: boolean): GameInput | null {
  switch (key) {
    case 'ArrowLeft':
      return { type: 'nudge', direction: -1 };
    case 'ArrowRight':
      return { type: 'nudge', direction: 1 };
    case ' ':
    case 'ArrowDown':
      return repeat ? null : { type: 'drop' };
    case 'Enter':
      return repeat ? null : { type: 'restart' };
    default:
      return null;
  }
}

export function mapPointerDown(e: PointerLike): GameInput | null {
  if (e.button !== undefined && e.button !== 0) return null;
  return { type: 'aim', clientX: e.clientX, clientY: e.clientY };
}

export function mapPointerMove(e: PointerLike, _pressed: boolean): GameInput | null {
  return { type: 'aim', clientX: e.clientX, clientY: e.clientY };
}

export function mapPointerUp(e: PointerLike, pressed: boolean): readonly GameInput[] {
  if (!pressed) return [];
  return [{ type: 'aim', clientX: e.clientX, clientY: e.clientY }, { type: 'drop' }];
}

// Esc には何も割り当てず、preventDefault も呼ばない（Playables の MUST NOT）。
export class InputController {
  private pressed = false;
  private interacted = false;
  private readonly abort = new AbortController();

  constructor(
    private readonly target: HTMLElement,
    private readonly onInput: (input: GameInput) => void,
    private readonly onFirstInteraction: () => void,
  ) {
    const { signal } = this.abort;
    target.addEventListener(
      'pointerdown',
      (e) => {
        this.markInteracted();
        const input = mapPointerDown(e);
        if (input === null) return;
        this.pressed = true;
        target.setPointerCapture(e.pointerId);
        this.onInput(input);
      },
      { signal },
    );
    target.addEventListener(
      'pointermove',
      (e) => {
        const input = mapPointerMove(e, this.pressed);
        if (input !== null) this.onInput(input);
      },
      { signal },
    );
    const release = (e: PointerEvent): void => {
      const inputs = mapPointerUp(e, this.pressed);
      this.pressed = false;
      for (const i of inputs) this.onInput(i);
    };
    target.addEventListener('pointerup', release, { signal });
    target.addEventListener('pointercancel', () => (this.pressed = false), { signal });
    window.addEventListener(
      'keydown',
      (e) => {
        const input = mapKeyEvent(e.key, e.repeat);
        if (input === null) return;
        this.markInteracted();
        if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
        this.onInput(input);
      },
      { signal },
    );
  }

  private markInteracted(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onFirstInteraction();
  }

  dispose(): void {
    this.abort.abort();
  }
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/app/InputController.test.ts && npx tsc --noEmit`
Expected: PASS（7 tests）

- [ ] **Step 5: コミット**

```bash
git add src/app/InputController.ts src/app/InputController.test.ts
git commit -m "feat(app): map pointer and keyboard events to game inputs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: ゲーム本体（固定ステップ、状態機械、セーブ連携）

**Files:**
- Create: `src/app/loop.ts`, `src/app/Game.ts`
- Test: `src/app/loop.test.ts`, `src/app/Game.test.ts`

**Interfaces:**
- Consumes: `PhysicsWorld`, `resolveMerges`, `evaluateGameOver`, `clampAimX`, `Rng`, `nextDropTier`, `SaveData`, `createEmptySave`, `BOX`, `tierDef`
- Produces:

```ts
// loop.ts
export const FIXED_STEP_SEC = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;
export function advanceAccumulator(accumulatorSec: number, dtSec: number, step?: number, maxSteps?: number): { steps: number; accumulatorSec: number };

// Game.ts
export interface GamePresenter {            // Game が外界へ出す副作用（描画・音・HUD）
  bodiesChanged(bodies: readonly BodyState[]): void;
  aimChanged(tier: TierId | null, x: number): void;
  merged(position: Vec2, tier: TierId): void;
  dropped(): void;
  scoreChanged(score: number, best: number): void;
  nextChanged(tier: TierId): void;
  gameOver(score: number, best: number): void;
  restarted(): void;
}
export interface GameHost {                 // 保存とスコア送信（Playables ポートの一部）
  save(data: SaveData): void;               // 失敗処理は呼び出し側
  submitBest(best: number): void;
}
export type GamePhase = 'playing' | 'gameover';
export class Game {
  constructor(world: PhysicsWorld, presenter: GamePresenter, host: GameHost, rng: Rng, initial: SaveData);
  readonly phase: GamePhase;
  readonly score: number;
  readonly best: number;
  readonly aimX: number;
  readonly nextTier: TierId;
  readonly dropReady: boolean;
  aimAt(unitX: number): void;
  nudge(direction: -1 | 1): void;
  drop(): void;
  restart(): void;
  update(dtSec: number): void;              // 可変 dt。内部で固定ステップに分割
  snapshot(): SaveData;
  pause(): void;                            // 保存して入力を止める。再開は resume()
  resume(): void;
}
```

- [ ] **Step 1: 失敗するテストを書く（loop）**

`src/app/loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FIXED_STEP_SEC, MAX_STEPS_PER_FRAME, advanceAccumulator } from './loop';

describe('advanceAccumulator', () => {
  it('produces one step per 1/60 s', () => {
    const r = advanceAccumulator(0, FIXED_STEP_SEC);
    expect(r.steps).toBe(1);
    expect(r.accumulatorSec).toBeCloseTo(0, 9);
  });

  it('carries the remainder', () => {
    const r = advanceAccumulator(0, FIXED_STEP_SEC * 1.5);
    expect(r.steps).toBe(1);
    expect(r.accumulatorSec).toBeCloseTo(FIXED_STEP_SEC * 0.5, 9);
  });

  it('caps steps after a long pause and discards the excess', () => {
    const r = advanceAccumulator(0, 30);
    expect(r.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(r.accumulatorSec).toBe(0);
  });

  it('ignores negative or NaN dt', () => {
    expect(advanceAccumulator(0.01, -1)).toEqual({ steps: 0, accumulatorSec: 0.01 });
    expect(advanceAccumulator(0.01, Number.NaN)).toEqual({ steps: 0, accumulatorSec: 0.01 });
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/app/loop.test.ts`
Expected: FAIL

- [ ] **Step 3: loop を実装**

`src/app/loop.ts`:

```ts
export const FIXED_STEP_SEC = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export function advanceAccumulator(
  accumulatorSec: number,
  dtSec: number,
  step: number = FIXED_STEP_SEC,
  maxSteps: number = MAX_STEPS_PER_FRAME,
): { steps: number; accumulatorSec: number } {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return { steps: 0, accumulatorSec };
  let acc = accumulatorSec + dtSec;
  let steps = 0;
  while (acc >= step && steps < maxSteps) {
    acc -= step;
    steps++;
  }
  if (steps === maxSteps) acc = 0;
  return { steps, accumulatorSec: acc };
}
```

- [ ] **Step 4: loop テストが通ることを確認**

Run: `npx vitest run src/app/loop.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 失敗するテストを書く（Game）**

`src/app/Game.test.ts`（物理は本物の `MatterWorld` を使う。描画と保存はスパイ）:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../core/rng';
import { createEmptySave } from '../core/save';
import type { SaveData, SnapshotBody } from '../core/save';
import { BOX, tierDef } from '../core/tiers';
import { MatterWorld } from '../physics/MatterWorld';
import { Game } from './Game';
import type { GameHost, GamePresenter } from './Game';

function presenterSpy(): GamePresenter {
  return {
    bodiesChanged: vi.fn(),
    aimChanged: vi.fn(),
    merged: vi.fn(),
    dropped: vi.fn(),
    scoreChanged: vi.fn(),
    nextChanged: vi.fn(),
    gameOver: vi.fn(),
    restarted: vi.fn(),
  };
}

function hostSpy(): GameHost {
  return { save: vi.fn(), submitBest: vi.fn() };
}

function run(game: Game, seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) game.update(1 / 60);
}

function make(initial: SaveData = createEmptySave()) {
  const world = new MatterWorld();
  const presenter = presenterSpy();
  const host = hostSpy();
  const game = new Game(world, presenter, host, new Rng(1), initial);
  return { world, presenter, host, game };
}

describe('Game start', () => {
  it('starts playing with a droppable next tier and aim at center', () => {
    const { game } = make();
    expect(game.phase).toBe('playing');
    expect(game.nextTier).toBeLessThanOrEqual(4);
    expect(game.aimX).toBe(0);
    expect(game.dropReady).toBe(true);
    expect(game.score).toBe(0);
  });

  it('restores a snapshot', () => {
    const { game, world } = make({
      v: 1,
      bestScore: 50,
      snapshot: { score: 12, nextTier: 3, bodies: [{ t: 2, x: 1, y: 0.66, a: 0 }, { t: 5, x: -2, y: 1.2, a: 0.3 }] },
    });
    expect(game.score).toBe(12);
    expect(game.best).toBe(50);
    expect(game.nextTier).toBe(3);
    expect(world.getBodies().map((b) => b.tier).sort()).toEqual([2, 5]);
  });
});

describe('aiming', () => {
  it('clamps aim to the walls and notifies the presenter', () => {
    const { game, presenter } = make();
    game.aimAt(100);
    expect(game.aimX).toBeCloseTo(BOX.width / 2 - tierDef(game.nextTier).radius);
    expect(presenter.aimChanged).toHaveBeenLastCalledWith(game.nextTier, game.aimX);
  });

  it('nudges by 0.25 units', () => {
    const { game } = make();
    game.nudge(1);
    game.nudge(1);
    expect(game.aimX).toBeCloseTo(0.5);
    game.nudge(-1);
    expect(game.aimX).toBeCloseTo(0.25);
  });
});

describe('dropping', () => {
  it('spawns the current tier at the aim and blocks further drops until ready', () => {
    const { game, world, presenter } = make();
    const tier = game.nextTier;
    game.aimAt(1);
    game.drop();
    expect(world.getBodies()).toHaveLength(1);
    expect(world.getBodies()[0]!.tier).toBe(tier);
    expect(world.getBodies()[0]!.position.y).toBeCloseTo(BOX.spawnY);
    expect(game.dropReady).toBe(false);
    expect(presenter.dropped).toHaveBeenCalledTimes(1);
    game.drop();
    expect(world.getBodies()).toHaveLength(1);
  });

  it('becomes ready again within 0.6 s even without a collision', () => {
    const { game } = make();
    game.drop();
    run(game, 0.65);
    expect(game.dropReady).toBe(true);
  });

  it('hides the aim ghost while not ready and shows the next tier when ready', () => {
    const { game, presenter } = make();
    game.drop();
    expect(presenter.aimChanged).toHaveBeenLastCalledWith(null, expect.any(Number));
    run(game, 0.7);
    expect(presenter.aimChanged).toHaveBeenLastCalledWith(game.nextTier, game.aimX);
  });
});

describe('merging', () => {
  it('merges two equal bodies dropped on the same spot and scores', () => {
    const { game, world, presenter, host } = make({ v: 1, bestScore: 0, snapshot: { score: 0, nextTier: 1, bodies: [{ t: 1, x: 0, y: 0.52, a: 0 }] } });
    game.aimAt(0);
    game.drop();
    run(game, 3);
    expect(world.getBodies().map((b) => b.tier)).toEqual([2]);
    expect(game.score).toBe(3);
    expect(presenter.merged).toHaveBeenCalledTimes(1);
    expect(presenter.scoreChanged).toHaveBeenLastCalledWith(3, 3);
    expect(host.save).toHaveBeenCalled();
  });
});

// 左右 2 列に異なるティアだけを積む（同ティアが触れないので合体しない）。
// 左列 tier 10 → 8 → 6 の上端は 10.16 + 1.42 = 11.58 > 11 で危険ラインを超える。
const OVERFLOW_BODIES: SnapshotBody[] = [
  { t: 10, x: -2.5, y: 2.45, a: 0 },
  { t: 9, x: 2.5, y: 2.18, a: 0 },
  { t: 8, x: -2.5, y: 6.82, a: 0 },
  { t: 7, x: 2.5, y: 6.02, a: 0 },
  { t: 6, x: -2.5, y: 10.16, a: 0 },
  { t: 5, x: 2.5, y: 8.88, a: 0 },
];

describe('game over', () => {
  it('ends when a resting body stays above the danger line and submits the best', () => {
    const bodies = OVERFLOW_BODIES;
    const { game, presenter, host } = make({ v: 1, bestScore: 0, snapshot: { score: 70, nextTier: 0, bodies } });
    run(game, 4);
    expect(game.phase).toBe('gameover');
    expect(presenter.gameOver).toHaveBeenCalledWith(70, 70);
    expect(host.submitBest).toHaveBeenCalledWith(70);
    const lastSave = (host.save as ReturnType<typeof vi.fn>).mock.lastCall?.[0] as SaveData;
    expect(lastSave.snapshot).toBeNull();
    expect(lastSave.bestScore).toBe(70);
  });

  it('ignores drops while over and restarts cleanly', () => {
    const bodies = OVERFLOW_BODIES;
    const { game, world, presenter } = make({ v: 1, bestScore: 0, snapshot: { score: 70, nextTier: 0, bodies } });
    run(game, 4);
    game.drop();
    expect(world.getBodies().length).toBe(bodies.length);
    game.restart();
    expect(game.phase).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.best).toBe(70);
    expect(world.getBodies()).toEqual([]);
    expect(presenter.restarted).toHaveBeenCalled();
  });
});

describe('snapshot and pause', () => {
  it('snapshot() reflects the live board', () => {
    const { game } = make();
    game.drop();
    run(game, 2);
    const s = game.snapshot();
    expect(s.snapshot?.bodies).toHaveLength(1);
    expect(s.snapshot?.nextTier).toBe(game.nextTier);
  });

  it('pause() saves immediately and freezes updates until resume()', () => {
    const { game, host, world } = make();
    game.drop();
    game.pause();
    expect(host.save).toHaveBeenCalledTimes(1);
    const yBefore = world.getBodies()[0]!.position.y;
    run(game, 1);
    expect(world.getBodies()[0]!.position.y).toBeCloseTo(yBefore);
    game.resume();
    run(game, 1);
    expect(world.getBodies()[0]!.position.y).toBeLessThan(yBefore);
  });
});
```

- [ ] **Step 6: 失敗を確認**

Run: `npx vitest run src/app/Game.test.ts`
Expected: FAIL（`./Game` が見つからない）

- [ ] **Step 7: Game を実装**

`src/app/Game.ts`:

```ts
import { Rng, nextDropTier } from '../core/rng';
import { clampAimX, evaluateGameOver, resolveMerges } from '../core/rules';
import type { SaveData } from '../core/save';
import { BOX } from '../core/tiers';
import type { BodyId, BodyState, TierId, Vec2 } from '../core/types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { FIXED_STEP_SEC, advanceAccumulator } from './loop';

export interface GamePresenter {
  bodiesChanged(bodies: readonly BodyState[]): void;
  aimChanged(tier: TierId | null, x: number): void;
  merged(position: Vec2, tier: TierId): void;
  dropped(): void;
  scoreChanged(score: number, best: number): void;
  nextChanged(tier: TierId): void;
  gameOver(score: number, best: number): void;
  restarted(): void;
}

export interface GameHost {
  save(data: SaveData): void;
  submitBest(best: number): void;
}

export type GamePhase = 'playing' | 'gameover';

const DROP_COOLDOWN_SEC = 0.6;
const NUDGE_UNITS = 0.25;
const AUTOSAVE_INTERVAL_SEC = 2;

export class Game {
  phase: GamePhase = 'playing';
  score = 0;
  best: number;
  aimX = 0;
  nextTier: TierId;
  dropReady = true;

  private paused = false;
  private accumulator = 0;
  private dropCooldown = 0;
  private droppedId: BodyId | null = null;
  private gameOverTimer = 0;
  private sinceSave = Number.POSITIVE_INFINITY;
  private dirty = false;

  constructor(
    private readonly world: PhysicsWorld,
    private readonly presenter: GamePresenter,
    private readonly host: GameHost,
    private readonly rng: Rng,
    initial: SaveData,
  ) {
    this.best = initial.bestScore;
    this.nextTier = nextDropTier(this.rng);
    if (initial.snapshot !== null) {
      this.score = initial.snapshot.score;
      this.nextTier = initial.snapshot.nextTier;
      for (const b of initial.snapshot.bodies) this.world.addBody(b.t, { x: b.x, y: b.y }, { x: 0, y: 0 }, b.a);
    }
    this.presenter.bodiesChanged(this.world.getBodies());
    this.presenter.scoreChanged(this.score, this.best);
    this.presenter.nextChanged(this.nextTier);
    this.presenter.aimChanged(this.nextTier, this.aimX);
  }

  aimAt(unitX: number): void {
    if (this.phase !== 'playing' || this.paused) return;
    this.aimX = clampAimX(unitX, this.nextTier);
    this.presenter.aimChanged(this.dropReady ? this.nextTier : null, this.aimX);
  }

  nudge(direction: -1 | 1): void {
    this.aimAt(this.aimX + direction * NUDGE_UNITS);
  }

  drop(): void {
    if (this.phase !== 'playing' || this.paused || !this.dropReady) return;
    const tier = this.nextTier;
    this.droppedId = this.world.addBody(tier, { x: clampAimX(this.aimX, tier), y: BOX.spawnY });
    this.dropReady = false;
    this.dropCooldown = DROP_COOLDOWN_SEC;
    this.nextTier = nextDropTier(this.rng);
    this.aimX = clampAimX(this.aimX, this.nextTier);
    this.dirty = true;
    this.presenter.dropped();
    this.presenter.nextChanged(this.nextTier);
    this.presenter.aimChanged(null, this.aimX);
    this.presenter.bodiesChanged(this.world.getBodies());
  }

  restart(): void {
    this.world.clear();
    this.phase = 'playing';
    this.score = 0;
    this.aimX = 0;
    this.dropReady = true;
    this.dropCooldown = 0;
    this.droppedId = null;
    this.gameOverTimer = 0;
    this.accumulator = 0;
    this.nextTier = nextDropTier(this.rng);
    this.dirty = false;
    this.presenter.restarted();
    this.presenter.bodiesChanged([]);
    this.presenter.scoreChanged(this.score, this.best);
    this.presenter.nextChanged(this.nextTier);
    this.presenter.aimChanged(this.nextTier, this.aimX);
    this.host.save(this.snapshot());
  }

  update(dtSec: number): void {
    if (this.paused) return;
    const r = advanceAccumulator(this.accumulator, dtSec);
    this.accumulator = r.accumulatorSec;
    for (let i = 0; i < r.steps; i++) this.fixedStep(FIXED_STEP_SEC);
    if (r.steps > 0) this.presenter.bodiesChanged(this.world.getBodies());
  }

  snapshot(): SaveData {
    const snapshot =
      this.phase === 'gameover'
        ? null
        : {
            score: this.score,
            nextTier: this.nextTier,
            bodies: this.world.getBodies().map((b) => ({ t: b.tier, x: b.position.x, y: b.position.y, a: b.angle })),
          };
    return { v: 1, bestScore: this.best, snapshot };
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.host.save(this.snapshot());
    this.sinceSave = 0;
  }

  resume(): void {
    this.paused = false;
    this.accumulator = 0;
  }

  private fixedStep(dt: number): void {
    const contacts = this.world.step(dt);
    this.sinceSave += dt;

    if (!this.dropReady) {
      this.dropCooldown -= dt;
      const collided = this.droppedId !== null && contacts.some((c) => c.a === this.droppedId || c.b === this.droppedId);
      if (collided || this.dropCooldown <= 0) {
        this.dropReady = true;
        this.droppedId = null;
        if (this.phase === 'playing') this.presenter.aimChanged(this.nextTier, this.aimX);
      }
    }

    if (this.phase !== 'playing') return;

    if (contacts.length > 0) {
      const bodies = new Map(this.world.getBodies().map((b) => [b.id, b] as const));
      const result = resolveMerges(contacts, bodies);
      if (result.removed.length > 0) {
        for (const id of result.removed) {
          if (id === this.droppedId) this.droppedId = null;
          this.world.removeBody(id);
        }
        for (const s of result.spawned) {
          this.world.addBody(s.tier, s.position, s.velocity);
          this.presenter.merged(s.position, s.tier);
        }
        if (result.spawned.length === 0) {
          const removedBody = bodies.get(result.removed[0]!);
          if (removedBody !== undefined) this.presenter.merged(removedBody.position, removedBody.tier);
        }
        this.score += result.scoreDelta;
        if (this.score > this.best) this.best = this.score;
        this.dirty = true;
        this.presenter.scoreChanged(this.score, this.best);
      }
    }

    const eval_ = evaluateGameOver(this.world.getBodies(), dt, this.gameOverTimer);
    this.gameOverTimer = eval_.timerSec;
    if (eval_.over) {
      this.phase = 'gameover';
      this.presenter.aimChanged(null, this.aimX);
      this.presenter.gameOver(this.score, this.best);
      this.host.save(this.snapshot());
      this.sinceSave = 0;
      this.dirty = false;
      this.host.submitBest(this.best);
      return;
    }

    if (this.dirty && this.sinceSave >= AUTOSAVE_INTERVAL_SEC) {
      this.host.save(this.snapshot());
      this.sinceSave = 0;
      this.dirty = false;
    }
  }
}
```

- [ ] **Step 8: 成功を確認**

Run: `npx vitest run src/app && npx tsc --noEmit`
Expected: PASS。「merging」テストは落下に 3 秒与えているので十分。落ちる場合は `BOX.spawnY` から y=0.52 の物体まで落下して接触するかを `world.getBodies()` を出力して確認する。「game over」は異なるティアを 2 列に積み、左列の上端が 11.58 で危険ラインを超える。列が倒れて失敗する場合は左列の最上段を x=-2.5 のまま tier 6 → tier 4 に替えず、代わりに `run(game, 4)` を 6 秒に延ばして静止を待つ。

- [ ] **Step 9: コミット**

```bash
git add src/app/loop.ts src/app/loop.test.ts src/app/Game.ts src/app/Game.test.ts
git commit -m "feat(app): add fixed-step game loop with merge, game-over and save hooks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: HUD と起動配線（main.ts）

**Files:**
- Create: `src/ui/Hud.ts`, `src/app/bootstrap.ts`
- Modify: `src/main.ts`, `index.html`（HUD 用スタイル追記）

**Interfaces:**
- Consumes: `Game`, `GamePresenter`, `GameHost`, `SceneRenderer`, `SfxSynth`, `InputController`, `planLayout`, `shouldApplyResize`, `createPort`, `withTimeout`, `parseSave`, `serializeSave`, `createEmptySave`, `resolveLang`, `t`, `creatureName`, `MatterWorld`, `Rng`, `randomSeed`
- Produces:

```ts
// Hud.ts
export class Hud {
  constructor(root: HTMLElement, lang: Lang);
  setMode(mode: HudMode): void;
  setScore(score: number, best: number): void;
  setNext(tier: TierId): void;
  showGameOver(score: number, best: number): void;
  hideGameOver(): void;
  onPlayAgain(cb: () => void): void;
  showWebglUnsupported(): void;
}
// bootstrap.ts
export async function bootstrap(canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<void>;
```

- [ ] **Step 1: HUD を実装**

`src/ui/Hud.ts`:

```ts
import type { HudMode } from '../app/LayoutPlanner';
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';
import type { Lang } from './i18n';
import { creatureName, t } from './i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

export class Hud {
  private readonly scoreValue = el('div', 'hud-value');
  private readonly bestValue = el('div', 'hud-value');
  private readonly nextChip = el('div', 'hud-chip');
  private readonly nextName = el('div', 'hud-chip-name');
  private readonly overlay = el('div', 'hud-overlay hidden');
  private readonly overScore = el('div', 'hud-over-score');
  private readonly playAgain = el('button', 'hud-button');
  private readonly panel = el('div', 'hud-panel');
  private readonly message = el('div', 'hud-message hidden');

  constructor(
    private readonly root: HTMLElement,
    private readonly lang: Lang,
  ) {
    const score = el('div', 'hud-stat');
    score.append(el('div', 'hud-label', t(lang, 'score')), this.scoreValue);
    const best = el('div', 'hud-stat');
    best.append(el('div', 'hud-label', t(lang, 'best')), this.bestValue);
    const next = el('div', 'hud-stat');
    const nextBox = el('div', 'hud-next');
    nextBox.append(this.nextChip, this.nextName);
    next.append(el('div', 'hud-label', t(lang, 'next')), nextBox);
    this.panel.append(score, best, next);

    const card = el('div', 'hud-card');
    this.playAgain.textContent = t(lang, 'playAgain');
    this.playAgain.type = 'button';
    card.append(el('div', 'hud-over-title', t(lang, 'gameOver')), this.overScore, this.playAgain);
    this.overlay.append(card);

    this.message.textContent = t(lang, 'webglUnsupported');
    this.root.append(this.panel, this.overlay, this.message);
    this.setMode('top');
  }

  setMode(mode: HudMode): void {
    this.root.dataset['mode'] = mode;
  }

  setScore(score: number, best: number): void {
    this.scoreValue.textContent = String(score);
    this.bestValue.textContent = String(best);
  }

  setNext(tier: TierId): void {
    const def = tierDef(tier);
    this.nextChip.style.background = `#${def.baseColor.toString(16).padStart(6, '0')}`;
    this.nextChip.style.width = `${24 + tier * 6}px`;
    this.nextChip.style.height = `${24 + tier * 6}px`;
    this.nextName.textContent = creatureName(this.lang, tier);
  }

  showGameOver(score: number, best: number): void {
    this.overScore.textContent = `${t(this.lang, 'score')} ${score} / ${t(this.lang, 'best')} ${best}`;
    this.overlay.classList.remove('hidden');
    this.playAgain.focus();
  }

  hideGameOver(): void {
    this.overlay.classList.add('hidden');
  }

  onPlayAgain(cb: () => void): void {
    this.playAgain.addEventListener('click', cb);
  }

  showWebglUnsupported(): void {
    this.panel.classList.add('hidden');
    this.message.classList.remove('hidden');
  }
}
```

`index.html` の `<style>` に追記（ボタンは 48px 以上、画面上部にはアイコンを置かない）:

```css
#hud .hidden { display: none !important; }
#hud .hud-panel { position: absolute; display: flex; gap: 16px; padding: 12px 16px; box-sizing: border-box; }
#hud[data-mode="top"] .hud-panel { left: 0; right: 0; top: 0; justify-content: center; align-items: flex-start; }
#hud[data-mode="sides"] .hud-panel { left: 0; top: 0; bottom: 0; width: 22%; flex-direction: column; justify-content: center; }
#hud .hud-stat { min-width: 88px; }
#hud .hud-label { font-size: 12px; letter-spacing: 0.08em; opacity: 0.75; text-transform: uppercase; }
#hud .hud-value { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
#hud .hud-next { display: flex; align-items: center; gap: 8px; }
#hud .hud-chip { border-radius: 50%; box-shadow: inset -4px -4px 8px rgba(0,0,0,0.25); }
#hud .hud-chip-name { font-size: 14px; }
#hud .hud-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(3, 18, 34, 0.6); pointer-events: auto; }
#hud .hud-card { background: #0f3b63; border-radius: 16px; padding: 24px 32px; text-align: center; min-width: 240px; }
#hud .hud-over-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
#hud .hud-over-score { font-size: 16px; margin-bottom: 20px; }
#hud .hud-button { min-width: 160px; min-height: 48px; font-size: 18px; border: 0; border-radius: 12px; background: #ffd27a; color: #0b2239; cursor: pointer; }
#hud .hud-message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; font-size: 16px; }
```

- [ ] **Step 2: 起動配線を実装**

`src/app/bootstrap.ts`:

```ts
import { SfxSynth } from '../audio/SfxSynth';
import { Rng, randomSeed } from '../core/rng';
import { createEmptySave, parseSave, serializeSave } from '../core/save';
import type { SaveData } from '../core/save';
import { MatterWorld } from '../physics/MatterWorld';
import { createPort } from '../playables/createPort';
import type { PlayablesPort } from '../playables/PlayablesPort';
import { withTimeout } from '../playables/withTimeout';
import { SceneRenderer } from '../render/SceneRenderer';
import { Hud } from '../ui/Hud';
import { resolveLang } from '../ui/i18n';
import { Game } from './Game';
import type { GameHost, GamePresenter } from './Game';
import { InputController } from './InputController';
import type { GameInput } from './InputController';
import { planLayout, shouldApplyResize } from './LayoutPlanner';

const LOAD_TIMEOUT_MS = 1000;

async function loadInitialSave(port: PlayablesPort): Promise<SaveData> {
  let raw: string;
  try {
    raw = await withTimeout(port.loadData(), LOAD_TIMEOUT_MS, () => {
      port.logWarning();
      return '';
    });
  } catch {
    port.logError();
    return createEmptySave();
  }
  if (raw === '') return createEmptySave();
  const parsed = parseSave(raw);
  if (parsed === null) {
    port.logError();
    return createEmptySave();
  }
  return parsed;
}

async function loadLang(port: PlayablesPort): Promise<ReturnType<typeof resolveLang>> {
  try {
    return resolveLang(await withTimeout(port.getLanguage(), LOAD_TIMEOUT_MS, () => 'en'));
  } catch {
    return 'en';
  }
}

export async function bootstrap(canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<void> {
  const port = createPort();
  const sfx = new SfxSynth();

  let game: Game | null = null;
  let rafId: number | null = null;
  let lastTime: number | null = null;
  let pendingScore: number | null = null;

  port.onPause(() => {
    game?.pause();
    sfx.suspend();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });
  port.onResume(() => {
    game?.resume();
    if (port.isAudioEnabled()) sfx.resume();
    lastTime = null;
    if (rafId === null) rafId = requestAnimationFrame(frame);
  });
  sfx.setEnabled(port.isAudioEnabled());
  port.onAudioEnabledChange((enabled) => sfx.setEnabled(enabled));

  const [initial, lang] = await Promise.all([loadInitialSave(port), loadLang(port)]);
  const hud = new Hud(hudRoot, lang);

  const renderer = SceneRenderer.tryCreate(canvas);
  if (renderer === null) {
    hud.showWebglUnsupported();
    port.logError();
    port.firstFrameReady();
    return;
  }

  const applyLayout = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!shouldApplyResize(w, h)) return;
    const plan = planLayout(w, h);
    renderer.applyLayout(plan, window.devicePixelRatio);
    hud.setMode(plan.hudMode);
  };
  applyLayout();
  window.addEventListener('resize', applyLayout);

  const presenter: GamePresenter = {
    bodiesChanged: (bodies) => renderer.syncBodies(bodies),
    aimChanged: (tier, x) => renderer.setAim(tier, x),
    merged: (position, tier) => {
      renderer.spawnMergeEffect(position, tier);
      sfx.playMerge(tier);
    },
    dropped: () => sfx.playDrop(),
    scoreChanged: (score, best) => hud.setScore(score, best),
    nextChanged: (tier) => hud.setNext(tier),
    gameOver: (score, best) => {
      hud.showGameOver(score, best);
      sfx.playGameOver();
    },
    restarted: () => hud.hideGameOver(),
  };

  const flushScore = (): void => {
    if (pendingScore === null) return;
    const value = pendingScore;
    port.sendScore(value).then(
      () => {
        if (pendingScore === value) pendingScore = null;
      },
      () => port.logWarning(),
    );
  };

  const host: GameHost = {
    save: (data) => {
      const str = serializeSave(data);
      if (!str.isWellFormed()) {
        port.logError();
        return;
      }
      port.saveData(str).then(flushScore, () => port.logError());
    },
    submitBest: (best) => {
      pendingScore = best;
    },
  };

  const world = new MatterWorld();
  game = new Game(world, presenter, host, new Rng(randomSeed()), initial);
  const liveGame = game;

  const handleInput = (input: GameInput): void => {
    switch (input.type) {
      case 'aim':
        liveGame.aimAt(renderer.clientToUnit(input.clientX, input.clientY).x);
        break;
      case 'nudge':
        liveGame.nudge(input.direction);
        break;
      case 'drop':
        liveGame.drop();
        break;
      case 'restart':
        if (liveGame.phase === 'gameover') liveGame.restart();
        break;
    }
  };
  new InputController(canvas, handleInput, () => sfx.unlock());
  hud.onPlayAgain(() => {
    sfx.unlock();
    liveGame.restart();
  });

  const frame = (now: number): void => {
    rafId = requestAnimationFrame(frame);
    const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
    lastTime = now;
    liveGame.update(dt);
    renderer.render(dt);
  };

  renderer.render(0);
  port.firstFrameReady();
  port.gameReady();
  rafId = requestAnimationFrame(frame);
}
```

`src/main.ts`:

```ts
import { bootstrap } from './app/bootstrap';

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
if (!(canvas instanceof HTMLCanvasElement) || hud === null) {
  throw new Error('index.html must contain #game canvas and #hud div');
}

window.addEventListener('error', () => {
  if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) ytgame.health.logError();
});
window.addEventListener('unhandledrejection', () => {
  if (typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV) ytgame.health.logError();
});

void bootstrap(canvas, hud);
```

`main.ts` の `typeof ytgame` ガードは `createPort` の外にあるが、グローバルエラーハンドラはポート生成前にも必要なため例外として許容する。

- [ ] **Step 3: 型検査と全テスト**

Run: `npx tsc --noEmit && npx vitest run`
Expected: エラーなし、全テスト PASS

- [ ] **Step 4: 開発サーバーで手動確認**

Run: `npm run dev`（`http://localhost:8080`）

ブラウザで次を確認し、結果をコミットメッセージ本文に 1 行ずつ記録する:

1. 起動直後に箱・危険ライン・HUD（スコア 0／ベスト／つぎ）が表示され、ゴーストが箱の上に出る。
2. マウス移動でゴーストが追従し、クリックで落下する。連続クリックしても 0.6 秒以内は 2 個目が出ない。
3. 同じ生き物を重ねると合体して音が鳴り、泡が出て、スコアが増える。
4. 危険ラインを超えて積むと 1 秒後にゲームオーバー画面が出て、「もう一度」で盤面が消える。
5. DevTools のデバイスモードで iPhone（縦）と横向きに切り替えても箱が画面内に収まり、HUD が上／左右に移動する。
6. リロードすると直前の盤面とベストが復元される（`LocalAdapter` は localStorage に書く）。
7. キーボード: ← → で移動、Space で落下、Enter でリスタート。Esc を押してもコンソールにエラーが出ない。
8. コンソールに外部リクエスト（youtube.com 以外）が出ていない（Network タブで確認）。

- [ ] **Step 5: コミット**

```bash
git add index.html src/main.ts src/ui/Hud.ts src/app/bootstrap.ts
git commit -m "feat: wire HUD, renderer, audio and Playables lifecycle in bootstrap

Manual check: start/aim/drop/merge/game over/resize/restore/keyboard verified in Chrome.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: ビルド検査スクリプト、ZIP 化、README

**Files:**
- Create: `scripts/check-bundle.mjs`, `scripts/make-zip.mjs`, `README.md`
- Test: `scripts/check-bundle.test.mjs`（Node 標準の `node:test`）

**Interfaces:**
- Produces: `analyzeBundle(distDir): { files: { path, bytes }[]; totalBytes; warnings: string[]; errors: string[] }`（`check-bundle.mjs` から export）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/check-bundle.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyzeBundle } from './check-bundle.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const OK_HTML = '<html><head><script src="https://www.youtube.com/game_api/v1"></script><script type="module" src="./assets/main.js"></script></head></html>';

test('passes a clean bundle', () => {
  const dir = fixture({ 'index.html': OK_HTML, 'assets/main-abc123.js': 'x'.repeat(100) });
  const r = analyzeBundle(dir);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.files.length, 2);
});

test('flags illegal characters in file names', () => {
  const dir = fixture({ 'index.html': OK_HTML, 'assets/日本語.js': 'x', 'assets/with space.js': 'x' });
  const r = analyzeBundle(dir);
  assert.equal(r.errors.length, 2);
});

test('warns above 512 KiB and errors above 30 MiB', () => {
  const dir = fixture({ 'index.html': OK_HTML, 'assets/big.js': 'x'.repeat(512 * 1024 + 1) });
  const r = analyzeBundle(dir);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(r.errors, []);
});

test('errors when the SDK script is not the first script in index.html', () => {
  const dir = fixture({ 'index.html': '<script src="./a.js"></script><script src="https://www.youtube.com/game_api/v1"></script>' });
  const r = analyzeBundle(dir);
  assert.ok(r.errors.some((e) => e.includes('game_api/v1')));
});

test('errors when index.html is missing', () => {
  const dir = fixture({ 'a.js': 'x' });
  assert.ok(analyzeBundle(dir).errors.some((e) => e.includes('index.html')));
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test scripts/check-bundle.test.mjs`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装**

`scripts/check-bundle.mjs`:

```js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WARN_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 8000;
const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const SDK_SRC = 'https://www.youtube.com/game_api/v1';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function analyzeBundle(distDir) {
  const warnings = [];
  const errors = [];
  const files = walk(distDir).map((full) => ({ path: relative(distDir, full), bytes: statSync(full).size }));
  let totalBytes = 0;

  for (const f of files) {
    totalBytes += f.bytes;
    for (const segment of f.path.split(/[\\/]/)) {
      if (!NAME_RE.test(segment)) errors.push(`illegal file name: ${f.path}`);
    }
    if (f.bytes >= MAX_FILE_BYTES) errors.push(`file over 30 MiB: ${f.path} (${f.bytes} bytes)`);
    else if (f.bytes > WARN_BYTES) warnings.push(`file over 512 KiB (SHOULD): ${f.path} (${f.bytes} bytes)`);
  }
  if (files.length > MAX_FILES) errors.push(`too many files: ${files.length}`);
  if (totalBytes >= MAX_TOTAL_BYTES) errors.push(`total bundle over 250 MiB: ${totalBytes}`);

  const index = files.find((f) => f.path === 'index.html');
  if (index === undefined) {
    errors.push('index.html missing at bundle root');
  } else {
    const html = readFileSync(join(distDir, 'index.html'), 'utf8');
    const first = /<script\b[^>]*>/i.exec(html);
    if (first === null || !first[0].includes(SDK_SRC)) {
      errors.push(`first <script> in index.html must load ${SDK_SRC}`);
    }
  }
  return { files, totalBytes, warnings, errors };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dist = process.argv[2] ?? 'dist';
  const r = analyzeBundle(dist);
  console.log(`${r.files.length} files, ${(r.totalBytes / 1024).toFixed(1)} KiB total`);
  for (const f of r.files.sort((a, b) => b.bytes - a.bytes).slice(0, 10)) console.log(`  ${(f.bytes / 1024).toFixed(1).padStart(8)} KiB  ${f.path}`);
  for (const w of r.warnings) console.warn(`WARN  ${w}`);
  for (const e of r.errors) console.error(`ERROR ${e}`);
  process.exit(r.errors.length === 0 ? 0 : 1);
}
```

`scripts/make-zip.mjs`（macOS / Linux の `zip` コマンドを使う。Windows では `Compress-Archive` に置き換える）:

```js
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const out = resolve(process.argv[3] ?? 'ocean-merge.zip');
if (!existsSync(dist)) {
  console.error(`dist not found: ${dist}. Run "npm run build" first.`);
  process.exit(1);
}
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, '.'], { cwd: dist, stdio: 'inherit' });
console.log(`wrote ${out}`);
```

- [ ] **Step 4: テストとビルドを確認**

Run:

```bash
node --test scripts/check-bundle.test.mjs
npm run build
npm run check:bundle
npm run zip
unzip -l ocean-merge.zip | head -20
```

Expected: テスト 5 件 PASS。`check:bundle` はエラー 0。`three` チャンクが 512 KiB を超える場合は WARN が 1 件出る（許容。README の既知の制限に記載する）。ZIP のルート直下に `index.html` がある。

- [ ] **Step 5: README を書く**

`README.md`:

````markdown
# Ocean Merge

海の生き物を落として同じ種類を合体させ、進化させていくパズル。YouTube Playables 向け。

## 開発

```bash
npm install
npm run dev          # http://localhost:8080
npm test             # Vitest
npm run typecheck
```

## ビルドと提出

```bash
npm run build        # dist/
npm run check:bundle # ファイル名・サイズ・SDK 読込順の検査
npm run zip          # ocean-merge.zip
```

`ocean-merge.zip` を Developer Portal の「Add a new game」にアップロードする。

## Playables 検証手順

1. `npm run dev` を起動し、SDK Test Suite（https://developers.google.com/youtube/gaming/playables/test_suite）の Game URL に `http://localhost:8080` を入力する。
2. イベントログで `firstFrameReady` → `gameReady` の順に 1 回ずつ出ることを確認する。
3. Pause / Resume ボタンで物体が止まり、再開後に一気に落ちないことを確認する。Pause 時に `saveData` が記録される。
4. 「ローディング画面モック（初期高さ 0）」を有効にして、描画が止まらないことを確認する。
5. Audio トグルで音が消え、ゲーム内に音量ボタンがないことを確認する。
6. ゲームオーバー後に `sendScore` の値が HUD のベストと一致することを確認する。
7. Chrome DevTools の Local Overrides で `index.html` に本番 CSP を付けてリロードし、コンソールに CSP 違反がないことを確認する。CSP 文字列は Test Suite ガイドに掲載されている。
8. デバイスモードで 9:32、9:16、1:1、16:9、32:9 を確認する。

## 既知の制限

- `three` チャンクが「個別ファイル SHOULD < 512 KiB」を超える場合がある。MUST（30 MiB）には抵触しない。
- 画像・音声ファイルは同梱しない（全てコード生成）。

## IP について

メカニクス（落下・同種合体・進化・上限ラインでのゲームオーバー）は一般的なルールであり、名称・造形・色・音・画面構図は本作独自のもの。提出前に表示タイトルの商標検索（J-PlatPat、USPTO 9 類・41 類）を行うこと。
````

- [ ] **Step 6: コミット**

```bash
git add scripts README.md
git commit -m "build: add bundle checker, zip packaging and README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Playables Test Suite での最終検証

**Files:**
- Modify: 検証で見つかった不具合のあるファイルのみ

- [ ] **Step 1: Test Suite でライフサイクルを確認**

`npm run dev` を起動し、README の「Playables 検証手順」1〜6 を実行する。各項目について、Test Suite のイベントログのスクリーンショットを撮り、`docs/superpowers/verification/2026-10-07-test-suite/` に `01-lifecycle.png` のように保存する。

- [ ] **Step 2: ゼロ高さビューポートを確認**

Test Suite のローディング画面モックを有効にして読み込む。`firstFrameReady` が記録され、モック解除後に正しいサイズで描画されること。失敗した場合は `bootstrap.ts` の `applyLayout` が `shouldApplyResize` を通して 0 を拒否しているか、`resize` イベントが登録されているかを確認する。

- [ ] **Step 3: CSP を再現して外部リクエストを確認**

Chrome DevTools → Sources → Overrides で `index.html` のレスポンスヘッダに Test Suite ガイドの CSP 文字列を追加し、リロード。Network タブで `youtube.com` 以外へのリクエストが 0 件、Console に CSP 違反が 0 件であること。

- [ ] **Step 4: 長時間プレイでメモリを確認**

5 分間プレイ（合体を 100 回以上）し、DevTools の Memory でヒープスナップショットを 2 回取り、`Group` / `Mesh` / `BufferGeometry` の件数が盤面の物体数に比例していて増え続けていないことを確認する。増え続けていれば `SceneRenderer.syncBodies` の削除分岐と `Effects.update` の `dispose` を疑う。

- [ ] **Step 5: 実機確認**

`npm run build && npm run preview -- --host` で同一 LAN の iPhone / Android から開き、タッチでドラッグ → 離して落下ができること、縦横回転でレイアウトが切り替わること、音が YouTube 側のミュートに従う前提で鳴ることを確認する。

- [ ] **Step 6: 不具合があれば修正してコミット**

修正は該当タスクのテストを先に追加してから行う（TDD）。

```bash
git add -A docs/superpowers/verification
git commit -m "test: record Playables Test Suite verification

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-Review 結果

**Spec coverage**

| Spec セクション | タスク |
|---|---|
| 1.3 タイトル・IP 方針 | Task 8（文言集約）、Task 15（README） |
| 2 プラットフォーム制約 | Task 1（index.html 読込順）、Task 9（ポート）、Task 14（ライフサイクル）、Task 15（サイズ・ファイル名検査）、Task 16（CSP・ゼロ高さ） |
| 3 アーキテクチャ | Task 1〜14 のディレクトリ構成 |
| 4.1〜4.2 座標系・ティア | Task 1、Task 6 |
| 4.3 進行 | Task 2（抽選）、Task 3（合体）、Task 4（ゲームオーバー・クランプ）、Task 13（クールダウン・リスタート） |
| 5 ライフサイクル・セーブ・スコア送信 | Task 5、Task 9、Task 13（autosave・pause）、Task 14（bootstrap） |
| 6 描画 | Task 11 |
| 7 レイアウト・入力 | Task 7、Task 12、Task 14 |
| 8 音声 | Task 10、Task 14（ミュート連動・unlock） |
| 9 多言語 | Task 8、Task 14 |
| 10 エラー処理 | Task 14（loadData/saveData/sendScore/WebGL/global error）、Task 13（アキュムレータ上限） |
| 11 テスト・検証 | 各タスクのテスト、Task 15（check-bundle）、Task 16 |
| 12 ビルド | Task 1（vite.config）、Task 15 |
| 13 リスク | Task 15（512 KiB 警告）、Task 16（メモリ・実機） |

**Review Focus のテスト所在**: 1 → Task 4 `clampAimX`、2 → Task 13 `advanceAccumulator`、3 → Task 7 `shouldApplyResize`、4 → Task 5 `parseSave`、5 → Task 12 `mapKeyEvent`。

**型の整合**: `GamePresenter` / `GameHost` は Task 13 で定義し Task 14 で同名・同シグネチャで使用。`PhysicsWorld.step` の戻り値 `readonly ContactPair[]` を `Game.fixedStep` が消費。`LayoutPlan.unitsPerPx` と `BOARD_UNITS` を `SceneRenderer.applyLayout` が使用。`SaveData` の `snapshot: BoardSnapshot | null` を `Game.snapshot()` が返す。
