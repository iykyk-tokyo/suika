import type { Vec2 } from '../core/types';

// 生き物 1 体ぶんの「見た目だけ」の動き。物理の当たり判定には影響しない。

export interface CreaturePose {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly eyeOpen: number;
  readonly time: number;
}

// これ以上の上向き速度変化を「着地の衝撃」とみなす（ユニット/秒）。
export const IMPACT_THRESHOLD = 1.6;

const SPRING_K = 170;
const SPRING_DAMP = 11;
const MAX_SQUASH = 0.24;
const POP_START = 0.45;
const BLINK_SEC = 0.16;
const BREATH = 0.016;

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class CreatureAnimator {
  private time = 0;
  private squash = 0;
  private squashVel = 0;
  private popAge: number;
  private blinkIn: number;
  private blinkAge = -1;
  private blinkCount = 0;
  private prevVy: number | null = null;
  private readonly phase: number;

  constructor(
    private readonly seed: number,
    bornFromMerge: boolean,
    private readonly motion = true,
  ) {
    this.popAge = bornFromMerge && motion ? 0 : -1;
    this.phase = hash(seed) * Math.PI * 2;
    this.blinkIn = 1.2 + hash(seed + 0.5) * 2.8;
  }

  observeVelocity(v: Vec2): void {
    const prev = this.prevVy;
    this.prevVy = v.y;
    if (!this.motion || prev === null) return;
    const dv = v.y - prev;
    if (dv > IMPACT_THRESHOLD) this.impact(Math.min(MAX_SQUASH, dv * 0.03));
  }

  impact(strength: number): void {
    if (!this.motion) return;
    this.squashVel += strength * 22;
  }

  update(dtSec: number): void {
    if (!this.motion) return;
    this.time += dtSec;
    const acc = -SPRING_K * this.squash - SPRING_DAMP * this.squashVel;
    this.squashVel += acc * dtSec;
    this.squash = Math.max(-MAX_SQUASH, Math.min(MAX_SQUASH, this.squash + this.squashVel * dtSec));
    if (this.popAge >= 0) {
      this.popAge += dtSec;
      if (this.popAge > 1.2) this.popAge = -1;
    }
    if (this.blinkAge >= 0) {
      this.blinkAge += dtSec;
      if (this.blinkAge > BLINK_SEC) {
        this.blinkAge = -1;
        this.blinkCount++;
        this.blinkIn = 2 + hash(this.seed + this.blinkCount) * 4;
      }
    } else {
      this.blinkIn -= dtSec;
      if (this.blinkIn <= 0) this.blinkAge = 0;
    }
  }

  pose(): CreaturePose {
    if (!this.motion) return { scaleX: 1, scaleY: 1, eyeOpen: 1, time: 0 };
    const pop = this.popAge >= 0 ? 1 - (1 - POP_START) * Math.exp(-7 * this.popAge) * Math.cos(14 * this.popAge) : 1;
    const breath = Math.sin(this.time * 2.2 + this.phase) * BREATH;
    const s = this.squash;
    const eyeOpen = this.blinkAge >= 0 ? 1 - 0.9 * Math.sin((this.blinkAge / BLINK_SEC) * Math.PI) : 1;
    return {
      scaleX: pop * (1 + s * 0.6 - breath * 0.5),
      scaleY: pop * (1 - s + breath),
      eyeOpen,
      time: this.time + this.phase,
    };
  }
}
