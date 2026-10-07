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
