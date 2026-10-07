import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { CreatureShape, TierDef } from '../core/tiers';
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';
import { PALETTE } from './palette';

// gloss: ソフビのツヤ / jelly: 半透明の体 / eye: 黒目 / shine: 目のハイライト / blush: ほっぺ
export type MaterialKind = 'gloss' | 'jelly' | 'eye' | 'shine' | 'blush';

type Vec3 = readonly [number, number, number];

interface Part {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly kind: MaterialKind;
  readonly position: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: Vec3;
}

interface Face {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeSize: number;
  // 球面から離れた位置に目を置く場合（カニの目玉）の z。
  readonly eyeZ?: number;
  readonly mouth: 'smile' | 'omega' | 'pout' | 'none';
  readonly mouthY: number;
}

const EYE_COLOR = 0x15233a;
const WHITE = 0xfdfdf8;
const ORANGE = 0xff9b3d;

const DEFAULT_FACE: Face = { eyeX: 0.32, eyeY: 0.12, eyeSize: 0.13, mouth: 'smile', mouthY: -0.12 };

const FACES: Readonly<Record<CreatureShape, Partial<Face>>> = {
  plankton: { eyeSize: 0.17, eyeY: 0.06, eyeX: 0.3, mouthY: -0.22 },
  seaAngel: { eyeY: 0.3, eyeSize: 0.12, mouthY: 0.08 },
  jellyfish: { eyeY: 0.18, mouthY: -0.04 },
  pufferfish: { eyeSize: 0.14, eyeY: 0.16, mouth: 'pout', mouthY: -0.12 },
  crab: { eyeX: 0.27, eyeY: 0.98, eyeZ: 0.22, eyeSize: 0.16, mouthY: 0.1 },
  octopus: { eyeSize: 0.15, eyeY: 0.02, mouth: 'pout', mouthY: -0.3 },
  penguin: { eyeY: 0.22, eyeX: 0.3, mouth: 'none' },
  seal: { eyeY: 0.2, eyeX: 0.34, eyeSize: 0.14, mouth: 'omega', mouthY: -0.3 },
  dolphin: { eyeY: 0.22, eyeX: 0.36, mouthY: -0.36 },
  shark: { eyeY: 0.24, eyeX: 0.4, mouthY: -0.16 },
  whale: { eyeY: 0.06, eyeX: 0.42, eyeSize: 0.11, mouthY: -0.18 },
};

const JELLY_BODIES: ReadonlySet<CreatureShape> = new Set<CreatureShape>(['seaAngel', 'jellyfish']);

// 球の手前側の表面上の点。lift で外側へ浮かせる。
function surf(r: number, x: number, y: number, lift = 0): Vec3 {
  const z = Math.sqrt(Math.max(r * r - x * x - y * y, 0));
  const len = Math.hypot(x, y, z);
  const k = len === 0 ? 1 : (len + lift) / len;
  return [x * k, y * k, z * k];
}

// +z を向いた平らなパーツを、球面の法線方向へ向ける回転（XYZ 順）。
function facing(p: Vec3, roll = 0): Vec3 {
  const len = Math.hypot(p[0], p[1], p[2]);
  const nx = p[0] / len;
  const ny = p[1] / len;
  const ry = Math.asin(nx);
  const cy = Math.cos(ry);
  const rx = cy === 0 ? 0 : -Math.asin(Math.max(-1, Math.min(1, ny / cy)));
  return [rx, ry, roll];
}

function tube(points: readonly Vec3[], radius: number): TubeGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p[0], p[1], p[2])));
  return new TubeGeometry(curve, 20, radius, 8, false);
}

function faceParts(shape: CreatureShape, r: number): Part[] {
  const f: Face = { ...DEFAULT_FACE, ...FACES[shape] };
  const er = r * f.eyeSize;
  const eyeGeom = new SphereGeometry(er, 18, 14);
  const shineGeom = new SphereGeometry(er * 0.36, 10, 8);
  const sparkGeom = new SphereGeometry(er * 0.16, 8, 6);
  const parts: Part[] = [];
  for (const side of [-1, 1] as const) {
    const x = side * f.eyeX * r;
    const y = f.eyeY * r;
    const pos: Vec3 = f.eyeZ === undefined ? surf(r, x, y, -er * 0.25) : [x, y, f.eyeZ * r];
    const rot = facing(f.eyeZ === undefined ? pos : [x * 0.3, 0, 1]);
    parts.push({ name: 'eye', geometry: eyeGeom, color: EYE_COLOR, kind: 'eye', position: pos, rotation: rot, scale: [1, 1.1, 0.6] });
    parts.push({ name: 'eyeShine', geometry: shineGeom, color: WHITE, kind: 'shine', position: [pos[0] - er * 0.32, pos[1] + er * 0.38, pos[2] + er * 0.42] });
    parts.push({ name: 'eyeShine', geometry: sparkGeom, color: WHITE, kind: 'shine', position: [pos[0] + er * 0.3, pos[1] - er * 0.35, pos[2] + er * 0.45] });
  }

  const cheekGeom = new CircleGeometry(r * 0.11, 20);
  const cheekY = (f.eyeZ === undefined ? f.eyeY : 0.1) * r - r * 0.17;
  for (const side of [-1, 1] as const) {
    const pos = surf(r, side * (f.eyeX + 0.14) * r, cheekY, r * 0.012);
    parts.push({ name: 'cheek', geometry: cheekGeom, color: PALETTE.blush, kind: 'blush', position: pos, rotation: facing(pos), scale: [1, 0.62, 1] });
  }

  const my = f.mouthY * r;
  switch (f.mouth) {
    case 'smile': {
      const pos = surf(r, 0, my, r * 0.005);
      const rot = facing(pos, Math.PI);
      parts.push({ name: 'mouth', geometry: new TorusGeometry(r * 0.075, r * 0.02, 6, 16, Math.PI), color: EYE_COLOR, kind: 'eye', position: pos, rotation: rot });
      break;
    }
    case 'omega': {
      const g = new TorusGeometry(r * 0.055, r * 0.017, 6, 14, Math.PI);
      for (const side of [-1, 1] as const) {
        const pos = surf(r, side * r * 0.055, my, r * 0.005);
        parts.push({ name: 'mouth', geometry: g, color: EYE_COLOR, kind: 'eye', position: pos, rotation: facing(pos, Math.PI) });
      }
      break;
    }
    case 'pout': {
      const pos = surf(r, 0, my, r * 0.01);
      parts.push({ name: 'mouth', geometry: new TorusGeometry(r * 0.045, r * 0.022, 8, 16), color: 0xd94f6e, kind: 'gloss', position: pos, rotation: facing(pos), scale: [1, 0.8, 1] });
      break;
    }
    case 'none':
      break;
  }
  return parts;
}

function appendages(shape: CreatureShape, def: TierDef): Part[] {
  const r = def.radius;
  const c = def.accentColor;
  const b = def.baseColor;
  switch (shape) {
    case 'plankton': {
      const leaf = new SphereGeometry(r * 0.3, 14, 10);
      return [
        { name: 'leaf', geometry: leaf, color: c, kind: 'gloss', position: [-r * 0.2, r * 1.08, 0], rotation: [0, 0, 0.7], scale: [1, 0.42, 0.6] },
        { name: 'leaf', geometry: leaf, color: c, kind: 'gloss', position: [r * 0.2, r * 1.08, 0], rotation: [0, 0, -0.7], scale: [1, 0.42, 0.6] },
      ];
    }
    case 'seaAngel': {
      const wing = new SphereGeometry(r * 0.38, 16, 12);
      return [
        { name: 'heart', geometry: new SphereGeometry(r * 0.22, 14, 10), color: ORANGE, kind: 'gloss', position: [0, -r * 0.45, -r * 0.1] },
        { name: 'wing', geometry: wing, color: c, kind: 'jelly', position: [-r * 1.02, -r * 0.05, 0], rotation: [0, 0, 0.45], scale: [1, 0.48, 0.32] },
        { name: 'wing', geometry: wing, color: c, kind: 'jelly', position: [r * 1.02, -r * 0.05, 0], rotation: [0, 0, -0.45], scale: [1, 0.48, 0.32] },
        { name: 'tuft', geometry: new SphereGeometry(r * 0.2, 12, 10), color: c, kind: 'jelly', position: [0, r * 1.02, 0], scale: [1.4, 0.8, 0.8] },
      ];
    }
    case 'jellyfish': {
      const parts: Part[] = [
        { name: 'frill', geometry: new TorusGeometry(r * 0.9, r * 0.14, 10, 36), color: c, kind: 'jelly', position: [0, -r * 0.32, 0], rotation: [Math.PI / 2 - 0.35, 0, 0] },
      ];
      const tentacle = tube(
        [
          [0, 0, 0],
          [r * 0.09, -r * 0.28, 0],
          [-r * 0.07, -r * 0.6, 0],
          [r * 0.06, -r * 0.92, 0],
        ],
        r * 0.055,
      );
      for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
        parts.push({ name: 'tentacle', geometry: tentacle, color: c, kind: 'jelly', position: [r * k, -r * 0.52, r * 0.1] });
      }
      return parts;
    }
    case 'pufferfish': {
      const spike = new ConeGeometry(r * 0.075, r * 0.24, 6);
      const parts: Part[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.1;
        parts.push({ name: 'spike', geometry: spike, color: c, kind: 'gloss', position: [Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, 0], rotation: [0, 0, a - Math.PI / 2] });
      }
      const fin = new SphereGeometry(r * 0.22, 12, 10);
      parts.push(
        { name: 'belly', geometry: new SphereGeometry(r * 0.72, 22, 16), color: 0xfff4d6, kind: 'gloss', position: [0, -r * 0.38, r * 0.6], scale: [1, 0.7, 0.5] },
        { name: 'fin', geometry: fin, color: c, kind: 'gloss', position: [-r * 0.98, -r * 0.1, r * 0.3], rotation: [0, 0, 0.4], scale: [1, 0.55, 0.4] },
        { name: 'fin', geometry: fin, color: c, kind: 'gloss', position: [r * 0.98, -r * 0.1, r * 0.3], rotation: [0, 0, -0.4], scale: [1, 0.55, 0.4] },
      );
      return parts;
    }
    case 'crab': {
      const claw = new SphereGeometry(r * 0.3, 16, 12);
      const pincer = new SphereGeometry(r * 0.16, 12, 10);
      const leg = new CylinderGeometry(r * 0.06, r * 0.045, r * 0.38, 8);
      const stalk = new CylinderGeometry(r * 0.05, r * 0.06, r * 0.3, 8);
      const parts: Part[] = [
        { name: 'stalk', geometry: stalk, color: b, kind: 'gloss', position: [-r * 0.27, r * 0.82, r * 0.22] },
        { name: 'stalk', geometry: stalk, color: b, kind: 'gloss', position: [r * 0.27, r * 0.82, r * 0.22] },
        { name: 'claw', geometry: claw, color: c, kind: 'gloss', position: [-r * 1.08, r * 0.22, r * 0.1], scale: [1, 0.9, 0.8] },
        { name: 'claw', geometry: claw, color: c, kind: 'gloss', position: [r * 1.08, r * 0.22, r * 0.1], scale: [1, 0.9, 0.8] },
        { name: 'pincer', geometry: pincer, color: c, kind: 'gloss', position: [-r * 1.18, r * 0.52, r * 0.1], rotation: [0, 0, -0.5], scale: [0.7, 1, 0.7] },
        { name: 'pincer', geometry: pincer, color: c, kind: 'gloss', position: [r * 1.18, r * 0.52, r * 0.1], rotation: [0, 0, 0.5], scale: [0.7, 1, 0.7] },
      ];
      for (const side of [-1, 1] as const) {
        for (const [y, tilt] of [
          [-0.3, 1.25],
          [-0.55, 0.95],
          [-0.78, 0.65],
        ] as const) {
          parts.push({ name: 'leg', geometry: leg, color: c, kind: 'gloss', position: [side * r * 0.95, r * y, 0], rotation: [0, 0, -side * tilt] });
        }
      }
      return parts;
    }
    case 'octopus': {
      const parts: Part[] = [];
      // 体の下から短くぷっくり出て、先だけ外へくるんと反る足。
      for (const k of [-0.7, -0.42, -0.14, 0.14, 0.42, 0.7]) {
        const s = Math.sign(k);
        const spread = Math.abs(k);
        const g = tube(
          [
            [0, r * 0.15, 0],
            [s * r * 0.04, -r * 0.12, 0],
            [s * r * (0.08 + spread * 0.1), -r * 0.3, 0],
            [s * r * (0.2 + spread * 0.12), -r * 0.36, 0],
          ],
          r * 0.12,
        );
        parts.push({ name: 'tentacle', geometry: g, color: c, kind: 'gloss', position: [r * k * 0.85, -r * 0.7, r * 0.35 * (1 - spread)] });
      }
      const spot = new CircleGeometry(r * 0.09, 16);
      for (const [x, y] of [
        [-0.45, 0.62],
        [0.2, 0.78],
        [0.55, 0.5],
      ] as const) {
        const pos = surf(r, x * r, y * r, r * 0.01);
        parts.push({ name: 'spot', geometry: spot, color: 0xffc2de, kind: 'blush', position: pos, rotation: facing(pos) });
      }
      return parts;
    }
    case 'penguin': {
      const flipper = new SphereGeometry(r * 0.34, 14, 10);
      const foot = new SphereGeometry(r * 0.16, 12, 8);
      return [
        { name: 'belly', geometry: new SphereGeometry(r * 0.75, 24, 18), color: c, kind: 'gloss', position: [0, r * 0.02, r * 0.5], scale: [1.02, 1.22, 0.6] },
        { name: 'beak', geometry: new ConeGeometry(r * 0.1, r * 0.22, 12), color: ORANGE, kind: 'gloss', position: [0, r * 0.06, r * 0.98], rotation: [Math.PI / 2 + 0.3, 0, 0] },
        { name: 'flipper', geometry: flipper, color: b, kind: 'gloss', position: [-r * 0.98, -r * 0.12, 0], rotation: [0, 0, -0.45], scale: [0.4, 1, 0.5] },
        { name: 'flipper', geometry: flipper, color: b, kind: 'gloss', position: [r * 0.98, -r * 0.12, 0], rotation: [0, 0, 0.45], scale: [0.4, 1, 0.5] },
        { name: 'foot', geometry: foot, color: ORANGE, kind: 'gloss', position: [-r * 0.3, -r * 0.98, r * 0.32], scale: [1.2, 0.45, 1] },
        { name: 'foot', geometry: foot, color: ORANGE, kind: 'gloss', position: [r * 0.3, -r * 0.98, r * 0.32], scale: [1.2, 0.45, 1] },
      ];
    }
    case 'seal': {
      const muzzle = new SphereGeometry(r * 0.15, 14, 10);
      const flipper = new SphereGeometry(r * 0.3, 14, 10);
      const whisker = new CylinderGeometry(r * 0.012, r * 0.012, r * 0.3, 5);
      const parts: Part[] = [
        { name: 'muzzle', geometry: muzzle, color: 0xeef1f5, kind: 'gloss', position: surf(r, -r * 0.11, -r * 0.14, -r * 0.05), scale: [1, 0.85, 0.8] },
        { name: 'muzzle', geometry: muzzle, color: 0xeef1f5, kind: 'gloss', position: surf(r, r * 0.11, -r * 0.14, -r * 0.05), scale: [1, 0.85, 0.8] },
        { name: 'nose', geometry: new SphereGeometry(r * 0.075, 12, 8), color: EYE_COLOR, kind: 'eye', position: surf(r, 0, -r * 0.04, r * 0.02), scale: [1.3, 0.9, 0.8] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [-r * 0.98, -r * 0.42, r * 0.1], rotation: [0, 0, 1.0], scale: [1, 0.45, 0.5] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [r * 0.98, -r * 0.42, r * 0.1], rotation: [0, 0, -1.0], scale: [1, 0.45, 0.5] },
      ];
      for (const side of [-1, 1] as const) {
        for (const tilt of [0.12, -0.12]) {
          parts.push({
            name: 'whisker',
            geometry: whisker,
            color: 0x5a6472,
            kind: 'eye',
            position: surf(r, side * r * 0.36, -r * 0.15 + tilt * r * 0.4, r * 0.01),
            rotation: [0, 0, Math.PI / 2 + side * tilt],
          });
        }
      }
      return parts;
    }
    case 'dolphin': {
      const flipper = new SphereGeometry(r * 0.3, 14, 10);
      return [
        { name: 'belly', geometry: new SphereGeometry(r * 0.72, 22, 16), color: 0xd8efff, kind: 'gloss', position: [0, -r * 0.4, r * 0.55], scale: [1, 0.7, 0.5] },
        { name: 'snout', geometry: new SphereGeometry(r * 0.24, 16, 12), color: 0xd8efff, kind: 'gloss', position: surf(r, 0, -r * 0.18, -r * 0.08), scale: [1.25, 0.8, 1] },
        { name: 'fin', geometry: new ConeGeometry(r * 0.26, r * 0.5, 14), color: c, kind: 'gloss', position: [-r * 0.1, r * 1.12, -r * 0.1], rotation: [0, 0, 0.4] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [-r * 0.98, -r * 0.3, r * 0.15], rotation: [0, 0, 0.9], scale: [1, 0.42, 0.45] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [r * 0.98, -r * 0.3, r * 0.15], rotation: [0, 0, -0.9], scale: [1, 0.42, 0.45] },
      ];
    }
    case 'shark': {
      const flipper = new SphereGeometry(r * 0.32, 14, 10);
      const tooth = new ConeGeometry(r * 0.035, r * 0.07, 6);
      const toothY = -r * 0.16 - r * 0.075;
      const gill = new CylinderGeometry(r * 0.018, r * 0.018, r * 0.2, 6);
      const gills: Part[] = [];
      for (const side of [-1, 1] as const) {
        for (const dx of [0, 0.09, 0.18]) {
          gills.push({ name: 'gill', geometry: gill, color: c, kind: 'eye', position: surf(r, side * r * (0.62 + dx), r * 0.02, r * 0.005), rotation: [0, 0, side * 0.15] });
        }
      }
      return [
        ...gills,
        { name: 'belly', geometry: new SphereGeometry(r * 0.75, 22, 16), color: 0xf2f5f8, kind: 'gloss', position: [0, -r * 0.42, r * 0.55], scale: [1.05, 0.7, 0.5] },
        { name: 'fin', geometry: new ConeGeometry(r * 0.36, r * 0.62, 4), color: c, kind: 'gloss', position: [-r * 0.12, r * 1.1, r * 0.15], rotation: [0, Math.PI / 4, 0.3], scale: [1, 1, 0.45] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [-r * 0.98, -r * 0.35, r * 0.1], rotation: [0, 0, 0.8], scale: [1, 0.4, 0.45] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [r * 0.98, -r * 0.35, r * 0.1], rotation: [0, 0, -0.8], scale: [1, 0.4, 0.45] },
        { name: 'tooth', geometry: tooth, color: WHITE, kind: 'gloss', position: surf(r, -r * 0.035, toothY, -r * 0.01), rotation: [0, 0, Math.PI] },
        { name: 'tooth', geometry: tooth, color: WHITE, kind: 'gloss', position: surf(r, r * 0.035, toothY, -r * 0.01), rotation: [0, 0, Math.PI] },
      ];
    }
    case 'whale': {
      const fluke = new SphereGeometry(r * 0.3, 14, 10);
      const drop = new SphereGeometry(r * 0.09, 10, 8);
      const flipper = new SphereGeometry(r * 0.3, 14, 10);
      return [
        { name: 'belly', geometry: new SphereGeometry(r * 0.8, 24, 18), color: 0xdfe9f5, kind: 'gloss', position: [0, -r * 0.45, r * 0.48], scale: [1.05, 0.62, 0.55] },
        { name: 'tail', geometry: fluke, color: c, kind: 'gloss', position: [r * 0.82, r * 0.82, -r * 0.45], rotation: [0, 0, 0.9], scale: [1, 0.4, 0.4] },
        { name: 'tail', geometry: fluke, color: c, kind: 'gloss', position: [r * 1.08, r * 0.62, -r * 0.45], rotation: [0, 0, -0.3], scale: [1, 0.4, 0.4] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [-r * 0.98, -r * 0.35, r * 0.15], rotation: [0, 0, 0.9], scale: [1, 0.4, 0.45] },
        { name: 'flipper', geometry: flipper, color: c, kind: 'gloss', position: [r * 0.98, -r * 0.35, r * 0.15], rotation: [0, 0, -0.9], scale: [1, 0.4, 0.45] },
        { name: 'spout', geometry: drop, color: 0xbfeaff, kind: 'jelly', position: [0, r * 1.18, 0] },
        { name: 'spout', geometry: drop, color: 0xbfeaff, kind: 'jelly', position: [-r * 0.2, r * 1.3, 0], scale: [0.8, 0.8, 0.8] },
        { name: 'spout', geometry: drop, color: 0xbfeaff, kind: 'jelly', position: [r * 0.2, r * 1.3, 0], scale: [0.8, 0.8, 0.8] },
      ];
    }
  }
}

const GHOST_OPACITY = 0.75;

export class CreatureMeshFactory {
  private readonly bodyGeometries = new Map<TierId, SphereGeometry>();
  private readonly partsByTier = new Map<TierId, readonly Part[]>();
  private readonly materials = new Map<string, Material>();

  private bodyGeometry(tier: TierId): SphereGeometry {
    let g = this.bodyGeometries.get(tier);
    if (g === undefined) {
      g = new SphereGeometry(tierDef(tier).radius, 40, 28);
      this.bodyGeometries.set(tier, g);
    }
    return g;
  }

  // 付属パーツ（顔・ヒレ・触手）のジオメトリは tier ごとに 1 回だけ作って共有する。
  private parts(tier: TierId): readonly Part[] {
    let p = this.partsByTier.get(tier);
    if (p === undefined) {
      const def = tierDef(tier);
      p = [...appendages(def.shape, def), ...faceParts(def.shape, def.radius)];
      this.partsByTier.set(tier, p);
    }
    return p;
  }

  private material(kind: MaterialKind, color: number, ghost: boolean): Material {
    const key = `${kind}:${color}:${ghost ? 'g' : 's'}`;
    let m = this.materials.get(key);
    if (m === undefined) {
      m = createMaterial(kind, color);
      if (ghost) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity, GHOST_OPACITY);
        m.depthWrite = false;
      }
      this.materials.set(key, m);
    }
    return m;
  }

  private build(tier: TierId, ghost: boolean): Group {
    const def = tierDef(tier);
    const group = new Group();
    const bodyKind: MaterialKind = JELLY_BODIES.has(def.shape) ? 'jelly' : 'gloss';
    const body = new Mesh(this.bodyGeometry(tier), this.material(bodyKind, def.baseColor, ghost));
    body.name = 'body';
    body.renderOrder = 1;
    group.add(body);
    for (const p of this.parts(tier)) {
      const mesh = new Mesh(p.geometry, this.material(p.kind, p.color, ghost));
      mesh.name = p.name;
      mesh.position.set(p.position[0], p.position[1], p.position[2]);
      if (p.rotation !== undefined) mesh.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
      if (p.scale !== undefined) mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
      if (p.kind === 'shine' || p.kind === 'blush') mesh.renderOrder = 2;
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
    const seen = new Set<BufferGeometry>();
    for (const parts of this.partsByTier.values()) for (const p of parts) seen.add(p.geometry);
    for (const g of seen) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.bodyGeometries.clear();
    this.partsByTier.clear();
    this.materials.clear();
  }
}

function createMaterial(kind: MaterialKind, color: number): Material {
  switch (kind) {
    case 'gloss':
      return new MeshPhysicalMaterial({
        color,
        roughness: 0.42,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        sheen: 0.5,
        sheenColor: 0xffffff,
        sheenRoughness: 0.5,
      });
    case 'jelly':
      return new MeshPhysicalMaterial({
        color,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0.8,
        emissive: color,
        emissiveIntensity: 0.18,
      });
    case 'eye':
      return new MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02 });
    case 'shine':
      return new MeshBasicMaterial({ color });
    case 'blush':
      return new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false });
  }
}
