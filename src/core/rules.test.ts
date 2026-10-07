import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_OVER, clampAimX, evaluateGameOver, resolveMerges } from './rules';
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
