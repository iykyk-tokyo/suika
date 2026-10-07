import { describe, expect, it } from 'vitest';
import { BOX, tierDef } from '../core/tiers';
import { MatterWorld, UNIT_TO_PX, fromMatter, toMatter } from './MatterWorld';

function settle(world: MatterWorld, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60);
}

describe('coordinate conversion', () => {
  it('maps the floor center to the bottom middle of the Matter box', () => {
    expect(toMatter({ x: 0, y: 0 })).toEqual({ x: (BOX.width / 2) * UNIT_TO_PX, y: BOX.height * UNIT_TO_PX });
  });

  it('round trips', () => {
    const p = { x: -3.2, y: 7.7 };
    const back = fromMatter(toMatter(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe('MatterWorld', () => {
  it('adds a body and reports it in unit coordinates', () => {
    const w = new MatterWorld();
    const id = w.addBody(3, { x: 1.5, y: 12 });
    const b = w.getBody(id);
    expect(b?.tier).toBe(3);
    expect(b?.position.x).toBeCloseTo(1.5);
    expect(b?.position.y).toBeCloseTo(12);
    expect(w.getBodies()).toHaveLength(1);
  });

  it('a dropped body falls and rests on the floor', () => {
    const w = new MatterWorld();
    const id = w.addBody(4, { x: 0, y: 12 });
    settle(w, 4);
    const b = w.getBody(id);
    expect(b).toBeDefined();
    expect(b!.position.y).toBeCloseTo(tierDef(4).radius, 1);
    expect(Math.hypot(b!.velocity.x, b!.velocity.y)).toBeLessThan(0.2);
  });

  it('bodies stay inside the walls', () => {
    const w = new MatterWorld();
    const id = w.addBody(2, { x: 4.3, y: 12 }, { x: 20, y: 0 });
    settle(w, 3);
    const b = w.getBody(id)!;
    expect(b.position.x).toBeLessThanOrEqual(BOX.width / 2 - tierDef(2).radius + 0.05);
    expect(b.position.x).toBeGreaterThanOrEqual(-BOX.width / 2 + tierDef(2).radius - 0.05);
  });

  it('reports a contact when two bodies touch', () => {
    const w = new MatterWorld();
    const a = w.addBody(1, { x: 0, y: 0.52 });
    const b = w.addBody(1, { x: 0, y: 6 });
    const seen: Array<{ a: number; b: number }> = [];
    for (let i = 0; i < 240; i++) {
      for (const c of w.step(1 / 60)) seen.push(c);
    }
    const pair = seen.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    expect(pair).toBeDefined();
  });

  it('does not report wall or floor contacts as pairs', () => {
    const w = new MatterWorld();
    w.addBody(1, { x: 0, y: 5 });
    let count = 0;
    for (let i = 0; i < 240; i++) count += w.step(1 / 60).length;
    expect(count).toBe(0);
  });

  it('removes bodies and clears the world', () => {
    const w = new MatterWorld();
    const id = w.addBody(0, { x: 0, y: 5 });
    w.removeBody(id);
    expect(w.getBody(id)).toBeUndefined();
    w.addBody(0, { x: 0, y: 5 });
    w.clear();
    expect(w.getBodies()).toEqual([]);
  });

  it('applies initial velocity and angle', () => {
    const w = new MatterWorld();
    const id = w.addBody(5, { x: 0, y: 8 }, { x: 3, y: 0 }, 1.2);
    const b = w.getBody(id)!;
    expect(b.velocity.x).toBeGreaterThan(0);
    expect(b.angle).toBeCloseTo(1.2, 1);
  });
});
