// Terraced low-poly terrain, water and paths, built per 16×16 chunk so edits only rebuild one chunk.
import * as THREE from 'three';
import { LAND_STEP, Surface, type GameState, type Tile } from '../sim/types';
import { tileAt } from '../sim/map';
import { HU, MAT } from './world';

const CH = 16;
/** Options the look sets before the ground is built: mottled grass (the sunny look) instead of the checker. */
export const TERRAIN = { mottle: false };
const SURF_COL: Record<number, [number, number]> = { 0: [0x5f9e43, 0x55913b], 1: [0xe0cf93, 0xd6c486], 2: [0x9a7446, 0x8c6a40], 3: [0x9a9a9a, 0x8a8a8a], 4: [0x4b7a35, 0x43702f] };
const CLIFF_COL: Record<number, number> = { 0: 0x6f5a35, 1: 0xb59f6a, 2: 0x6f5030, 3: 0x6b6b6b, 4: 0x5a4a2c };
const PATH_COL = [0x8e8a85, 0xa37556, 0x9ba39d]; const QUEUE_COL = 0x9a8f85; const RAIL_COL = 0xc0392b;

function pushQuad(out: number[], nor: number[], col: number[], a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color) {
  // two triangles a-b-c, a-c-d
  for (const p of [a, b, c, a, c, d]) { out.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(color.r, color.g, color.b); }
}
export class TerrainView {
  group = new THREE.Group(); chunks = new Map<number, { land: THREE.Mesh; water: THREE.Mesh | null; paths: THREE.Mesh | null }>(); dirty = new Set<number>();
  waterMat: THREE.MeshStandardMaterial; pathMat: THREE.MeshStandardMaterial; landTargets: THREE.Mesh[] = [];
  constructor(public scene: THREE.Scene, public g: GameState) {
    scene.add(this.group);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x3f86d8, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.1, flatShading: true });
    this.waterMat.onBeforeCompile = sh => { sh.uniforms.uTime = this.waterTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += sin(position.x * 2.1 + uTime * 1.3) * 0.025 + cos(position.z * 1.7 + uTime * 1.1) * 0.025;'); };
    this.pathMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    this.rebuildAll();
  }
  waterTime = { value: 0 };
  setGame(g: GameState) { this.g = g; this.rebuildAll(); }
  key(cx: number, cy: number) { return cy * 64 + cx; }
  markDirty(x: number, y: number) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = Math.floor((x + dx) / CH), cy = Math.floor((y + dy) / CH); if (cx >= 0 && cy >= 0 && cx * CH < this.g.w && cy * CH < this.g.h) this.dirty.add(this.key(cx, cy)); } }
  markAllDirty() { for (let cy = 0; cy * CH < this.g.h; cy++) for (let cx = 0; cx * CH < this.g.w; cx++) this.dirty.add(this.key(cx, cy)); }
  rebuildAll() { for (const c of this.chunks.values()) this.disposeChunk(c); this.chunks.clear(); this.landTargets = []; this.markAllDirty(); this.update(); }
  update() { for (const k of this.dirty) this.buildChunk(k % 64, Math.floor(k / 64)); this.dirty.clear(); }
  animate(t: number) { this.waterTime.value = t; }
  disposeChunk(c: { land: THREE.Mesh; water: THREE.Mesh | null; paths: THREE.Mesh | null }) { for (const m of [c.land, c.water, c.paths]) if (m) { this.group.remove(m); m.geometry.dispose(); } }
  buildChunk(cx: number, cy: number) {
    const k = this.key(cx, cy); const old = this.chunks.get(k); if (old) { this.disposeChunk(old); this.landTargets = this.landTargets.filter(m => m !== old.land); }
    const g = this.g; const pos: number[] = [], nor: number[] = [], col: number[] = []; const wpos: number[] = [], wnor: number[] = [], wcol: number[] = []; const ppos: number[] = [], pnor: number[] = [], pcol: number[] = [];
    const c = new THREE.Color();
    for (let y = cy * CH; y < Math.min(g.h, (cy + 1) * CH); y++) for (let x = cx * CH; x < Math.min(g.w, (cx + 1) * CH); x++) {
      const t = g.tiles[y * g.w + x]; const h = t.h * HU; const v = (x * 7 + y * 13) & 1;
      const base = SURF_COL[t.surf] ?? SURF_COL[0]; c.setHex(base[TERRAIN.mottle ? 0 : v]); if (!t.owned) c.multiplyScalar(0.72);
      if (TERRAIN.mottle) {   // sunny look: four small squares a tile, each a little lighter or darker, so grass reads as grass
        for (const [sx, sy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) { const k = Math.sin((x + sx) * 12.9898 + (y + sy) * 78.233) * 43758.5453; const tint = 0.9 + (k - Math.floor(k)) * 0.18; const cc = c.clone().multiplyScalar(tint);
          pushQuad(pos, nor, col, [x + sx, h, y + sy], [x + sx, h, y + sy + 0.5], [x + sx + 0.5, h, y + sy + 0.5], [x + sx + 0.5, h, y + sy], [0, 1, 0], cc); }
      } else pushQuad(pos, nor, col, [x, h, y], [x, h, y + 1], [x + 1, h, y + 1], [x + 1, h, y], [0, 1, 0], c);
      // cliff faces towards lower neighbours (all four sides, since the camera orbits)
      const cliff = new THREE.Color(CLIFF_COL[t.surf] ?? CLIFF_COL[0]); if (!t.owned) cliff.multiplyScalar(0.75);
      const nb = (dx: number, dy: number) => { const n = tileAt(g, x + dx, y + dy); return n ? n.h * HU : -2; };
      const hS = nb(0, 1), hN = nb(0, -1), hE = nb(1, 0), hW = nb(-1, 0);
      if (hS < h) pushQuad(pos, nor, col, [x, h, y + 1], [x, hS, y + 1], [x + 1, hS, y + 1], [x + 1, h, y + 1], [0, 0, 1], cliff);
      if (hN < h) pushQuad(pos, nor, col, [x + 1, h, y], [x + 1, hN, y], [x, hN, y], [x, h, y], [0, 0, -1], cliff);
      if (hE < h) pushQuad(pos, nor, col, [x + 1, h, y + 1], [x + 1, hE, y + 1], [x + 1, hE, y], [x + 1, h, y], [1, 0, 0], cliff);
      if (hW < h) pushQuad(pos, nor, col, [x, h, y], [x, hW, y], [x, hW, y + 1], [x, h, y + 1], [-1, 0, 0], cliff);
      if (t.water) { const wh = (t.h + LAND_STEP) * HU - 0.08; const wc = new THREE.Color(0xffffff); pushQuad(wpos, wnor, wcol, [x, wh, y], [x, wh, y + 1], [x + 1, wh, y + 1], [x + 1, wh, y], [0, 1, 0], wc); }
      if (t.path) this.pathTile(ppos, pnor, pcol, x, y, t);
    }
    const land = new THREE.Mesh(this.geo(pos, nor, col), MAT); land.receiveShadow = true; land.castShadow = false; land.userData.terrain = true; this.group.add(land); this.landTargets.push(land);
    let water: THREE.Mesh | null = null; if (wpos.length) { water = new THREE.Mesh(this.geo(wpos, wnor, wcol), this.waterMat); water.receiveShadow = true; this.group.add(water); }
    let paths: THREE.Mesh | null = null; if (ppos.length) { paths = new THREE.Mesh(this.geo(ppos, pnor, pcol), this.pathMat); paths.receiveShadow = true; paths.castShadow = true; this.group.add(paths); }
    this.chunks.set(k, { land, water, paths });
  }
  geo(pos: number[], nor: number[], col: number[]) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return ge; }
  pathTile(pos: number[], nor: number[], col: number[], x: number, y: number, t: Tile) {
    const p = t.path!; const c = new THREE.Color(p.queue ? QUEUE_COL : PATH_COL[p.style] ?? PATH_COL[0]); if (((x * 7 + y * 13) & 1) === 0) c.multiplyScalar(0.94);
    const h0 = t.h * HU + 0.03; const up = LAND_STEP * HU; const inset = 0.04;
    // corners: a=(x,y) b=(x,y+1) c=(x+1,y+1) d=(x+1,y); a ramp raises the two corners on the slope side
    const hi = (cx: number, cy: number) => { if (p.slope === -1) return h0; const d = p.slope; const onHigh = d === 0 ? cx === 1 : d === 1 ? cy === 1 : d === 2 ? cx === 0 : cy === 0; return h0 + (onHigh ? up : 0); };
    const A = [x + inset, hi(0, 0), y + inset], B = [x + inset, hi(0, 1), y + 1 - inset], C = [x + 1 - inset, hi(1, 1), y + 1 - inset], D = [x + 1 - inset, hi(1, 0), y + inset];
    pushQuad(pos, nor, col, A, B, C, D, [0, 1, 0], c);
    if (p.slope !== -1) { // ramp sides
      const side = new THREE.Color(0x6b665f);
      pushQuad(pos, nor, col, [A[0], A[1], A[2]], [A[0], h0 - 0.02, A[2]], [B[0], h0 - 0.02, B[2]], [B[0], B[1], B[2]], [-1, 0, 0], side);
      pushQuad(pos, nor, col, [D[0], D[1], D[2]], [C[0], C[1], C[2]], [C[0], h0 - 0.02, C[2]], [D[0], h0 - 0.02, D[2]], [1, 0, 0], side);
      pushQuad(pos, nor, col, [B[0], B[1], B[2]], [B[0], h0 - 0.02, B[2]], [C[0], h0 - 0.02, C[2]], [C[0], C[1], C[2]], [0, 0, 1], side);
      pushQuad(pos, nor, col, [D[0], D[1], D[2]], [D[0], h0 - 0.02, D[2]], [A[0], h0 - 0.02, A[2]], [A[0], A[1], A[2]], [0, 0, -1], side);
    }
    if (p.queue) { // low railings along the two long edges (approximate: both axes get posts at the corners)
      const rc = new THREE.Color(RAIL_COL); const rh = 0.22;
      for (const [sx, sz, ex, ez] of [[x + 0.08, y + 0.08, x + 0.92, y + 0.08], [x + 0.08, y + 0.92, x + 0.92, y + 0.92], [x + 0.08, y + 0.08, x + 0.08, y + 0.92], [x + 0.92, y + 0.08, x + 0.92, y + 0.92]]) {
        pushQuad(pos, nor, col, [sx, h0 + rh, sz], [sx, h0 + rh - 0.03, sz], [ex, h0 + rh - 0.03, ez], [ex, h0 + rh, ez], [0, 0, 1], rc);
        pushQuad(pos, nor, col, [ex, h0 + rh, ez], [ex, h0 + rh - 0.03, ez], [sx, h0 + rh - 0.03, sz], [sx, h0 + rh, sz], [0, 0, -1], rc);
      }
    }
    if (p.adds.bench && !p.broken) { const bc = new THREE.Color(0x8a5a2b); pushQuad(pos, nor, col, [x + 0.2, h0 + 0.18, y + 0.35], [x + 0.2, h0 + 0.18, y + 0.5], [x + 0.8, h0 + 0.18, y + 0.5], [x + 0.8, h0 + 0.18, y + 0.35], [0, 1, 0], bc); pushQuad(pos, nor, col, [x + 0.2, h0 + 0.42, y + 0.33], [x + 0.2, h0 + 0.18, y + 0.33], [x + 0.8, h0 + 0.18, y + 0.33], [x + 0.8, h0 + 0.42, y + 0.33], [0, 0, -1], bc); }
    if (p.adds.bin !== undefined) { const bc = new THREE.Color(p.adds.bin >= 8 ? 0x9a8f7a : 0x666666); const bx = x + 0.15, bz = y + 0.15, s = 0.14, bh = 0.3; pushQuad(pos, nor, col, [bx, h0 + bh, bz], [bx, h0 + bh, bz + s], [bx + s, h0 + bh, bz + s], [bx + s, h0 + bh, bz], [0, 1, 0], bc); pushQuad(pos, nor, col, [bx, h0 + bh, bz], [bx, h0, bz], [bx, h0, bz + s], [bx, h0 + bh, bz + s], [-1, 0, 0], bc); pushQuad(pos, nor, col, [bx, h0 + bh, bz + s], [bx, h0, bz + s], [bx + s, h0, bz + s], [bx + s, h0 + bh, bz + s], [0, 0, 1], bc); pushQuad(pos, nor, col, [bx + s, h0 + bh, bz + s], [bx + s, h0, bz + s], [bx + s, h0, bz], [bx + s, h0 + bh, bz], [1, 0, 0], bc); pushQuad(pos, nor, col, [bx + s, h0 + bh, bz], [bx + s, h0, bz], [bx, h0, bz], [bx, h0 + bh, bz], [0, 0, -1], bc); }
    if (p.adds.lamp) { const lc = new THREE.Color(0x444444); const lx = x + 0.85, lz = y + 0.85, s = 0.05; pushQuad(pos, nor, col, [lx, h0 + 1.2, lz], [lx, h0, lz], [lx + s, h0, lz], [lx + s, h0 + 1.2, lz], [0, 0, -1], lc); pushQuad(pos, nor, col, [lx + s, h0 + 1.2, lz], [lx + s, h0, lz], [lx + s, h0, lz + s], [lx + s, h0 + 1.2, lz + s], [1, 0, 0], lc); pushQuad(pos, nor, col, [lx + s, h0 + 1.2, lz + s], [lx + s, h0, lz + s], [lx, h0, lz + s], [lx, h0 + 1.2, lz + s], [0, 0, 1], lc); pushQuad(pos, nor, col, [lx, h0 + 1.2, lz + s], [lx, h0, lz + s], [lx, h0, lz], [lx, h0 + 1.2, lz], [-1, 0, 0], lc);
      const gc = new THREE.Color(0xffe680); const hx = lx - 0.05, hz = lz - 0.05, hs = 0.15, hy = h0 + 1.2; pushQuad(pos, nor, col, [hx, hy + 0.12, hz], [hx, hy + 0.12, hz + hs], [hx + hs, hy + 0.12, hz + hs], [hx + hs, hy + 0.12, hz], [0, 1, 0], gc); pushQuad(pos, nor, col, [hx, hy + 0.12, hz], [hx, hy, hz], [hx, hy, hz + hs], [hx, hy + 0.12, hz + hs], [-1, 0, 0], gc); pushQuad(pos, nor, col, [hx + hs, hy + 0.12, hz + hs], [hx + hs, hy, hz + hs], [hx + hs, hy, hz], [hx + hs, hy + 0.12, hz], [1, 0, 0], gc); pushQuad(pos, nor, col, [hx, hy + 0.12, hz + hs], [hx, hy, hz + hs], [hx + hs, hy, hz + hs], [hx + hs, hy + 0.12, hz + hs], [0, 0, 1], gc); pushQuad(pos, nor, col, [hx + hs, hy + 0.12, hz], [hx + hs, hy, hz], [hx, hy, hz], [hx, hy + 0.12, hz], [0, 0, -1], gc); }
    for (let i = 0; i < Math.min(t.litter, 6); i++) { const lc = new THREE.Color(i % 2 ? 0xe8e8e8 : 0xc9a35b); const lx = x + 0.15 + ((i * 7 + x * 3) % 7) / 10, lz = y + 0.15 + ((i * 5 + y) % 7) / 10; pushQuad(pos, nor, col, [lx, h0 + 0.012, lz], [lx, h0 + 0.012, lz + 0.08], [lx + 0.1, h0 + 0.012, lz + 0.08], [lx + 0.1, h0 + 0.012, lz], [0, 1, 0], lc); }
    for (let i = 0; i < Math.min(t.vomit, 3); i++) { const vc = new THREE.Color(0x8fbf3a); const lx = x + 0.3 + i * 0.2, lz = y + 0.5; pushQuad(pos, nor, col, [lx, h0 + 0.012, lz], [lx, h0 + 0.012, lz + 0.14], [lx + 0.16, h0 + 0.012, lz + 0.14], [lx + 0.16, h0 + 0.012, lz], [0, 1, 0], vc); }
  }
}
export { Surface };
