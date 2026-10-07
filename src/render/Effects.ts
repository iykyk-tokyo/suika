import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene, Shape, ShapeGeometry, ShaderMaterial, SphereGeometry } from 'three';
import type { Vec2 } from '../core/types';
import { createBubbleMaterial } from './Backdrop';
import { PALETTE } from './palette';

// 合体の演出：広がる光の輪、はじける泡、きらめく星。

interface Particle {
  readonly mesh: Mesh;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  readonly maxLife: number;
  readonly size: number;
  readonly kind: 'bubble' | 'sparkle';
}

interface Ring {
  readonly mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  life: number;
  readonly radius: number;
}

const RING_LIFE = 0.5;
const POOL_SIZE = 160;

function sparkleShape(): Shape {
  const s = new Shape();
  const n = 4;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.28;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export class Effects {
  private readonly group = new Group();
  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly pool: Mesh[] = [];
  private readonly bubbleGeom = new SphereGeometry(1, 12, 8);
  private readonly bubbleMat: ShaderMaterial = createBubbleMaterial(1);
  private readonly sparkleGeom = new ShapeGeometry(sparkleShape());
  private readonly sparkleMats = [PALETTE.foam, 0xfff1a8, PALETTE.blush].map(
    (c) => new MeshBasicMaterial({ color: c, transparent: true, depthWrite: false }),
  );
  private readonly ringGeom = new RingGeometry(0.82, 1, 48);

  constructor(scene: Scene) {
    this.group.position.z = 2.6;
    scene.add(this.group);
  }

  private take(): Mesh {
    const m = this.pool.pop() ?? new Mesh();
    m.visible = true;
    this.group.add(m);
    return m;
  }

  private release(m: Mesh): void {
    this.group.remove(m);
    if (this.pool.length < POOL_SIZE) this.pool.push(m);
  }

  burst(position: Vec2, radius: number, color: number): void {
    const ringMat = new MeshBasicMaterial({ color: new Color(color).lerp(new Color(0xffffff), 0.55), transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
    const ring = new Mesh(this.ringGeom, ringMat);
    ring.position.set(position.x, position.y, 0);
    this.group.add(ring);
    this.rings.push({ mesh: ring, life: RING_LIFE, radius });

    const bubbles = 8 + Math.round(radius * 4);
    for (let i = 0; i < bubbles; i++) {
      const a = (i / bubbles) * Math.PI * 2 + Math.random() * 0.4;
      const speed = radius * (1.8 + Math.random() * 1.6);
      const m = this.take();
      m.geometry = this.bubbleGeom;
      m.material = this.bubbleMat;
      m.position.set(position.x + Math.cos(a) * radius * 0.7, position.y + Math.sin(a) * radius * 0.7, 0);
      const life = 0.7 + Math.random() * 0.5;
      this.particles.push({ mesh: m, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, spin: 0, life, maxLife: life, size: radius * (0.08 + Math.random() * 0.1), kind: 'bubble' });
    }
    const sparkles = 5 + Math.round(radius * 2);
    for (let i = 0; i < sparkles; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = radius * (2.2 + Math.random() * 2);
      const m = this.take();
      m.geometry = this.sparkleGeom;
      m.material = this.sparkleMats[i % this.sparkleMats.length]!;
      m.position.set(position.x, position.y, 0.1);
      const life = 0.45 + Math.random() * 0.3;
      this.particles.push({ mesh: m, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed + radius, spin: (Math.random() - 0.5) * 10, life, maxLife: life, size: radius * (0.12 + Math.random() * 0.1), kind: 'sparkle' });
    }
  }

  update(dtSec: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life -= dtSec;
      const p = 1 - Math.max(0, r.life) / RING_LIFE;
      const ease = 1 - (1 - p) * (1 - p);
      r.mesh.scale.setScalar(r.radius * (0.9 + ease * 1.3));
      r.mesh.material.opacity = 0.9 * (1 - p);
      if (r.life <= 0) {
        this.group.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dtSec;
      const drag = Math.exp(-4 * dtSec);
      p.vx *= drag;
      p.vy = p.vy * drag + (p.kind === 'bubble' ? 3 : -1.5) * dtSec;
      p.mesh.position.x += p.vx * dtSec;
      p.mesh.position.y += p.vy * dtSec;
      p.mesh.rotation.z += p.spin * dtSec;
      const t = Math.max(0, p.life) / p.maxLife;
      // 泡は膨らんでからはじけ、星は縮みながら消える。
      const s = p.kind === 'bubble' ? p.size * (t > 0.15 ? 1 + (1 - t) * 0.4 : t / 0.15) : p.size * t;
      p.mesh.scale.setScalar(Math.max(s, 0.0001));
      if (p.life <= 0) {
        this.release(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}
