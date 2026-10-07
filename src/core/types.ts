export type TierId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type BodyId = number;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface BodyState {
  readonly id: BodyId;
  readonly tier: TierId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly angle: number;
}

export interface ContactPair {
  readonly a: BodyId;
  readonly b: BodyId;
}

export interface SpawnRequest {
  readonly tier: TierId;
  readonly position: Vec2;
  readonly velocity: Vec2;
}

export interface MergeResult {
  readonly removed: readonly BodyId[];
  readonly spawned: readonly SpawnRequest[];
  readonly scoreDelta: number;
}
