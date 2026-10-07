import type { BodyId, BodyState, ContactPair, TierId, Vec2 } from '../core/types';

export interface PhysicsWorld {
  addBody(tier: TierId, position: Vec2, velocity?: Vec2, angle?: number): BodyId;
  removeBody(id: BodyId): void;
  step(dtSec: number): readonly ContactPair[];
  getBodies(): readonly BodyState[];
  getBody(id: BodyId): BodyState | undefined;
  clear(): void;
}
