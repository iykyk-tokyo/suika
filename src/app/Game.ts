import { Rng, nextDropTier } from '../core/rng';
import { DEFAULT_GAME_OVER, clampAimX, evaluateGameOver, resolveMerges } from '../core/rules';
import type { GameOverOptions } from '../core/rules';
import type { SaveData } from '../core/save';
import { BOX } from '../core/tiers';
import type { BodyId, BodyState, TierId, Vec2 } from '../core/types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { FIXED_STEP_SEC, advanceAccumulator } from './loop';

// Game が外界へ出す副作用（描画・音・HUD）。
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

// 保存とスコア送信。失敗処理は呼び出し側（bootstrap）が持つ。
export interface GameHost {
  save(data: SaveData): void;
  submitBest(best: number): void;
}

export type GamePhase = 'playing' | 'gameover';

export interface GameOptions {
  readonly gameOver?: GameOverOptions;
}

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
  private readonly gameOverOptions: GameOverOptions;

  constructor(
    private readonly world: PhysicsWorld,
    private readonly presenter: GamePresenter,
    private readonly host: GameHost,
    private readonly rng: Rng,
    initial: SaveData,
    options: GameOptions = {},
  ) {
    this.gameOverOptions = options.gameOver ?? DEFAULT_GAME_OVER;
    this.best = initial.bestScore;
    this.nextTier = nextDropTier(this.rng);
    if (initial.snapshot !== null) {
      this.score = initial.snapshot.score;
      this.nextTier = initial.snapshot.nextTier;
      for (const b of initial.snapshot.bodies) this.world.addBody(b.t, { x: b.x, y: b.y }, { x: 0, y: 0 }, b.a);
    }
    if (this.score > this.best) this.best = this.score;
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
    if (this.phase !== 'gameover' || this.paused) return;
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

  // 遅れて届いたクラウドセーブのベストを反映する（セーブと sendScore の一致を守る）。
  raiseBest(best: number): void {
    if (best <= this.best) return;
    this.best = best;
    this.presenter.scoreChanged(this.score, this.best);
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

    const evaluation = evaluateGameOver(this.world.getBodies(), dt, this.gameOverTimer, this.gameOverOptions);
    this.gameOverTimer = evaluation.timerSec;
    if (evaluation.over) {
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
