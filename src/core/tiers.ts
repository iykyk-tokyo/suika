import type { TierId } from './types';

export type CreatureShape =
  | 'plankton'
  | 'seaAngel'
  | 'jellyfish'
  | 'pufferfish'
  | 'crab'
  | 'octopus'
  | 'penguin'
  | 'seal'
  | 'dolphin'
  | 'shark'
  | 'whale';

export interface TierDef {
  readonly id: TierId;
  readonly nameJa: string;
  readonly nameEn: string;
  readonly radius: number;
  readonly mergeScore: number;
  readonly baseColor: number;
  readonly accentColor: number;
  readonly shape: CreatureShape;
}

export const TIERS: readonly TierDef[] = [
  { id: 0, nameJa: 'プランクトン', nameEn: 'Plankton', radius: 0.4, mergeScore: 1, baseColor: 0xb8f2a6, accentColor: 0x6fcf7a, shape: 'plankton' },
  { id: 1, nameJa: 'クリオネ', nameEn: 'Sea Angel', radius: 0.52, mergeScore: 3, baseColor: 0xf6d9ff, accentColor: 0xff8fcf, shape: 'seaAngel' },
  { id: 2, nameJa: 'クラゲ', nameEn: 'Jellyfish', radius: 0.66, mergeScore: 6, baseColor: 0xc7b8ff, accentColor: 0x8a6cff, shape: 'jellyfish' },
  { id: 3, nameJa: 'フグ', nameEn: 'Pufferfish', radius: 0.82, mergeScore: 10, baseColor: 0xffd27a, accentColor: 0xd98f1f, shape: 'pufferfish' },
  { id: 4, nameJa: 'カニ', nameEn: 'Crab', radius: 1.0, mergeScore: 15, baseColor: 0xff7a5c, accentColor: 0xc73e22, shape: 'crab' },
  { id: 5, nameJa: 'タコ', nameEn: 'Octopus', radius: 1.2, mergeScore: 21, baseColor: 0xe06ca8, accentColor: 0x9c3b73, shape: 'octopus' },
  { id: 6, nameJa: 'ペンギン', nameEn: 'Penguin', radius: 1.42, mergeScore: 28, baseColor: 0x2c3e50, accentColor: 0xf5f5f5, shape: 'penguin' },
  { id: 7, nameJa: 'アザラシ', nameEn: 'Seal', radius: 1.66, mergeScore: 36, baseColor: 0xb0b8c4, accentColor: 0x6c7684, shape: 'seal' },
  { id: 8, nameJa: 'イルカ', nameEn: 'Dolphin', radius: 1.92, mergeScore: 45, baseColor: 0x5fa8e6, accentColor: 0x2a6fb3, shape: 'dolphin' },
  { id: 9, nameJa: 'サメ', nameEn: 'Shark', radius: 2.18, mergeScore: 55, baseColor: 0x6b7f99, accentColor: 0x3b4b60, shape: 'shark' },
  { id: 10, nameJa: 'クジラ', nameEn: 'Whale', radius: 2.45, mergeScore: 66, baseColor: 0x3156a3, accentColor: 0x1c3566, shape: 'whale' },
];

export const MAX_TIER: TierId = 10;
export const DROPPABLE_TIER_MAX: TierId = 4;

export const BOX = {
  width: 10,
  height: 13,
  dangerY: 11,
  spawnY: 12.2,
} as const;

export function isTierId(n: number): n is TierId {
  return Number.isInteger(n) && n >= 0 && n <= MAX_TIER;
}

export function tierDef(id: TierId): TierDef {
  const def = TIERS[id];
  if (def === undefined) {
    throw new Error(`unknown tier ${id}`);
  }
  return def;
}

export function nextTier(id: TierId): TierId | null {
  const n = id + 1;
  return isTierId(n) ? n : null;
}
