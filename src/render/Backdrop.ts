import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { BOX } from '../core/tiers';
import { PALETTE } from './palette';

// 背景・光の筋・砂・海藻・泡。全てコード生成で、ゲームの当たり判定には関わらない。

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uBottom;
varying vec3 vWorld;

// タイル可能な水面コースティクス（反復による擬似的な光の網目）。
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

void main() {
  float h = clamp((vWorld.y + 4.0) / 24.0, 0.0, 1.0);
  vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, h));
  col = mix(col, uTop, smoothstep(0.5, 1.0, h));
  float k = caustic(vWorld.xy * 0.085 + vec2(0.0, uTime * 0.01), uTime * 0.35);
  col += vec3(0.85, 1.0, 1.0) * k * (0.12 + 0.28 * h);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const RAY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RAY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  float fall = smoothstep(0.0, 0.85, vUv.y);
  float flicker = 0.7 + 0.3 * sin(uTime * 0.6 + uSeed * 7.0);
  gl_FragColor = vec4(vec3(1.0, 0.99, 0.9), edge * fall * flicker * 0.16);
}`;

const KELP_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float bend = pow(uv.y, 1.6);
  p.x += sin(uTime * 1.1 + uSeed * 3.0 + uv.y * 3.5) * 0.35 * bend;
  p.x *= 1.0 - uv.y * 0.35;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const KELP_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uTip;
varying vec2 vUv;
void main() {
  float d = abs(vUv.x - 0.5) * 2.0;
  float tip = smoothstep(1.0, 0.86, vUv.y + d * d * 0.12);
  float alpha = smoothstep(1.0, 0.82, d) * tip;
  vec3 col = mix(uBase, uTip, vUv.y);
  col *= 0.88 + 0.12 * (1.0 - d);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

const BUBBLE_VERT = /* glsl */ `
varying vec3 vNormal;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

const BUBBLE_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vNormal;
void main() {
  float rim = pow(1.0 - clamp(vNormal.z, 0.0, 1.0), 2.2);
  float spec = smoothstep(0.86, 0.97, dot(vNormal, normalize(vec3(-0.45, 0.55, 0.7))));
  float a = (rim * 0.75 + 0.06 + spec) * uOpacity;
  gl_FragColor = vec4(vec3(0.94, 1.0, 1.0), a);
}`;

export function createBubbleMaterial(opacity = 1): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    uniforms: { uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
  });
}

interface FloatingBubble {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  phase: number;
}

const BUBBLE_COUNT = 34;
const BUBBLE_TOP = 22;
const BUBBLE_BOTTOM = -3;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function duneShape(y0: number, amp: number, freq: number, phase: number): Shape {
  const s = new Shape();
  const left = -60;
  const right = 60;
  s.moveTo(left, -40);
  for (let x = left; x <= right; x += 0.5) {
    const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase * 1.3) * amp * 0.35;
    s.lineTo(x, y);
  }
  s.lineTo(right, -40);
  s.lineTo(left, -40);
  return s;
}

function starShape(outer: number, inner: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export class Backdrop {
  readonly group = new Group();
  private readonly timed: ShaderMaterial[] = [];
  private readonly bubbles: InstancedMesh;
  private readonly bubbleState: FloatingBubble[] = [];
  private readonly matrix = new Matrix4();
  private readonly quat = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scl = new Vector3();
  private time = 0;

  constructor() {
    const rnd = rand(7);

    const water = new ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new Color(PALETTE.lagoon) },
        uMid: { value: new Color(PALETTE.deep) },
        uBottom: { value: new Color(PALETTE.abyss) },
      },
      depthWrite: false,
    });
    this.timed.push(water);
    const backdrop = new Mesh(new PlaneGeometry(400, 400), water);
    backdrop.position.set(0, BOX.height / 2, -20);
    this.group.add(backdrop);

    const rayGeom = new PlaneGeometry(1, 1);
    rayGeom.translate(0, -0.5, 0);
    for (let i = 0; i < 6; i++) {
      const m = new ShaderMaterial({
        vertexShader: RAY_VERT,
        fragmentShader: RAY_FRAG,
        uniforms: { uTime: { value: 0 }, uSeed: { value: i } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      this.timed.push(m);
      const ray = new Mesh(rayGeom, m);
      ray.position.set(-9 + i * 3.6 + rnd() * 1.5, 24, -14);
      ray.rotation.z = 0.32 + rnd() * 0.08;
      ray.scale.set(1.2 + rnd() * 1.8, 30, 1);
      this.group.add(ray);
    }

    const backDune = new Mesh(new ShapeGeometry(duneShape(0.9, 0.45, 0.32, 1.2)), new MeshPhysicalMaterial({ color: PALETTE.sandShade, roughness: 1 }));
    backDune.position.z = -12;
    const frontDune = new Mesh(new ShapeGeometry(duneShape(0.15, 0.3, 0.45, 0.2)), new MeshPhysicalMaterial({ color: PALETTE.sand, roughness: 1 }));
    frontDune.position.z = -6;
    this.group.add(backDune, frontDune);

    const kelpGeom = new PlaneGeometry(0.7, 1, 1, 24);
    kelpGeom.translate(0, 0.5, 0);
    const kelpSpots: readonly (readonly [number, number, number])[] = [
      [-8.6, 6.5, -9],
      [-7.1, 4.5, -8],
      [-5.9, 3.2, -7],
      [6.0, 3.8, -7],
      [7.2, 6.0, -8],
      [8.9, 4.4, -9],
      [-11.5, 5.0, -9],
      [11.2, 5.6, -9],
    ];
    kelpSpots.forEach(([x, h, z], i) => {
      const m = new ShaderMaterial({
        vertexShader: KELP_VERT,
        fragmentShader: KELP_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: i * 1.7 },
          uBase: { value: new Color(PALETTE.kelpDark) },
          uTip: { value: new Color(i % 2 === 0 ? PALETTE.kelp : 0x7fd8a6) },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      this.timed.push(m);
      const kelp = new Mesh(kelpGeom, m);
      kelp.position.set(x, -0.6, z);
      kelp.scale.set(1, h, 1);
      this.group.add(kelp);
    });

    const coralMat = new MeshPhysicalMaterial({ color: PALETTE.coral, roughness: 0.5, clearcoat: 0.6 });
    const coralGeom = new SphereGeometry(1, 20, 14);
    const corals: readonly (readonly [number, number, number, number])[] = [
      [-6.4, 0.2, -5, 0.55],
      [-7.0, 0.55, -5.5, 0.4],
      [-5.9, 0.7, -5.2, 0.3],
      [6.5, 0.25, -5, 0.5],
      [7.1, 0.6, -5.5, 0.32],
    ];
    for (const [x, y, z, s] of corals) {
      const c = new Mesh(coralGeom, coralMat);
      c.position.set(x, y, z);
      c.scale.set(s, s * 0.85, s);
      this.group.add(c);
    }
    const star = new Mesh(new ShapeGeometry(starShape(0.55, 0.26)), new MeshPhysicalMaterial({ color: 0xffb36b, roughness: 0.6, clearcoat: 0.5 }));
    star.position.set(-6.2, -0.35, -4.5);
    star.rotation.z = 0.3;
    this.group.add(star);

    const bubbleGeom = new SphereGeometry(1, 14, 10);
    this.bubbles = new InstancedMesh(bubbleGeom, createBubbleMaterial(0.9), BUBBLE_COUNT);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const inside = i < 8;
      this.bubbleState.push({
        x: inside ? (rnd() - 0.5) * (BOX.width - 1) : (rnd() - 0.5) * 26,
        y: BUBBLE_BOTTOM + rnd() * (BUBBLE_TOP - BUBBLE_BOTTOM),
        z: inside ? -1.3 : -3 - rnd() * 8,
        size: inside ? 0.05 + rnd() * 0.07 : 0.06 + rnd() * 0.16,
        speed: 0.6 + rnd() * 1.1,
        phase: rnd() * 10,
      });
    }
    this.bubbles.frustumCulled = false;
    this.group.add(this.bubbles);
    this.updateBubbles(0);
  }

  update(dtSec: number, motion: boolean): void {
    if (!motion) return;
    this.time += dtSec;
    for (const m of this.timed) {
      const u = m.uniforms['uTime'];
      if (u !== undefined) u.value = this.time;
    }
    this.updateBubbles(dtSec);
  }

  private updateBubbles(dtSec: number): void {
    for (let i = 0; i < this.bubbleState.length; i++) {
      const b = this.bubbleState[i]!;
      b.y += b.speed * dtSec;
      if (b.y > BUBBLE_TOP) b.y = BUBBLE_BOTTOM;
      const wobble = Math.sin(this.time * 2 + b.phase) * 0.12;
      this.pos.set(b.x + wobble, b.y, b.z);
      this.scl.setScalar(b.size);
      this.matrix.compose(this.pos, this.quat, this.scl);
      this.bubbles.setMatrixAt(i, this.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}
