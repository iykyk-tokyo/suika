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
