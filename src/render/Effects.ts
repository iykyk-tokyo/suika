import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, Scene } from 'three';
import type { Vec2 } from '../core/types';

interface Burst {
  readonly points: Points;
  readonly velocities: Float32Array;
  life: number;
}

const BURST_LIFE = 0.4;
const BURST_COUNT = 18;

export class Effects {
  private readonly bursts: Burst[] = [];

  constructor(private readonly scene: Scene) {}

  burst(position: Vec2, radius: number, color: number): void {
    const positions = new Float32Array(BURST_COUNT * 3);
    const velocities = new Float32Array(BURST_COUNT * 3);
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (i / BURST_COUNT) * Math.PI * 2;
      const speed = radius * (2 + Math.random() * 2);
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = 0.5;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = Math.sin(angle) * speed + radius * 1.5;
      velocities[i * 3 + 2] = 0;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({ color, size: radius * 0.25, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    const points = new Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: BURST_LIFE });
  }

  update(dtSec: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.life -= dtSec;
      const attr = b.points.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] = arr[j]! + b.velocities[j]! * dtSec;
        arr[j + 1] = arr[j + 1]! + b.velocities[j + 1]! * dtSec;
      }
      attr.needsUpdate = true;
      const mat = b.points.material as PointsMaterial;
      mat.opacity = Math.max(0, b.life / BURST_LIFE);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        mat.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}
