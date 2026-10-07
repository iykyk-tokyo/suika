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
