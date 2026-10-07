import { BufferGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshToonMaterial, SphereGeometry, TorusGeometry } from 'three';
import type { CreatureShape, TierDef } from '../core/tiers';
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';

interface Part {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

const EYE_COLOR = 0x1b1b2f;

function eyes(r: number): Part[] {
  const er = r * 0.12;
  return [
    { name: 'eye', geometry: new SphereGeometry(er, 12, 12), color: EYE_COLOR, position: [-r * 0.35, r * 0.25, r * 0.85] },
    { name: 'eye', geometry: new SphereGeometry(er, 12, 12), color: EYE_COLOR, position: [r * 0.35, r * 0.25, r * 0.85] },
  ];
}

function appendages(shape: CreatureShape, def: TierDef): Part[] {
  const r = def.radius;
  const c = def.accentColor;
  switch (shape) {
    case 'plankton':
      return [{ name: 'spike', geometry: new TorusGeometry(r * 0.9, r * 0.06, 8, 24), color: c, position: [0, 0, 0] }];
    case 'seaAngel':
      return [
        { name: 'wing', geometry: new ConeGeometry(r * 0.35, r * 0.9, 12), color: c, position: [-r * 0.9, 0, 0], rotation: [0, 0, Math.PI / 2] },
        { name: 'wing', geometry: new ConeGeometry(r * 0.35, r * 0.9, 12), color: c, position: [r * 0.9, 0, 0], rotation: [0, 0, -Math.PI / 2] },
      ];
    case 'jellyfish':
      return [-0.5, -0.17, 0.17, 0.5].map((k) => ({
        name: 'tentacle',
        geometry: new CylinderGeometry(r * 0.07, r * 0.04, r * 0.8, 8),
        color: c,
        position: [r * k, -r * 0.6, 0] as const,
      }));
    case 'pufferfish':
      return [
        { name: 'fin', geometry: new ConeGeometry(r * 0.3, r * 0.5, 10), color: c, position: [r * 1.05, 0, 0], rotation: [0, 0, -Math.PI / 2] },
        { name: 'fin', geometry: new ConeGeometry(r * 0.25, r * 0.4, 10), color: c, position: [0, r * 1.05, 0] },
      ];
    case 'crab':
      return [
        { name: 'claw', geometry: new SphereGeometry(r * 0.35, 12, 12), color: c, position: [-r * 1.05, r * 0.3, 0] },
        { name: 'claw', geometry: new SphereGeometry(r * 0.35, 12, 12), color: c, position: [r * 1.05, r * 0.3, 0] },
      ];
    case 'octopus':
      return [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75].map((k) => ({
        name: 'tentacle',
        geometry: new CylinderGeometry(r * 0.09, r * 0.05, r * 0.8, 8),
        color: c,
        position: [r * k, -r * 0.6, 0] as const,
      }));
    case 'penguin':
      return [
        { name: 'belly', geometry: new SphereGeometry(r * 0.72, 20, 20), color: c, position: [0, -r * 0.1, r * 0.35] },
        { name: 'beak', geometry: new ConeGeometry(r * 0.15, r * 0.35, 10), color: 0xf5a623, position: [0, r * 0.05, r * 1.0], rotation: [Math.PI / 2, 0, 0] },
      ];
    case 'seal':
      return [
        { name: 'flipper', geometry: new ConeGeometry(r * 0.3, r * 0.7, 10), color: c, position: [-r * 1.0, -r * 0.4, 0], rotation: [0, 0, Math.PI / 2.4] },
        { name: 'flipper', geometry: new ConeGeometry(r * 0.3, r * 0.7, 10), color: c, position: [r * 1.0, -r * 0.4, 0], rotation: [0, 0, -Math.PI / 2.4] },
        { name: 'nose', geometry: new SphereGeometry(r * 0.12, 10, 10), color: EYE_COLOR, position: [0, -r * 0.05, r * 0.98] },
      ];
    case 'dolphin':
      return [
        { name: 'fin', geometry: new ConeGeometry(r * 0.3, r * 0.6, 10), color: c, position: [0, r * 1.05, 0] },
        { name: 'snout', geometry: new ConeGeometry(r * 0.3, r * 0.6, 12), color: c, position: [r * 1.05, -r * 0.1, 0], rotation: [0, 0, -Math.PI / 2] },
      ];
    case 'shark':
      return [
        { name: 'fin', geometry: new ConeGeometry(r * 0.4, r * 0.7, 4), color: c, position: [0, r * 1.05, 0] },
        { name: 'tail', geometry: new ConeGeometry(r * 0.35, r * 0.6, 4), color: c, position: [-r * 1.1, 0, 0], rotation: [0, 0, Math.PI / 2] },
        { name: 'snout', geometry: new ConeGeometry(r * 0.35, r * 0.5, 12), color: c, position: [r * 1.05, -r * 0.1, 0], rotation: [0, 0, -Math.PI / 2] },
      ];
    case 'whale':
      return [
        { name: 'tail', geometry: new ConeGeometry(r * 0.45, r * 0.6, 4), color: c, position: [-r * 1.1, r * 0.1, 0], rotation: [0, 0, Math.PI / 2] },
        { name: 'belly', geometry: new SphereGeometry(r * 0.8, 20, 20), color: 0xdfe9f5, position: [0, -r * 0.25, r * 0.3] },
        { name: 'spout', geometry: new CylinderGeometry(r * 0.05, r * 0.12, r * 0.5, 8), color: 0xbfe6ff, position: [r * 0.2, r * 1.15, 0] },
      ];
  }
}

export class CreatureMeshFactory {
  private readonly bodyGeometries = new Map<TierId, SphereGeometry>();
  private readonly partsByTier = new Map<TierId, readonly Part[]>();
  private readonly materials = new Map<number, MeshToonMaterial>();
  private readonly ghostMaterials = new Map<number, MeshToonMaterial>();

  private bodyGeometry(tier: TierId): SphereGeometry {
    let g = this.bodyGeometries.get(tier);
    if (g === undefined) {
      g = new SphereGeometry(tierDef(tier).radius, 32, 24);
      this.bodyGeometries.set(tier, g);
    }
    return g;
  }

  // 付属パーツ（目・ヒレ・触手）のジオメトリは tier ごとに 1 回だけ作って共有する。
  private parts(tier: TierId): readonly Part[] {
    let p = this.partsByTier.get(tier);
    if (p === undefined) {
      const def = tierDef(tier);
      p = [...appendages(def.shape, def), ...eyes(def.radius)];
      this.partsByTier.set(tier, p);
    }
    return p;
  }

  private material(color: number, ghost: boolean): MeshToonMaterial {
    const cache = ghost ? this.ghostMaterials : this.materials;
    let m = cache.get(color);
    if (m === undefined) {
      m = ghost
        ? new MeshToonMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })
        : new MeshToonMaterial({ color });
      cache.set(color, m);
    }
    return m;
  }

  private build(tier: TierId, ghost: boolean): Group {
    const def = tierDef(tier);
    const group = new Group();
    const body = new Mesh(this.bodyGeometry(tier), this.material(def.baseColor, ghost));
    body.name = 'body';
    group.add(body);
    const parts = ghost ? [] : this.parts(tier);
    for (const p of parts) {
      const mesh = new Mesh(p.geometry, this.material(p.color, ghost));
      mesh.name = p.name;
      mesh.position.set(p.position[0], p.position[1], p.position[2]);
      if (p.rotation !== undefined) mesh.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
      group.add(mesh);
    }
    return group;
  }

  createCreature(tier: TierId): Group {
    return this.build(tier, false);
  }

  createGhost(tier: TierId): Group {
    return this.build(tier, true);
  }

  dispose(): void {
    for (const g of this.bodyGeometries.values()) g.dispose();
    for (const parts of this.partsByTier.values()) for (const p of parts) p.geometry.dispose();
    this.partsByTier.clear();
    for (const m of this.materials.values()) m.dispose();
    for (const m of this.ghostMaterials.values()) m.dispose();
    this.bodyGeometries.clear();
    this.materials.clear();
    this.ghostMaterials.clear();
  }
}
