// The ink drawing kit: a model is a Sketch of solid parts (flat-shaded fills), ink outlines for round parts
// (a slightly larger copy drawn inside out) and ink strokes (box edges, rings, details) in world units.
// One Sketch builds into either a plain group or an instanced kind, in either ink style.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ---------- styles ----------
export interface InkStyle {
  key: string; name: string;
  ink: number;                 // line colour
  edge: number; fine: number;  // stroke widths (tiles): box edges and outlines / small details
  hull: number;                // outline width of round parts
  hullAll: boolean;            // every part gets an outline (bold), not only round ones
  boxEdges: boolean;           // draw every box edge (fine) or only the creases that matter (bold)
  cel: boolean;                // two-tone light (bold) or a fixed shade per side (fine)
  sides: [number, number, number];   // fine: brightness of tops, east/west faces, north/south faces
  light: [number, number, number]; lo: number;   // bold: light direction and the shadow tone
  bg: number; grid: number;    // page background, opacity of the tile grid (0 = none)
  checker: boolean;            // two-tone grass like today
  shadows: boolean;            // soft blobs under trees, people and rides
  outside: number;             // brightness of land the park does not own
  noise?: number;              // speckle on up-facing fills (a texture made of pixels), 0 = flat colour
  ground?: number;             // the speckle the ground gets (the style's objects keep `noise`)
  palette?: 'ink' | 'rct';     // the ground's colours
  pixel?: number;              // draw at this fraction of the screen's pixels, upscaled hard (0 / absent = full)
}
/** The ground's style: the same as the park's, with the ground's own speckle. */
export const groundStyle = (s: InkStyle): InkStyle => (s.ground ? { ...s, key: s.key + '-g', noise: s.ground } : s);
export const FINE: InkStyle = {
  key: 'fine', name: '1 · Fine ink', ink: 0x2c3530, edge: 0.034, fine: 0.022, hull: 0.03, hullAll: false, boxEdges: true,
  cel: false, sides: [1.0, 0.86, 0.74], light: [0.5, 0.8, 0.35], lo: 0.7, bg: 0xeef0e8, grid: 0.09, checker: false, shadows: false, outside: 0.86,
};
/** RCT: the look of the 1999 sprites at their fixed angle: dark outlines, strong side shades, speckled grass, a black
 *  void past the map, drawn at half the screen's pixels and enlarged without smoothing. */
export const RCT: InkStyle = {
  key: 'rct', name: 'RCT', ink: 0x1b1e1a, edge: 0.03, fine: 0.02, hull: 0.028, hullAll: false, boxEdges: true,
  cel: false, sides: [1.0, 0.78, 0.6], light: [0.5, 0.8, 0.35], lo: 0.7, bg: 0x0b0d0b, grid: 0, checker: false, shadows: false, outside: 0.7, ground: 0.2, palette: 'rct', pixel: 0.5,
};
/** Rich ink: today's fine ink with a textured ground and soft shadows under things. */
export const RICH: InkStyle = { ...FINE, key: 'rich', name: 'Rich ink', sides: [1.0, 0.84, 0.7], grid: 0.05, shadows: true, ground: 0.09 };
export const BOLD: InkStyle = {
  key: 'bold', name: '2 · Bold ink', ink: 0x16181d, edge: 0.03, fine: 0.024, hull: 0.085, hullAll: true, boxEdges: false,
  cel: true, sides: [1, 1, 1], light: [-0.45, 0.8, 0.4], lo: 0.68, bg: 0xdcebf3, grid: 0, checker: true, shadows: true, outside: 0.78,
};

// ---------- materials ----------
/** Shared clock for swaying instances (trees, bushes): set once a frame by the scenery view. */
export const inkTime = { value: 0 };
const SWAY = /* glsl */`
        #ifdef SWAY
          { vec4 wp0 = m * vec4(0.0, 0.0, 0.0, 1.0); float hgt = max(position.y, 0.0); float ph = uTime * 1.3 + wp0.x * 0.7 + wp0.z * 0.5; m = m; vec3 off = vec3(sin(ph) * 0.035, 0.0, cos(ph * 0.85) * 0.025) * hgt; swayOff = off; }
        #endif`;
const fillCache = new Map<string, THREE.ShaderMaterial>();
/** Unlit fill: the vertex colour times a shade picked from the face direction, never from scene lights. */
export function fillMaterial(s: InkStyle, opts: { transparent?: boolean; opacity?: number; sway?: boolean } = {}): THREE.ShaderMaterial {
  const k = s.key + (opts.transparent ? 't' + opts.opacity : '') + (opts.sway ? 'w' : ''); let m = fillCache.get(k); if (m) return m;
  m = new THREE.ShaderMaterial({
    vertexColors: true, side: THREE.DoubleSide, transparent: !!opts.transparent, depthWrite: !opts.transparent, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3,
    defines: opts.sway ? { SWAY: '' } : {},
    uniforms: { uSides: { value: new THREE.Vector3(...s.sides) }, uLight: { value: new THREE.Vector3(...s.light).normalize() }, uLo: { value: s.lo }, uCel: { value: s.cel ? 1 : 0 }, uOpacity: { value: opts.opacity ?? 1 }, uTime: inkTime, uNoise: { value: s.noise ?? 0 } },
    vertexShader: /* glsl */`
      uniform float uTime; varying vec3 vC; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 c = color; vec3 swayOff = vec3(0.0);
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        #ifdef USE_INSTANCING_COLOR
          c *= instanceColor;
        #endif
        ${SWAY}
        vC = c; vN = normalize(mat3(m) * normal); vW = (m * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * (m * vec4(position, 1.0) + vec4(swayOff, 0.0));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSides; uniform vec3 uLight; uniform float uLo; uniform float uCel; uniform float uOpacity; uniform float uNoise;
      varying vec3 vC; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); vec3 q = n * n; float shade;
        if (uCel > 0.5) shade = dot(n, uLight) > 0.12 ? 1.0 : uLo;
        else shade = q.y * (n.y > 0.0 ? uSides.x : uSides.z * 0.85) + q.x * uSides.y + q.z * uSides.z;
        if (uNoise > 0.0 && n.y > 0.6) { vec2 cell = floor(vW.xz * 8.0); float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453); float h2 = fract(sin(dot(floor(vW.xz * 2.0), vec2(39.3468, 11.135))) * 24634.6345); shade *= 1.0 + (h - 0.5) * uNoise + (h2 - 0.5) * uNoise * 0.5; }   // speckle: pixels and patches, like painted grass
        gl_FragColor = vec4(vC * shade, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  fillCache.set(k, m); return m;
}
const hullCache = new Map<string, THREE.ShaderMaterial>();
/** The outline of a round part: a larger copy, inside out, in ink. */
export function hullMaterial(s: InkStyle, sway = false): THREE.ShaderMaterial {
  const key = s.key + (sway ? 'w' : ''); let m = hullCache.get(key); if (m) return m;
  m = new THREE.ShaderMaterial({
    side: THREE.BackSide, defines: sway ? { SWAY: '' } : {}, uniforms: { uInk: { value: new THREE.Color(s.ink) }, uTime: inkTime },
    vertexShader: /* glsl */`
      uniform float uTime;
      void main() {
        mat4 m = modelMatrix; vec3 swayOff = vec3(0.0);
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        ${SWAY}
        gl_Position = projectionMatrix * viewMatrix * (m * vec4(position, 1.0) + vec4(swayOff, 0.0));
      }`,
    fragmentShader: /* glsl */`uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0);
      #include <colorspace_fragment>
    }`,
  });
  hullCache.set(key, m); return m;
}
export type LineClass = 'edge' | 'fine' | 'grid' | 'ripple';
const lineMats: LineMaterial[] = [];
export function lineMaterial(s: InkStyle, cls: LineClass): LineMaterial {
  const width = cls === 'edge' ? s.edge : cls === 'fine' ? s.fine : cls === 'grid' ? s.fine * 0.8 : s.fine * 1.4;
  const m = new LineMaterial({ color: cls === 'ripple' ? 0xffffff : s.ink, linewidth: width, worldUnits: true, transparent: cls === 'grid' || cls === 'ripple', opacity: cls === 'grid' ? s.grid : cls === 'ripple' ? 0.55 : 1, depthTest: true, depthWrite: false, alphaToCoverage: true });
  lineMats.push(m); return m;
}
/** LineMaterial needs the canvas size. */
export function setLineResolution(w: number, h: number) { for (const m of lineMats) m.resolution.set(w, h); }

// ---------- unit shapes (same sizes as the game's: box 1, radius 0.5, height 1) ----------
export const U_BOX = new THREE.BoxGeometry(1, 1, 1);
// Facet counts are a speed choice: a ball of 80 faces (not 320) and 12-sided cylinders read the same at park zoom,
// and trees and guests are most of what a frame draws (2.5 M triangles → about a quarter on a 1,500-guest park).
export const U_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
export const U_CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
export const U_CONE = new THREE.ConeGeometry(0.5, 1, 12);
export const U_BALL = new THREE.IcosahedronGeometry(0.5, 1);
/** The outline of a small ball (a head, a balloon) is a thin rim: 20 faces draw it as well as 80. */
const U_BALL_RIM = new THREE.IcosahedronGeometry(0.5, 0);
export const U_DISC = new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2);
type Shape = 'box' | 'cyl' | 'cyl6' | 'cone' | 'ball' | 'custom';
const UNIT: Record<Exclude<Shape, 'custom'>, THREE.BufferGeometry> = { box: U_BOX, cyl: U_CYL, cyl6: U_CYL6, cone: U_CONE, ball: U_BALL };
const RING_N: Partial<Record<Shape, number>> = { cyl: 12, cyl6: 6, cone: 12 };

// ---------- the sketch ----------
interface Part { shape: Shape; color: number; m: THREE.Matrix4; scale: THREE.Vector3; base: THREE.Matrix4; lines: 'all' | 'rings' | 'none'; outline: boolean; cls?: LineClass; geo?: THREE.BufferGeometry }
type PartOpts = { lines?: 'all' | 'rings' | 'none'; outline?: boolean; cls?: LineClass };
const tmpC = new THREE.Color();
export class Sketch {
  parts: Part[] = []; quads: { p: number[]; c: number }[] = []; strokes: Record<LineClass, number[]> = { edge: [], fine: [], grid: [], ripple: [] };
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  get base() { return this.stack[this.stack.length - 1]; }
  push(m: THREE.Matrix4) { this.stack.push(this.base.clone().multiply(m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  at(x: number, y: number, z: number, ry = 0) { return this.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1))); }
  /** A part like the game's part(): unit shape, colour, centre, Euler rotation, size. */
  part(shape: Shape, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, o: PartOpts = {}) {
    const scale = new THREE.Vector3(sx, sy, sz); const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    this.parts.push({ shape, color, m, scale, base: this.base.clone(), lines: o.lines ?? (shape === 'box' ? 'all' : shape === 'ball' ? 'none' : 'rings'), outline: o.outline ?? shape !== 'box', cls: o.cls });
    return this;
  }
  box(color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, o: PartOpts = {}) { return this.part('box', color, x, y, z, 0, ry, 0, sx, sy, sz, o); }
  /** Any geometry, filled, no outline (draw its strokes yourself). */
  custom(geo: THREE.BufferGeometry, color: number, m = new THREE.Matrix4()) { this.parts.push({ shape: 'custom', color, m, scale: new THREE.Vector3(1, 1, 1), base: this.base.clone(), lines: 'none', outline: false, geo }); return this; }
  /** A ring of n segments in the current base: centre, radius, height (a horizontal circle). */
  ring(x: number, y: number, z: number, r: number, n = 16, cls: LineClass = 'fine') { const pts: [number, number, number][] = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]); } return this.line(pts, cls); }
  /** A flat polygon (3 or 4 corners, world-ish coordinates under the current base). */
  quad(pts: [number, number, number][], color: number, outline: LineClass | null = 'edge') {
    const v = pts.map(p => new THREE.Vector3(...p).applyMatrix4(this.base)); const flat: number[] = [];
    for (let i = 1; i < v.length - 1; i++) for (const q of [v[0], v[i], v[i + 1]]) flat.push(q.x, q.y, q.z);
    this.quads.push({ p: flat, c: color }); if (outline) this.line([...pts, pts[0]], outline);
    return this;
  }
  /** A stroke through points, in the current base. */
  line(pts: [number, number, number][] | THREE.Vector3[], cls: LineClass = 'edge') {
    const v = pts.map(p => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(...p)).applyMatrix4(this.base)); const out = this.strokes[cls];
    for (let i = 1; i < v.length; i++) out.push(v[i - 1].x, v[i - 1].y, v[i - 1].z, v[i].x, v[i].y, v[i].z);
    return this;
  }
  /** Raw world segments (already transformed). */
  segs(cls: LineClass, flat: number[]) { for (const n of flat) this.strokes[cls].push(n); return this; }
}

// ---------- building ----------
function partMatrix(p: Part, grow = 0): THREE.Matrix4 {
  const s = p.scale.clone(); if (grow) s.addScalar(grow * 2);
  return p.base.clone().multiply(p.m).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z));
}
function strokesOf(p: Part, cls: LineClass, out: Record<LineClass, number[]>) {
  if (p.lines === 'none') return; const M = partMatrix(p); const v = new THREE.Vector3(), w = new THREE.Vector3(); const seg = (a: number[], b: number[]) => { v.set(a[0], a[1], a[2]).applyMatrix4(M); w.set(b[0], b[1], b[2]).applyMatrix4(M); out[cls].push(v.x, v.y, v.z, w.x, w.y, w.z); };
  if (p.shape === 'box') {
    const c = [-0.5, 0.5];
    for (const a of c) for (const b of c) { seg([-0.5, a, b], [0.5, a, b]); seg([a, -0.5, b], [a, 0.5, b]); seg([a, b, -0.5], [a, b, 0.5]); }
    return;
  }
  const n = RING_N[p.shape]; if (!n) return;
  const ring = (y: number) => { for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; seg([Math.cos(a0) * 0.5, y, Math.sin(a0) * 0.5], [Math.cos(a1) * 0.5, y, Math.sin(a1) * 0.5]); } };
  ring(-0.5); if (p.shape !== 'cone') ring(0.5);
}
function painted(geo: THREE.BufferGeometry, color: number, M: THREE.Matrix4): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()); g.applyMatrix4(M); for (const a of Object.keys(g.attributes)) if (a !== 'position') g.deleteAttribute(a);
  const n = g.attributes.position.count; const arr = new Float32Array(n * 3); tmpC.setHex(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = tmpC.r; arr[i * 3 + 1] = tmpC.g; arr[i * 3 + 2] = tmpC.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
function mergeFlat(list: THREE.BufferGeometry[], withColor = true): THREE.BufferGeometry {
  let n = 0; for (const p of list) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const p of list) { pos.set(p.attributes.position.array as Float32Array, o * 3); if (withColor && p.attributes.color) col.set(p.attributes.color.array as Float32Array, o * 3); o += p.attributes.position.count; p.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (withColor) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;   // non-indexed, so every face keeps its own flat normal
}
function quadGeo(q: { p: number[]; c: number }): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(q.p, 3)); const n = q.p.length / 3; const arr = new Float32Array(n * 3); tmpC.setHex(q.c);
  for (let i = 0; i < n; i++) { arr[i * 3] = tmpC.r; arr[i * 3 + 1] = tmpC.g; arr[i * 3 + 2] = tmpC.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
export interface Built { fills: THREE.BufferGeometry | null; hull: THREE.BufferGeometry | null; strokes: Record<LineClass, number[]> }
/** Turn a sketch into geometry for one style. */
export function bake(sk: Sketch, s: InkStyle): Built {
  const fills: THREE.BufferGeometry[] = [], hulls: THREE.BufferGeometry[] = []; const strokes: Record<LineClass, number[]> = { edge: [...sk.strokes.edge], fine: [...sk.strokes.fine], grid: [...sk.strokes.grid], ripple: [...sk.strokes.ripple] };
  for (const p of sk.parts) {
    if (p.shape === 'custom') { fills.push(painted(p.geo!, p.color, p.base.clone().multiply(p.m))); continue; }
    fills.push(painted(UNIT[p.shape], p.color, partMatrix(p)));
    // outline: round parts always, every part in the bold style; never thicker than a third of the part's thinnest side
    const rim = p.shape === 'ball' && Math.max(p.scale.x, p.scale.y, p.scale.z) < 0.4 ? U_BALL_RIM : UNIT[p.shape];
    // a sketch drawn larger (a scaled base) keeps the same outline weight: the grow is set in world units, then undone by that scale
    const bs = p.base.getMaxScaleOnAxis(); const grow = Math.min(s.hull, 0.33 * Math.min(p.scale.x, p.scale.y, p.scale.z) * bs) / bs;
    if ((p.outline || s.hullAll) && s.hull > 0) hulls.push(painted(rim, 0, partMatrix(p, grow)));
    // strokes: box edges (full weight in fine, thin creases in bold), rings on cylinders and cones
    strokesOf(p, p.cls ?? (p.shape === 'box' && s.boxEdges ? 'edge' : 'fine'), strokes);
  }
  for (const q of sk.quads) fills.push(quadGeo(q));
  return { fills: fills.length ? mergeFlat(fills) : null, hull: hulls.length ? mergeFlat(hulls, false) : null, strokes };
}
export function strokeObjects(s: InkStyle, strokes: Record<LineClass, number[]>): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const cls of ['edge', 'fine', 'grid', 'ripple'] as LineClass[]) {
    const flat = strokes[cls]; if (!flat.length || (cls === 'grid' && !s.grid)) continue;
    const geo = new LineSegmentsGeometry().setPositions(flat); geo.computeBoundingSphere(); const l = new LineSegments2(geo, lineMaterial(s, cls)); l.renderOrder = 2; out.push(l);   // culled off screen like any mesh
  }
  return out;
}
/** A plain group (static scenery batches, rides, trains). */
export function buildGroup(sk: Sketch, s: InkStyle, opts: { opacity?: number } = {}): THREE.Group {
  const b = bake(sk, s); const group = new THREE.Group();
  if (b.fills) group.add(new THREE.Mesh(b.fills, opts.opacity !== undefined ? fillMaterial(s, { transparent: true, opacity: opts.opacity }) : fillMaterial(s)));
  if (b.hull) group.add(new THREE.Mesh(b.hull, hullMaterial(s)));
  for (const o of strokeObjects(s, b.strokes)) group.add(o);
  return group;
}
/** An instanced kind: fills + outline share instance matrices (strokes are not instanced: kinds use outlines). */
export class InkInstances {
  fills: THREE.InstancedMesh; hull: THREE.InstancedMesh | null; shadow: THREE.InstancedMesh | null; count = 0;
  constructor(sk: Sketch | Built, s: InkStyle, public max: number, colour = false, shadowSize = 0, sway = false) {
    const b = sk instanceof Sketch ? bake(sk, s) : sk;
    this.fills = new THREE.InstancedMesh(b.fills!, fillMaterial(s, { sway }), max); if (colour) this.fills.setColorAt(0, new THREE.Color(1, 1, 1));
    this.hull = b.hull ? new THREE.InstancedMesh(b.hull, hullMaterial(s, sway), max) : null;
    this.shadow = s.shadows && shadowSize ? new THREE.InstancedMesh(new THREE.CircleGeometry(shadowSize, 16).rotateX(-Math.PI / 2).translate(0, 0.012, 0), new THREE.MeshBasicMaterial({ color: 0x0b1a10, transparent: true, opacity: 0.22, depthWrite: false }), max) : null;
    for (const m of this.all()) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
  }
  all() { return [this.fills, this.hull, this.shadow].filter(Boolean) as THREE.InstancedMesh[]; }
  addTo(o: THREE.Object3D) { for (const m of this.all()) o.add(m); }
  private flat = new THREE.Matrix4();
  set(i: number, m: THREE.Matrix4, colour?: THREE.Color) {
    this.fills.setMatrixAt(i, m); this.hull?.setMatrixAt(i, m); if (colour) this.fills.setColorAt(i, colour);
    if (this.shadow) { const p = new THREE.Vector3().setFromMatrixPosition(m); this.flat.makeTranslation(p.x, p.y, p.z); this.shadow.setMatrixAt(i, this.flat); }
  }
  commit(n: number) { this.count = n; for (const m of this.all()) { m.count = n; m.instanceMatrix.needsUpdate = true; } if (this.fills.instanceColor) this.fills.instanceColor.needsUpdate = true; }
  /** For instances that stay put (scenery): measure where they are, so the patch is skipped when off screen. */
  cullable() { for (const m of this.all()) { m.computeBoundingSphere(); m.frustumCulled = true; } }
}

// ---------- the flat (orthographic) camera ----------
export class InkCamera {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 800);
  target = new THREE.Vector3(32, 0, 40); heading = Math.PI / 4; elevation = Math.PI / 6; zoom = 1; view = 26; w = 1; h = 1;
  resize(w: number, h: number) { this.w = w; this.h = h; this.update(); }
  update() {
    const half = this.view / this.zoom / 2, a = this.w / this.h; const c = this.camera;
    c.left = -half * a; c.right = half * a; c.top = half; c.bottom = -half; c.updateProjectionMatrix();
    const ce = Math.cos(this.elevation); const d = 300;
    c.position.set(this.target.x + Math.sin(this.heading) * ce * d, this.target.y + Math.sin(this.elevation) * d, this.target.z + Math.cos(this.heading) * ce * d); c.lookAt(this.target); c.updateMatrixWorld(true);
  }
  /** Drag the ground under the pointer: dx, dy in screen pixels. */
  pan(dx: number, dy: number) {
    const per = this.view / this.zoom / this.h; const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)); const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.target.addScaledVector(right, -dx * per).addScaledVector(fwd, dy * per / Math.sin(this.elevation)); this.update();
  }
  orbit(dx: number, dy: number) { this.heading -= dx * 0.006; this.elevation = THREE.MathUtils.clamp(this.elevation + dy * 0.005, Math.PI / 12, (65 * Math.PI) / 180); this.update(); }
  zoomBy(f: number) { this.zoom = THREE.MathUtils.clamp(this.zoom * f, 0.35, 5); this.update(); }
}
