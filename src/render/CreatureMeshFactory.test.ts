import { Box3, Mesh, SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TIERS, tierDef } from '../core/tiers';
import { CreatureMeshFactory } from './CreatureMeshFactory';

describe('CreatureMeshFactory', () => {
  const factory = new CreatureMeshFactory();

  it.each(TIERS.map((t) => [t.id] as const))('tier %i has a body sphere with the tier radius', (id) => {
    const group = factory.createCreature(id);
    const body = group.getObjectByName('body');
    expect(body).toBeInstanceOf(Mesh);
    const geom = (body as Mesh).geometry;
    expect(geom).toBeInstanceOf(SphereGeometry);
    expect((geom as SphereGeometry).parameters.radius).toBeCloseTo(tierDef(id).radius);
  });

  it.each(TIERS.map((t) => [t.id] as const))('tier %i stays within 1.6x the physics radius', (id) => {
    const group = factory.createCreature(id);
    const size = new Box3().setFromObject(group).getSize(new Vector3());
    const limit = tierDef(id).radius * 2 * 1.6;
    expect(size.x).toBeLessThanOrEqual(limit);
    expect(size.y).toBeLessThanOrEqual(limit);
  });

  it('has two eyes on every creature', () => {
    for (const t of TIERS) {
      const eyes = factory.createCreature(t.id).children.filter((c) => c.name === 'eye');
      expect(eyes).toHaveLength(2);
    }
  });

  it('ghost is translucent', () => {
    const ghost = factory.createGhost(3);
    const body = ghost.getObjectByName('body') as Mesh;
    const mat = body.material;
    expect(Array.isArray(mat)).toBe(false);
    if (!Array.isArray(mat)) {
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBeLessThan(1);
    }
  });

  it('shares geometry between creatures of the same tier', () => {
    const a = factory.createCreature(2).getObjectByName('body') as Mesh;
    const b = factory.createCreature(2).getObjectByName('body') as Mesh;
    expect(a.geometry).toBe(b.geometry);
  });
});
