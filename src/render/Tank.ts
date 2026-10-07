import { Color, Group, Mesh, MeshPhysicalMaterial, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, SphereGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOX } from '../core/tiers';
import { PALETTE } from './palette';

// ガラスの水槽、砂の床、デンジャーライン、照準ガイド。

const LINE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// 丸いドットを並べる。uAxis=0 で横並び、1 で縦並び。
const DOTS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCount;
uniform float uScroll;
uniform float uAxis;
uniform float uAspect;
varying vec2 vUv;
void main() {
  float along = mix(vUv.x, vUv.y, uAxis);
  float across = mix(vUv.y, vUv.x, uAxis);
  float cell = fract(along * uCount + uScroll) - 0.5;
  vec2 d = vec2(cell / uAspect, across - 0.5);
  float r = length(d) * 2.0;
  float a = smoothstep(0.62, 0.46, r);
  gl_FragColor = vec4(uColor, a * uOpacity);
  #include <colorspace_fragment>
}`;

const THICKNESS = 0.32;

function dots(width: number, height: number, color: number, count: number, axis: 0 | 1, opacity: number): Mesh<PlaneGeometry, ShaderMaterial> {
  const along = axis === 0 ? width : height;
  const across = axis === 0 ? height : width;
  const material = new ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: DOTS_FRAG,
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
      uCount: { value: count },
      uScroll: { value: 0 },
      uAxis: { value: axis },
      uAspect: { value: across / (along / count) },
    },
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(new PlaneGeometry(width, height), material);
}

export class Tank {
  readonly group = new Group();
  readonly aimGuide: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly danger: Mesh<PlaneGeometry, ShaderMaterial>;
  private time = 0;

  constructor() {
    const glass = new MeshPhysicalMaterial({
      color: 0xe9fdff,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const wallGeom = new RoundedBoxGeometry(THICKNESS, BOX.height + THICKNESS, 3.2, 3, THICKNESS * 0.45);
    const left = new Mesh(wallGeom, glass);
    left.position.set(-BOX.width / 2 - THICKNESS / 2, BOX.height / 2 - THICKNESS / 2, 0);
    const right = new Mesh(wallGeom, glass);
    right.position.set(BOX.width / 2 + THICKNESS / 2, BOX.height / 2 - THICKNESS / 2, 0);

    // ガラスのツヤ（縦の白い筋）。
    const glintMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    const glintGeom = new PlaneGeometry(0.07, BOX.height * 0.82);
    for (const wall of [left, right]) {
      const glint = new Mesh(glintGeom, glintMat);
      glint.position.set(wall.position.x - 0.06, BOX.height * 0.5, 1.65);
      this.group.add(glint);
    }
    const capGeom = new SphereGeometry(THICKNESS * 0.62, 16, 12);
    const capMat = new MeshPhysicalMaterial({ color: PALETTE.foam, roughness: 0.25, clearcoat: 1 });
    for (const wall of [left, right]) {
      const cap = new Mesh(capGeom, capMat);
      cap.position.set(wall.position.x, BOX.height + 0.05, 0.6);
      this.group.add(cap);
    }

    const bed = new Mesh(
      new RoundedBoxGeometry(BOX.width + THICKNESS * 2, 0.6, 3.2, 3, 0.18),
      new MeshPhysicalMaterial({ color: PALETTE.sand, roughness: 0.85, sheen: 0.6, sheenColor: 0xffffff }),
    );
    bed.position.set(0, -0.3, 0);

    // 水槽の奥のガラス。外の海より少し明るく、中を「水槽の中」に見せる。
    const back = new Mesh(
      new PlaneGeometry(BOX.width, BOX.height),
      new MeshBasicMaterial({ color: PALETTE.lagoon, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    back.position.set(0, BOX.height / 2, -1.6);

    this.group.add(back, bed, left, right);

    this.danger = dots(BOX.width, 0.16, PALETTE.coral, 34, 0, 0.9);
    this.danger.position.set(0, BOX.dangerY, -1.2);
    this.group.add(this.danger);

    this.aimGuide = dots(0.16, BOX.height, PALETTE.foam, 30, 1, 0.55);
    this.aimGuide.position.set(0, BOX.height / 2, -1.4);
    this.aimGuide.visible = false;
    this.group.add(this.aimGuide);
  }

  update(dtSec: number, motion: boolean): void {
    if (!motion) return;
    this.time += dtSec;
    const aimScroll = this.aimGuide.material.uniforms['uScroll'];
    if (aimScroll !== undefined) aimScroll.value = this.time * 0.8;
    const dangerScroll = this.danger.material.uniforms['uScroll'];
    if (dangerScroll !== undefined) dangerScroll.value = this.time * 0.25;
  }
}
