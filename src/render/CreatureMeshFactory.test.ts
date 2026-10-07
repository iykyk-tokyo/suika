import { Box3, Mesh, MeshPhysicalMaterial, SphereGeometry, Vector3 } from 'three';
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

  it('gives every creature eye highlights and two blush cheeks', () => {
    for (const t of TIERS) {
      const names = factory.createCreature(t.id).children.map((c) => c.name);
      expect(names.filter((n) => n === 'eyeShine').length).toBeGreaterThanOrEqual(2);
      expect(names.filter((n) => n === 'cheek')).toHaveLength(2);
    }
  });

  it('gives every tier a distinct set of parts so species read apart beyond color', () => {
    const signatures = TIERS.map((t) =>
      [...new Set(factory.createCreature(t.id).children.map((c) => c.name))].sort().join(','),
    );
    expect(new Set(signatures).size).toBe(TIERS.length);
  });

  it('uses a glossy clear-coated body for solid creatures and a translucent one for sea angel and jellyfish', () => {
    for (const t of TIERS) {
      const body = factory.createCreature(t.id).getObjectByName('body') as Mesh;
      const mat = body.material;
      if (Array.isArray(mat)) throw new Error('single material expected');
      expect(mat).toBeInstanceOf(MeshPhysicalMaterial);
      const jelly = t.shape === 'seaAngel' || t.shape === 'jellyfish';
      expect(mat.transparent).toBe(jelly);
      if (!jelly) expect((mat as MeshPhysicalMaterial).clearcoat).toBeGreaterThan(0.5);
    }
  });

  it('ghost is translucent but readable (opacity between 0.7 and 1)', () => {
    const ghost = factory.createGhost(3);
    const body = ghost.getObjectByName('body') as Mesh;
    const mat = body.material;
    expect(Array.isArray(mat)).toBe(false);
    if (!Array.isArray(mat)) {
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBeLessThan(1);
      expect(mat.opacity).toBeGreaterThanOrEqual(0.7);
    }
  });

  it.each(TIERS.map((t) => [t.id] as const))('ghost of tier %i shows the same parts as the creature so shapes stay recognizable', (id) => {
    const creature = factory.createCreature(id);
    const ghost = factory.createGhost(id);
    expect(ghost.children.map((c) => c.name)).toEqual(creature.children.map((c) => c.name));
  });

  it('shares geometry between creatures of the same tier', () => {
    const a = factory.createCreature(2).getObjectByName('body') as Mesh;
    const b = factory.createCreature(2).getObjectByName('body') as Mesh;
    expect(a.geometry).toBe(b.geometry);
  });

  it.each(TIERS.map((t) => [t.id] as const))('tier %i shares every part geometry (eyes, fins, tentacles) between instances', (id) => {
    const a = factory.createCreature(id).children as Mesh[];
    const b = factory.createCreature(id).children as Mesh[];
    expect(a.length).toBe(b.length);
    a.forEach((mesh, i) => expect(mesh.geometry).toBe(b[i]!.geometry));
  });
});
