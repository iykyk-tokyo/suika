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
