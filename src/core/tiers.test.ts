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
    expect(TIERS[MAX_TIER]!.radius * 4).toBeLessThan(BOX.width);
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
