import { describe, expect, it } from 'vitest';
import { SAVE_SIZE_LIMIT_BYTES, createEmptySave, parseSave, serializeSave } from './save';
import type { SaveData, SnapshotBody } from './save';
import type { TierId } from './types';

describe('save round trip', () => {
  it('serializes and parses an empty save', () => {
    const s = createEmptySave();
    expect(s).toEqual({ v: 1, bestScore: 0, snapshot: null });
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it('serializes and parses a snapshot', () => {
    const s: SaveData = {
      v: 1,
      bestScore: 120,
      snapshot: { score: 40, currentTier: 1, nextTier: 2, bodies: [{ t: 3, x: -1.25, y: 0.82, a: 0.5 }] },
    };
    expect(parseSave(serializeSave(s))).toEqual(s);
  });
});

describe('legacy snapshot', () => {
  it('treats the held tier of a snapshot without currentTier as both current and next', () => {
    const raw = JSON.stringify({ v: 1, bestScore: 0, snapshot: { score: 5, nextTier: 3, bodies: [] } });
    expect(parseSave(raw)?.snapshot).toEqual({ score: 5, currentTier: 3, nextTier: 3, bodies: [] });
  });
});

describe('parseSave rejects garbage without throwing', () => {
  it.each(['', 'not json', '[]', 'null', '42', '{"v":999}', '{"v":1}', '{"v":1,"bestScore":"x","snapshot":null}'])(
    'returns null for %j',
    (raw) => {
      expect(parseSave(raw)).toBeNull();
    },
  );

  it('returns null when a snapshot body has an invalid tier', () => {
    const raw = JSON.stringify({ v: 1, bestScore: 0, snapshot: { score: 0, currentTier: 0, nextTier: 0, bodies: [{ t: 11, x: 0, y: 0, a: 0 }] } });
    expect(parseSave(raw)).toBeNull();
  });

  it('returns null when nextTier is not droppable', () => {
    const raw = JSON.stringify({ v: 1, bestScore: 0, snapshot: { score: 0, currentTier: 9, nextTier: 9, bodies: [] } });
    expect(parseSave(raw)).toBeNull();
  });

  it('returns null when currentTier is not droppable', () => {
    const raw = JSON.stringify({ v: 1, bestScore: 0, snapshot: { score: 0, currentTier: 9, nextTier: 0, bodies: [] } });
    expect(parseSave(raw)).toBeNull();
  });

  it('clamps negative or non-finite bestScore to 0', () => {
    expect(parseSave('{"v":1,"bestScore":-5,"snapshot":null}')?.bestScore).toBe(0);
  });
});

describe('size', () => {
  it('keeps 200 bodies under the 64 KiB flush limit', () => {
    const bodies: SnapshotBody[] = Array.from({ length: 200 }, (_, i) => ({ t: (i % 11) as TierId, x: -4.123456, y: 12.123456, a: 3.141592 }));
    const s: SaveData = { v: 1, bestScore: 999999, snapshot: { score: 123456, currentTier: 4, nextTier: 4, bodies } };
    const bytes = new TextEncoder().encode(serializeSave(s)).length;
    expect(bytes).toBeLessThan(SAVE_SIZE_LIMIT_BYTES);
    expect(bytes).toBeLessThan(12 * 1024);
  });

  it('rounds coordinates to 3 decimals to save space', () => {
    const s: SaveData = { v: 1, bestScore: 0, snapshot: { score: 0, currentTier: 0, nextTier: 0, bodies: [{ t: 0, x: 1.23456789, y: 2.34567891, a: 3.45678912 }] } };
    const parsed = parseSave(serializeSave(s));
    expect(parsed?.snapshot?.bodies[0]).toEqual({ t: 0, x: 1.235, y: 2.346, a: 3.457 });
  });
});
