import {
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  Object3D,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LayoutPlan } from '../app/LayoutPlanner';
import { BOARD_UNITS } from '../app/LayoutPlanner';
import { BOX, tierDef } from '../core/tiers';
import type { BodyId, BodyState, TierId, Vec2 } from '../core/types';
import { Backdrop } from './Backdrop';
import { CreatureAnimator } from './CreatureAnimator';
import { CreatureMeshFactory } from './CreatureMeshFactory';
import { Effects } from './Effects';
import type { ScreenRect } from './NextPreview';
import { NextPreview } from './NextPreview';
import { PALETTE } from './palette';
import { Tank } from './Tank';

const SHADOW_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * 0.28;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

interface Wiggle {
  readonly mesh: Object3D;
  readonly baseRotZ: number;
  readonly baseY: number;
  readonly index: number;
}

interface CreatureView {
  readonly holder: Group;
  readonly creature: Group;
  readonly shadow: Mesh;
  readonly anim: CreatureAnimator;
  readonly radius: number;
  readonly eyes: readonly { mesh: Object3D; baseY: number }[];
  readonly shines: readonly Object3D[];
  readonly wiggles: ReadonlyMap<string, readonly Wiggle[]>;
}

interface PendingPop {
  readonly position: Vec2;
  readonly tier: TierId;
  ttl: number;
}

const WIGGLE_NAMES = ['wing', 'tentacle', 'flipper', 'tail', 'spout', 'leaf', 'claw', 'pincer'] as const;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class SceneRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly factory = new CreatureMeshFactory();
  private readonly effects: Effects;
  private readonly backdrop = new Backdrop();
  private readonly tank = new Tank();
  private readonly views = new Map<BodyId, CreatureView>();
  private readonly pendingPops: PendingPop[] = [];
  private readonly shadowGeom = new CircleGeometry(1, 32);
  private readonly shadowMat = new ShaderMaterial({
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    uniforms: { uColor: { value: new Color(PALETTE.ink) } },
    transparent: true,
    depthWrite: false,
  });
  private readonly motion = !prefersReducedMotion();
  private readonly environment: Texture;
  private readonly preview: NextPreview;
  private previewRect: (() => ScreenRect | null) | null = null;
  private ghost: CreatureView | null = null;
  private ghostTier: TierId | null = null;
  private aimX: number | null = null;
  private shake = 0;
  private plan: LayoutPlan | null = null;
  private seed = 1;

  static tryCreate(canvas: HTMLCanvasElement): SceneRenderer | null {
    try {
      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      return new SceneRenderer(renderer);
    } catch {
      return null;
    }
  }

  private constructor(private readonly renderer: WebGLRenderer) {
    this.renderer.setClearColor(new Color(PALETTE.deep));
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera.position.set(0, 0, 50);
    this.camera.lookAt(0, 0, 0);

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.5;

    const hemi = new HemisphereLight(0xe6fdff, PALETTE.sand, 1.25);
    const key = new DirectionalLight(0xfff3dc, 2.1);
    key.position.set(-5, 12, 14);
    // 背後上方からの水色のリムライトで、背景から輪郭を浮かせる。
    const rim = new DirectionalLight(0xbff6ff, 1.4);
    rim.position.set(6, 10, -8);
    this.scene.add(hemi, key, rim, this.backdrop.group, this.tank.group);

    this.effects = new Effects(this.scene);
    this.preview = new NextPreview(this.factory, this.environment, this.motion);
  }

  applyLayout(plan: LayoutPlan, devicePixelRatio: number): void {
    this.plan = plan;
    const { width, height } = plan.viewport;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    const upp = plan.unitsPerPx;
    const boardCenterX = BOARD_UNITS.originX + BOARD_UNITS.width / 2;
    const boardCenterY = BOARD_UNITS.originY + BOARD_UNITS.height / 2;
    const boardPxCx = plan.boardRect.x + plan.boardRect.width / 2;
    const boardPxCy = plan.boardRect.y + plan.boardRect.height / 2;
    const camCx = boardCenterX + (width / 2 - boardPxCx) * upp;
    const camCy = boardCenterY - (height / 2 - boardPxCy) * upp;
    const halfW = (width / 2) * upp;
    const halfH = (height / 2) * upp;
    this.camera.left = camCx - halfW;
    this.camera.right = camCx + halfW;
    this.camera.top = camCy + halfH;
    this.camera.bottom = camCy - halfH;
    this.camera.updateProjectionMatrix();
  }

  clientToUnit(clientX: number, clientY: number): Vec2 {
    const x = this.camera.left + (clientX / (this.plan?.viewport.width ?? 1)) * (this.camera.right - this.camera.left);
    const y = this.camera.top - (clientY / (this.plan?.viewport.height ?? 1)) * (this.camera.top - this.camera.bottom);
    return { x, y };
  }

  setNextPreview(tier: TierId, rect: () => ScreenRect | null): void {
    this.preview.setTier(tier);
    this.previewRect = rect;
  }

  private createView(tier: TierId, ghost: boolean, bornFromMerge: boolean): CreatureView {
    const creature = ghost ? this.factory.createGhost(tier) : this.factory.createCreature(tier);
    const holder = new Group();
    holder.add(creature);
    const radius = tierDef(tier).radius;
    const shadow = new Mesh(this.shadowGeom, this.shadowMat);
    shadow.scale.setScalar(radius * 1.05);
    shadow.visible = !ghost;
    const eyes: { mesh: Object3D; baseY: number }[] = [];
    const shines: Object3D[] = [];
    const wiggles = new Map<string, Wiggle[]>();
    creature.children.forEach((child, index) => {
      if (child.name === 'eye') eyes.push({ mesh: child, baseY: child.scale.y });
      else if (child.name === 'eyeShine') shines.push(child);
      else if ((WIGGLE_NAMES as readonly string[]).includes(child.name)) {
        const list = wiggles.get(child.name) ?? [];
        list.push({ mesh: child, baseRotZ: child.rotation.z, baseY: child.position.y, index });
        wiggles.set(child.name, list);
      }
    });
    this.seed += 1;
    return { holder, creature, shadow, anim: new CreatureAnimator(this.seed, bornFromMerge, this.motion), radius, eyes, shines, wiggles };
  }

  private takePendingPop(b: BodyState): boolean {
    const i = this.pendingPops.findIndex((p) => p.tier === b.tier && Math.hypot(p.position.x - b.position.x, p.position.y - b.position.y) < tierDef(b.tier).radius);
    if (i < 0) return false;
    this.pendingPops.splice(i, 1);
    return true;
  }

  syncBodies(bodies: readonly BodyState[]): void {
    const alive = new Set<BodyId>();
    for (const b of bodies) {
      alive.add(b.id);
      let v = this.views.get(b.id);
      if (v === undefined) {
        v = this.createView(b.tier, false, this.takePendingPop(b));
        this.views.set(b.id, v);
        this.scene.add(v.holder, v.shadow);
      }
      v.holder.position.set(b.position.x, b.position.y, 0);
      v.creature.rotation.z = b.angle;
      v.shadow.position.set(b.position.x + v.radius * 0.16, b.position.y - v.radius * 0.24, -1.5);
      v.anim.observeVelocity(b.velocity);
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        this.scene.remove(v.holder, v.shadow);
        this.views.delete(id);
      }
    }
  }

  setAim(tier: TierId | null, x: number): void {
    if (tier === null) {
      if (this.ghost !== null) this.ghost.holder.visible = false;
      this.tank.aimGuide.visible = false;
      this.aimX = null;
      return;
    }
    if (this.ghost === null || this.ghostTier !== tier || !this.ghost.holder.visible) {
      if (this.ghost !== null) this.scene.remove(this.ghost.holder);
      this.ghost = this.createView(tier, true, true);
      this.ghostTier = tier;
      this.scene.add(this.ghost.holder);
    }
    this.ghost.holder.visible = true;
    this.ghost.holder.position.set(x, BOX.spawnY, 0);
    this.tank.aimGuide.visible = true;
    this.tank.aimGuide.position.x = x;
    this.aimX = x;
  }

  spawnMergeEffect(position: Vec2, tier: TierId): void {
    const def = tierDef(tier);
    this.effects.burst(position, def.radius, def.baseColor);
    this.pendingPops.push({ position, tier, ttl: 0.5 });
    if (this.motion && tier >= 6) this.shake = Math.max(this.shake, 0.04 + (tier - 6) * 0.025);
  }

  private animateView(v: CreatureView, dtSec: number, isGhost: boolean): void {
    v.anim.update(dtSec);
    const pose = v.anim.pose();
    v.holder.scale.set(pose.scaleX, pose.scaleY, pose.scaleX);
    for (const e of v.eyes) e.mesh.scale.y = e.baseY * pose.eyeOpen;
    for (const s of v.shines) s.visible = pose.eyeOpen > 0.5;
    if (!this.motion) return;

    const t = pose.time;
    for (const [name, list] of v.wiggles) {
      for (const w of list) {
        const side = w.mesh.position.x < 0 ? -1 : 1;
        switch (name) {
          case 'wing':
            w.mesh.rotation.z = w.baseRotZ + side * Math.sin(t * 7) * 0.35;
            break;
          case 'tentacle':
            w.mesh.rotation.z = w.baseRotZ + Math.sin(t * 2.4 + w.index * 0.9) * 0.14;
            break;
          case 'flipper':
          case 'claw':
          case 'pincer':
            w.mesh.rotation.z = w.baseRotZ + side * Math.sin(t * 3) * 0.12;
            break;
          case 'tail':
          case 'leaf':
            w.mesh.rotation.z = w.baseRotZ + Math.sin(t * 2.2 + w.index) * 0.15;
            break;
          case 'spout':
            w.mesh.position.y = w.baseY + Math.abs(Math.sin(t * 3 + w.index)) * v.radius * 0.08;
            break;
        }
      }
    }

    // 落とす位置の方をちらっと見上げる。ゴーストは落下先（下）を見る。
    const x = v.holder.position.x;
    const y = v.holder.position.y;
    let yaw = 0;
    let pitch = 0;
    if (isGhost) {
      pitch = 0.3;
    } else if (this.aimX !== null) {
      yaw = Math.max(-0.4, Math.min(0.4, (this.aimX - x) * 0.09));
      pitch = -Math.max(0, Math.min(0.3, (BOX.spawnY - y) * 0.03));
    }
    const k = 1 - Math.exp(-6 * dtSec);
    v.creature.rotation.y += (yaw - v.creature.rotation.y) * k;
    v.creature.rotation.x += (pitch - v.creature.rotation.x) * k;
    if (isGhost) v.holder.position.y = BOX.spawnY + Math.sin(t * 2.4) * 0.06;
  }

  render(dtSec: number): void {
    this.backdrop.update(dtSec, this.motion);
    this.tank.update(dtSec, this.motion);
    this.effects.update(dtSec);
    for (const v of this.views.values()) this.animateView(v, dtSec, false);
    if (this.ghost !== null && this.ghost.holder.visible) this.animateView(this.ghost, dtSec, true);
    for (let i = this.pendingPops.length - 1; i >= 0; i--) {
      const p = this.pendingPops[i]!;
      p.ttl -= dtSec;
      if (p.ttl <= 0) this.pendingPops.splice(i, 1);
    }

    if (this.shake > 0.001) {
      this.camera.position.x = (Math.random() - 0.5) * this.shake;
      this.camera.position.y = (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-9 * dtSec);
    } else {
      this.camera.position.x = 0;
      this.camera.position.y = 0;
    }

    this.renderer.render(this.scene, this.camera);

    const rect = this.previewRect?.() ?? null;
    if (rect !== null && this.plan !== null) {
      this.preview.render(this.renderer, rect, this.plan.viewport.height, dtSec);
      this.renderer.setViewport(0, 0, this.plan.viewport.width, this.plan.viewport.height);
    }
  }

  dispose(): void {
    this.factory.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
