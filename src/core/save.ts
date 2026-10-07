import { DROPPABLE_TIER_MAX, isTierId } from './tiers';
import type { TierId } from './types';

export const SAVE_SIZE_LIMIT_BYTES = 64 * 1024;

export interface SnapshotBody {
  readonly t: TierId;
  readonly x: number;
  readonly y: number;
  readonly a: number;
}

export interface BoardSnapshot {
  readonly score: number;
  readonly nextTier: TierId;
  readonly bodies: readonly SnapshotBody[];
}

export interface SaveDataV1 {
  readonly v: 1;
  readonly bestScore: number;
  readonly snapshot: BoardSnapshot | null;
}

export type SaveData = SaveDataV1;

export function createEmptySave(): SaveData {
  return { v: 1, bestScore: 0, snapshot: null };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function serializeSave(save: SaveData): string {
  const snapshot =
    save.snapshot === null
      ? null
      : {
          score: save.snapshot.score,
          nextTier: save.snapshot.nextTier,
          bodies: save.snapshot.bodies.map((b) => ({ t: b.t, x: round3(b.x), y: round3(b.y), a: round3(b.a) })),
        };
  return JSON.stringify({ v: save.v, bestScore: save.bestScore, snapshot });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseBody(v: unknown): SnapshotBody | null {
  if (!isRecord(v)) return null;
  const { t, x, y, a } = v;
  if (!isFiniteNumber(t) || !isTierId(t)) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(a)) return null;
  return { t, x, y, a };
}

// null = スナップショットなし（正常）、undefined = 形式不正
function parseSnapshot(v: unknown): BoardSnapshot | null | undefined {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  const { score, nextTier, bodies } = v;
  if (!isFiniteNumber(score) || score < 0) return undefined;
  if (!isFiniteNumber(nextTier) || !isTierId(nextTier) || nextTier > DROPPABLE_TIER_MAX) return undefined;
  if (!Array.isArray(bodies)) return undefined;
  const parsed: SnapshotBody[] = [];
  for (const b of bodies) {
    const pb = parseBody(b);
    if (pb === null) return undefined;
    parsed.push(pb);
  }
  return { score, nextTier, bodies: parsed };
}

function parseV1(obj: Record<string, unknown>): SaveData | null {
  const bestScoreRaw = obj['bestScore'];
  if (!isFiniteNumber(bestScoreRaw)) return null;
  const bestScore = Math.max(0, Math.floor(bestScoreRaw));
  if (!('snapshot' in obj)) return null;
  const snapshot = parseSnapshot(obj['snapshot']);
  if (snapshot === undefined) return null;
  return { v: 1, bestScore, snapshot };
}

export function parseSave(raw: string): SaveData | null {
  if (raw.trim() === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data['v']) {
    case 1:
      return parseV1(data);
    default:
      return null;
  }
}
