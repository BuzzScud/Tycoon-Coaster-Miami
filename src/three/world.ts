// The three.js scene: renderer, camera controller, sun and sky. One tile = 1 world unit, one height unit = 0.25.
import * as THREE from 'three';
import { setLineResolution } from '../ink/kit';

export const HU = 0.25;   // world units per height unit
export const toWorld = (tx: number, ty: number, z: number) => new THREE.Vector3(tx, z * HU, ty);

export class CameraController {
  target = new THREE.Vector3(32, 0, 32); distance = 40; yaw = Math.PI / 4; pitch = 0.9;   // radians; pitch 0 = horizon, PI/2 = top-down
  minDist = 6; maxDist = 160; rideCam = false;
  constructor(public camera: THREE.PerspectiveCamera) {}
  pan(dx: number, dz: number) {   // screen-relative pan on the ground plane
    const s = this.distance * 0.0012;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.target.x += (-dx * fz - dz * fx) * s * -1; this.target.z += (dx * fx - dz * fz) * s * -1;
  }
  orbit(dx: number, dy: number) { this.yaw -= dx * 0.006; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.006, 0.18, 1.45); }
  dolly(f: number) { this.distance = THREE.MathUtils.clamp(this.distance * f, this.minDist, this.maxDist); }
  clampTarget(w: number, h: number) { this.target.x = THREE.MathUtils.clamp(this.target.x, -8, w + 8); this.target.z = THREE.MathUtils.clamp(this.target.z, -8, h + 8); }
  update() {
    if (this.rideCam) return;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x = this.target.x + Math.sin(this.yaw) * cp * this.distance, z = this.target.z + Math.cos(this.yaw) * cp * this.distance, y = this.target.y + sp * this.distance;
    this.camera.position.set(x, y, z); this.camera.lookAt(this.target);
  }
}

/** The looks. Flat ones (a fixed-angle camera, unlit ink drawings): ink on paper, RCT (pixels, a black void), rich ink.
 *  Lit ones (perspective, sun, shadows, sky): classic (day and night), sunny (always noon). */
export type Look = 'ink' | 'classic' | 'rct' | 'sunny' | 'rich';
export const LOOKS: Look[] = ['ink', 'classic', 'rct', 'sunny', 'rich'];
export const isFlat = (l: Look) => l === 'ink' || l === 'rct' || l === 'rich';
export const INK_PAPER = 0xeef0e8;
export class World {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: CameraController;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fill: THREE.AmbientLight; width = 1; height = 1;
  skyTop = new THREE.Color(); skyBottom = new THREE.Color(); fog: THREE.Fog; time = 0;
  look: Look = 'classic'; ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2400);
  /** The camera drawing the frame: the flat one in the ink look, the perspective one in classic and on a ride. */
  get view(): THREE.Camera { return isFlat(this.look) && !this.controls.rideCam ? this.ortho : this.camera; }
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    this.controls = new CameraController(this.camera);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.6); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.near = 1; sc.far = 400; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe7ff, 0x5a7a3a, 0.9); this.scene.add(this.hemi);
    this.fill = new THREE.AmbientLight(0xffffff, 0.15); this.scene.add(this.fill);
    this.fog = new THREE.Fog(0xbfd7ea, 120, 420); this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x9fc5e8);
  }
  resize(w: number, h: number) { this.width = w; this.height = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); setLineResolution(w, h); }
  /** Switch look: a fresh scene with the same lights, paper or sky behind it. Returns the old scene for disposal. */
  useLook(look: Look): THREE.Scene {
    const old = this.scene; this.look = look; this.scene = new THREE.Scene();
    for (const o of [this.sun, this.sun.target, this.hemi, this.fill]) { o.parent?.remove(o); this.scene.add(o); }
    if (isFlat(look)) { this.renderer.shadowMap.enabled = false; this.renderer.toneMapping = THREE.NoToneMapping; this.scene.fog = null; this.scene.background = new THREE.Color(look === 'rct' ? 0x0b0d0b : INK_PAPER); this.sun.intensity = 2.2; this.hemi.intensity = 1.0; this.fill.intensity = 0.2; this.sun.color.setHex(0xfff2d6); this.sun.position.set(40, 120, 60); }
    else { this.renderer.shadowMap.enabled = true; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.scene.fog = this.fog; this.scene.background = new THREE.Color(0x9fc5e8); }
    return old;
  }
  /** light: 1 = noon, 0 = midnight; gloom: cloud cover 0..1 */
  setSky(light: number, gloom: number, dayFraction: number) {
    const day = new THREE.Color(0x8fc3ec), dusk = new THREE.Color(0xd9a06f), night = new THREE.Color(0x0e1630), cloud = new THREE.Color(0x9aa6b2);
    const c = new THREE.Color();
    if (light > 0.55) c.copy(day).lerp(dusk, THREE.MathUtils.clamp((0.7 - light) / 0.15, 0, 1) * 0.7); else c.copy(dusk).lerp(night, THREE.MathUtils.clamp((0.55 - light) / 0.35, 0, 1));
    c.lerp(cloud, gloom * 0.7 * Math.min(1, light + 0.2));
    (this.scene.background as THREE.Color).copy(c); this.fog.color.copy(c);
    // sun travels across the sky over the day fraction
    const a = dayFraction * Math.PI * 2; const elev = Math.max(0.08, Math.sin(a + Math.PI / 2) * 0.9 + 0.1);
    this.sun.position.set(this.controls.target.x + Math.cos(a) * 80, 40 + elev * 90, this.controls.target.z + Math.sin(a) * 60);
    this.sun.target.position.copy(this.controls.target);
    this.sun.intensity = (0.4 + 2.4 * Math.max(0, light - 0.2)) * (1 - gloom * 0.6);
    this.sun.color.setHex(light > 0.6 ? 0xfff2d6 : light > 0.4 ? 0xffc48a : 0x9fb4ff);
    this.hemi.intensity = 0.35 + 0.7 * light - gloom * 0.2; this.fill.intensity = 0.08 + 0.12 * light;
    this.renderer.toneMappingExposure = 0.85 + 0.35 * light;
  }
  render() {
    const c = this.controls; c.update();
    if (isFlat(this.look) && !c.rideCam) {   // the flat camera frames what the perspective one would at its target
      const o = this.ortho, half = c.distance * 0.3839, a = this.width / this.height; o.left = -half * a; o.right = half * a; o.top = half; o.bottom = -half; o.updateProjectionMatrix();
      const cp = Math.cos(c.pitch), D = 900; o.position.set(c.target.x + Math.sin(c.yaw) * cp * D, c.target.y + Math.sin(c.pitch) * D, c.target.z + Math.cos(c.yaw) * cp * D); o.lookAt(c.target); o.updateMatrixWorld(true);
    }
    this.renderer.render(this.scene, this.view);
  }
}

// ---------- geometry helpers (vertex-coloured, flat-shaded low poly) ----------
export const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.02 });
export const MAT_GHOST = new THREE.MeshStandardMaterial({ color: 0xffe14d, transparent: true, opacity: 0.55, depthWrite: false });
export const MAT_BLOCKED = new THREE.MeshStandardMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.55, depthWrite: false });
const tmpColor = new THREE.Color();
/** Paint a whole geometry one colour (adds a 'color' attribute). */
export function paint(geo: THREE.BufferGeometry, hex: number | string): THREE.BufferGeometry {
  const n = geo.attributes.position.count; const arr = new Float32Array(n * 3); tmpColor.set(hex as any);
  for (let i = 0; i < n; i++) { arr[i * 3] = tmpColor.r; arr[i * 3 + 1] = tmpColor.g; arr[i * 3 + 2] = tmpColor.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
}
/** A box part positioned in a model, with a colour. */
export function part(geo: THREE.BufferGeometry, hex: number | string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = geo.clone(); paint(g, hex); const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)); g.applyMatrix4(m); return g;
}
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // minimal merge: all parts are non-indexed with position/normal/color
  const list = parts.map(p => (p.index ? p.toNonIndexed() : p));
  let n = 0; for (const p of list) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const p of list) { pos.set(p.attributes.position.array as Float32Array, o * 3); if (p.attributes.normal) nor.set(p.attributes.normal.array as Float32Array, o * 3); col.set(p.attributes.color.array as Float32Array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}
export const BOX = new THREE.BoxGeometry(1, 1, 1); export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); export const CONE = new THREE.ConeGeometry(0.5, 1, 8); export const SPH = new THREE.IcosahedronGeometry(0.5, 1); export const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
export function mesh(geo: THREE.BufferGeometry, shadow = true): THREE.Mesh { const m = new THREE.Mesh(geo, MAT); m.castShadow = shadow; m.receiveShadow = true; return m; }
export const hexOf = (css: string) => parseInt(css.replace('#', ''), 16);
