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
