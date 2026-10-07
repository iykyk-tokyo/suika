import { DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, Texture, WebGLRenderer } from 'three';
import { tierDef } from '../core/tiers';
import type { TierId } from '../core/types';
import { CreatureAnimator } from './CreatureAnimator';
import type { CreatureMeshFactory } from './CreatureMeshFactory';
import { PALETTE } from './palette';

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// HUD の「つぎ」の泡の中に、次に落とす生き物を 3D でくるくる見せる。
export class NextPreview {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(28, 1, 0.1, 50);
  private readonly holder = new Group();
  private creature: Group | null = null;
  private anim: CreatureAnimator | null = null;
  private tier: TierId | null = null;
  private time = 0;

  constructor(
    private readonly factory: CreatureMeshFactory,
    environment: Texture,
    private readonly motion: boolean,
  ) {
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.55;
    const hemi = new HemisphereLight(PALETTE.foam, PALETTE.sand, 1.3);
    const key = new DirectionalLight(0xfff3dc, 2.2);
    key.position.set(-3, 4, 6);
    this.scene.add(hemi, key, this.holder);
    this.camera.position.set(0, 0.15, 6.2);
    this.camera.lookAt(0, 0, 0);
  }

  setTier(tier: TierId): void {
    if (tier === this.tier) return;
    if (this.creature !== null) this.holder.remove(this.creature);
    this.tier = tier;
    this.creature = this.factory.createCreature(tier);
    // 大きさの差は HUD では見せず、どの生き物も泡いっぱいに表示する。
    this.creature.scale.setScalar(1 / tierDef(tier).radius);
    this.holder.add(this.creature);
    this.anim = new CreatureAnimator(tier + 101, true, this.motion);
  }

  render(renderer: WebGLRenderer, rect: ScreenRect, canvasHeight: number, dtSec: number): void {
    if (this.creature === null || rect.width <= 0 || rect.height <= 0) return;
    this.time += this.motion ? dtSec : 0;
    if (this.anim !== null) {
      this.anim.update(dtSec);
      const pose = this.anim.pose();
      this.holder.scale.set(pose.scaleX, pose.scaleY, pose.scaleX);
    }
    this.creature.rotation.y = Math.sin(this.time * 0.9) * 0.45;
    this.holder.position.y = Math.sin(this.time * 1.8) * 0.06;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();

    const y = canvasHeight - rect.y - rect.height;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, y, rect.width, rect.height);
    renderer.setViewport(rect.x, y, rect.width, rect.height);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.autoClear = autoClear;
  }
}
