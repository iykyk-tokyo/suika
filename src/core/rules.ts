import { BOX, nextTier, tierDef } from './tiers';
import type { BodyId, BodyState, ContactPair, MergeResult, SpawnRequest, TierId } from './types';

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
