import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import type { LayoutPlan } from '../app/LayoutPlanner';
import { BOARD_UNITS } from '../app/LayoutPlanner';
import { BOX, tierDef } from '../core/tiers';
import type { BodyId, BodyState, TierId, Vec2 } from '../core/types';
import { CreatureMeshFactory } from './CreatureMeshFactory';
import { Effects } from './Effects';

const WALL_COLOR = 0x9fd3ff;
const DANGER_COLOR = 0xff6b6b;

export class SceneRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly factory = new CreatureMeshFactory();
  private readonly effects: Effects;
  private readonly meshes = new Map<BodyId, Group>();
  private ghost: Group | null = null;
  private ghostTier: TierId | null = null;
  private readonly aimLine: Mesh;
  private plan: LayoutPlan | null = null;

  static tryCreate(canvas: HTMLCanvasElement): SceneRenderer | null {
    try {
      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      return new SceneRenderer(renderer);
    } catch {
      return null;
    }
  }

  private constructor(private readonly renderer: WebGLRenderer) {
    this.renderer.setClearColor(new Color(0x06203a));
    this.camera.position.set(0, 0, 50);
    this.camera.lookAt(0, 0, 0);
    this.effects = new Effects(this.scene);

    const hemi = new HemisphereLight(0xcfeeff, 0x0a2a4a, 1.1);
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 10, 12);
    this.scene.add(hemi, sun);

    const wallMat = new MeshStandardMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.22, roughness: 0.2 });
    const thickness = 0.3;
    const floor = new Mesh(new BoxGeometry(BOX.width + thickness * 2, thickness, 3), wallMat);
    floor.position.set(0, -thickness / 2, 0);
    const left = new Mesh(new BoxGeometry(thickness, BOX.height, 3), wallMat);
    left.position.set(-BOX.width / 2 - thickness / 2, BOX.height / 2, 0);
    const right = new Mesh(new BoxGeometry(thickness, BOX.height, 3), wallMat);
    right.position.set(BOX.width / 2 + thickness / 2, BOX.height / 2, 0);
    this.scene.add(floor, left, right);

    const danger = new Mesh(new PlaneGeometry(BOX.width, 0.06), new MeshBasicMaterial({ color: DANGER_COLOR, transparent: true, opacity: 0.7 }));
    danger.position.set(0, BOX.dangerY, -1);
    this.scene.add(danger);

    this.aimLine = new Mesh(new PlaneGeometry(0.04, BOX.height), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
    this.aimLine.position.set(0, BOX.height / 2, -1.5);
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    const backdrop = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: 0x0b3558 }));
    backdrop.position.set(0, BOX.height / 2, -20);
    this.scene.add(backdrop);
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

  syncBodies(bodies: readonly BodyState[]): void {
    const alive = new Set<BodyId>();
    for (const b of bodies) {
      alive.add(b.id);
      let g = this.meshes.get(b.id);
      if (g === undefined) {
        g = this.factory.createCreature(b.tier);
        this.meshes.set(b.id, g);
        this.scene.add(g);
      }
      g.position.set(b.position.x, b.position.y, 0);
      g.rotation.z = b.angle;
    }
    for (const [id, g] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(g);
        this.meshes.delete(id);
      }
    }
  }

  setAim(tier: TierId | null, x: number): void {
    if (tier === null) {
      if (this.ghost !== null) this.ghost.visible = false;
      this.aimLine.visible = false;
      return;
    }
    if (this.ghost === null || this.ghostTier !== tier) {
      if (this.ghost !== null) this.scene.remove(this.ghost);
      this.ghost = this.factory.createGhost(tier);
      this.ghostTier = tier;
      this.scene.add(this.ghost);
    }
    this.ghost.visible = true;
    this.ghost.position.set(x, BOX.spawnY, 0);
    this.aimLine.visible = true;
    this.aimLine.position.x = x;
  }

  spawnMergeEffect(position: Vec2, tier: TierId): void {
    const def = tierDef(tier);
    this.effects.burst(position, def.radius, def.accentColor);
  }

  render(dtSec: number): void {
    this.effects.update(dtSec);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.factory.dispose();
    this.renderer.dispose();
  }
}
