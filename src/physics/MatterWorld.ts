import { Bodies, Body, Composite, Engine, Events } from 'matter-js';
import type { IEventCollision } from 'matter-js';
import { BOX, tierDef } from '../core/tiers';
import type { BodyId, BodyState, ContactPair, TierId, Vec2 } from '../core/types';
import type { PhysicsWorld } from './PhysicsWorld';

export const UNIT_TO_PX = 50;
const WALL_THICKNESS_PX = 200;

export function toMatter(p: Vec2): Vec2 {
  return { x: (p.x + BOX.width / 2) * UNIT_TO_PX, y: (BOX.height - p.y) * UNIT_TO_PX };
}

export function fromMatter(p: Vec2): Vec2 {
  return { x: p.x / UNIT_TO_PX - BOX.width / 2, y: BOX.height - p.y / UNIT_TO_PX };
}

// Matter の速度は px/step（1 step = 16.666 ms）。ユニット/秒へ換算する。
const STEP_MS = 1000 / 60;
function velocityFromMatter(v: Vec2): Vec2 {
  const perSec = 1000 / STEP_MS;
  return { x: (v.x / UNIT_TO_PX) * perSec, y: (-v.y / UNIT_TO_PX) * perSec };
}
function velocityToMatter(v: Vec2): Vec2 {
  const perStep = STEP_MS / 1000;
  return { x: v.x * UNIT_TO_PX * perStep, y: -v.y * UNIT_TO_PX * perStep };
}

interface Tracked {
  readonly id: BodyId;
  readonly tier: TierId;
  readonly body: Body;
}

export class MatterWorld implements PhysicsWorld {
  private readonly engine: Engine;
  private readonly tracked = new Map<BodyId, Tracked>();
  private readonly byMatterId = new Map<number, BodyId>();
  private pendingContacts: ContactPair[] = [];
  private nextId: BodyId = 1;

  constructor() {
    this.engine = Engine.create({ positionIterations: 8, velocityIterations: 6 });
    this.engine.gravity.y = 1;
    const w = BOX.width * UNIT_TO_PX;
    const h = BOX.height * UNIT_TO_PX;
    const t = WALL_THICKNESS_PX;
    const walls = [
      Bodies.rectangle(w / 2, h + t / 2, w + 2 * t, t, { isStatic: true, label: 'floor' }),
      Bodies.rectangle(-t / 2, h / 2 - t, t, h + 4 * t, { isStatic: true, label: 'wall' }),
      Bodies.rectangle(w + t / 2, h / 2 - t, t, h + 4 * t, { isStatic: true, label: 'wall' }),
    ];
    Composite.add(this.engine.world, walls);
    Events.on(this.engine, 'collisionStart', (ev: IEventCollision<Engine>) => {
      for (const pair of ev.pairs) {
        const a = this.byMatterId.get(pair.bodyA.id);
        const b = this.byMatterId.get(pair.bodyB.id);
        if (a !== undefined && b !== undefined) this.pendingContacts.push({ a, b });
      }
    });
  }

  addBody(tier: TierId, position: Vec2, velocity: Vec2 = { x: 0, y: 0 }, angle = 0): BodyId {
    const id = this.nextId++;
    const m = toMatter(position);
    const body = Bodies.circle(m.x, m.y, tierDef(tier).radius * UNIT_TO_PX, {
      restitution: 0.1,
      friction: 0.3,
      frictionStatic: 0.5,
      density: 0.002,
      label: `creature-${tier}`,
    });
    Body.setAngle(body, -angle);
    Body.setVelocity(body, velocityToMatter(velocity));
    Composite.add(this.engine.world, body);
    this.tracked.set(id, { id, tier, body });
    this.byMatterId.set(body.id, id);
    return id;
  }

  removeBody(id: BodyId): void {
    const t = this.tracked.get(id);
    if (t === undefined) return;
    Composite.remove(this.engine.world, t.body);
    this.tracked.delete(id);
    this.byMatterId.delete(t.body.id);
  }

  step(dtSec: number): readonly ContactPair[] {
    this.pendingContacts = [];
    Engine.update(this.engine, dtSec * 1000);
    return this.pendingContacts;
  }

  getBodies(): readonly BodyState[] {
    return [...this.tracked.values()].map((t) => this.toState(t));
  }

  getBody(id: BodyId): BodyState | undefined {
    const t = this.tracked.get(id);
    return t === undefined ? undefined : this.toState(t);
  }

  clear(): void {
    for (const id of [...this.tracked.keys()]) this.removeBody(id);
  }

  private toState(t: Tracked): BodyState {
    return {
      id: t.id,
      tier: t.tier,
      position: fromMatter(t.body.position),
      velocity: velocityFromMatter(t.body.velocity),
      angle: -t.body.angle,
    };
  }
}
