import { describe, expect, it } from 'vitest';
import { CreatureAnimator, IMPACT_THRESHOLD } from './CreatureAnimator';

function run(a: CreatureAnimator, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds; t += step) a.update(step);
}

describe('CreatureAnimator', () => {
  it('rests at scale 1 with eyes open when nothing happens', () => {
    const a = new CreatureAnimator(1, false);
    run(a, 0.1);
    const p = a.pose();
    expect(p.scaleX).toBeCloseTo(1, 1);
    expect(p.scaleY).toBeCloseTo(1, 1);
    expect(p.eyeOpen).toBe(1);
  });

  it('pops in from small and overshoots before settling when born from a merge', () => {
    const a = new CreatureAnimator(1, true);
    expect(a.pose().scaleY).toBeLessThan(0.6);
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      a.update(1 / 60);
      peak = Math.max(peak, a.pose().scaleY);
    }
    expect(peak).toBeGreaterThan(1.05);
    run(a, 1);
    expect(a.pose().scaleY).toBeCloseTo(1, 1);
  });

  it('squashes (shorter and wider) on a hard landing, then springs back', () => {
    const a = new CreatureAnimator(1, false);
    a.observeVelocity({ x: 0, y: -6 });
    a.observeVelocity({ x: 0, y: 0 });
    run(a, 0.05);
    const p = a.pose();
    expect(p.scaleY).toBeLessThan(0.97);
    expect(p.scaleX).toBeGreaterThan(1.01);
    run(a, 1.5);
    expect(a.pose().scaleY).toBeCloseTo(1, 1);
  });

  it('ignores small velocity jitter while resting', () => {
    const a = new CreatureAnimator(1, false);
    a.observeVelocity({ x: 0, y: -(IMPACT_THRESHOLD * 0.5) });
    a.observeVelocity({ x: 0, y: 0 });
    run(a, 0.05);
    expect(a.pose().scaleY).toBeCloseTo(1, 1);
  });

  it('blinks every few seconds and reopens', () => {
    const a = new CreatureAnimator(3, false);
    let closed = false;
    for (let i = 0; i < 60 * 8; i++) {
      a.update(1 / 60);
      if (a.pose().eyeOpen < 0.5) closed = true;
    }
    expect(closed).toBe(true);
    run(a, 0.3);
  });

  it('keeps everything still when motion is reduced', () => {
    const a = new CreatureAnimator(1, true, false);
    expect(a.pose().scaleY).toBe(1);
    a.observeVelocity({ x: 0, y: -8 });
    a.observeVelocity({ x: 0, y: 0 });
    run(a, 0.05);
    expect(a.pose().scaleY).toBe(1);
  });
});
