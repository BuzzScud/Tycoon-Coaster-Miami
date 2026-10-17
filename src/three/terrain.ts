// Terraced low-poly terrain, water and paths, built per 16×16 chunk so edits only rebuild one chunk.
import * as THREE from 'three';
import { LAND_STEP, Surface, DX, DY, type Dir, type GameState, type Tile, type PathTile } from '../sim/types';
import { tileAt, corners, foldMain, landZ, landTop, waterZ, pathLink, edgeZ, CORNER_OFF, PATH_CLEAR } from '../sim/map';
import { HU, MAT } from './world';

const CH = 16;
/** Options the look sets before the ground is built: mottled grass (the sunny look) instead of the checker. */
export const TERRAIN = { mottle: false, under: false };
const MAT_SEE = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.02, transparent: true, opacity: 0.32, depthWrite: false });
const SURF_COL: Record<number, [number, number]> = { 0: [0x5f9e43, 0x55913b], 1: [0xe0cf93, 0xd6c486], 2: [0x9a7446, 0x8c6a40], 3: [0x9a9a9a, 0x8a8a8a], 4: [0x4b7a35, 0x43702f] };
const CLIFF_COL: Record<number, number> = { 0: 0x6f5a35, 1: 0xb59f6a, 2: 0x6f5030, 3: 0x6b6b6b, 4: 0x5a4a2c };
const PATH_COL = [0x8e8a85, 0xa37556, 0x9ba39d]; const QUEUE_COL = 0x9a8f85; const RAIL_COL = 0xc0392b;

function pushQuad(out: number[], nor: number[], col: number[], a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color) {
  // two triangles a-b-c, a-c-d
  for (const p of [a, b, c, a, c, d]) { out.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(color.r, color.g, color.b); }
}
function pushTri(out: number[], nor: number[], col: number[], a: number[], b: number[], c: number[], color: THREE.Color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx, ny, nz) || 1;
  for (const p of [a, b, c]) { out.push(p[0], p[1], p[2]); nor.push(nx / l, ny / l, nz / l); col.push(color.r, color.g, color.b); }
}
/** Each side's two corners (east, south, west, north), the matching corner next door, and the side's outward normal. */
const SIDE: [number, number][] = [[1, 2], [3, 2], [0, 3], [0, 1]];
const MATE: Record<number, number>[] = [{ 1: 0, 2: 3 }, { 3: 0, 2: 1 }, { 0: 1, 3: 2 }, { 0: 3, 1: 2 }];
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
      const t = g.tiles[y * g.w + x]; const cz = corners(t).map(q => q * HU); const v = (x * 7 + y * 13) & 1;
      const base = SURF_COL[t.surf] ?? SURF_COL[0]; c.setHex(base[TERRAIN.mottle ? 0 : v]); if (!t.owned) c.multiplyScalar(0.72);
      const P = CORNER_OFF.map(([ox, oy], i) => [x + ox, cz[i], y + oy]);
      if (TERRAIN.mottle && !t.slope) {   // sunny look: four small squares a tile, each a little lighter or darker, so grass reads as grass
        const h = cz[0];
        for (const [sx, sy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) { const k = Math.sin((x + sx) * 12.9898 + (y + sy) * 78.233) * 43758.5453; const tint = 0.9 + (k - Math.floor(k)) * 0.18; const cc = c.clone().multiplyScalar(tint);
          pushQuad(pos, nor, col, [x + sx, h, y + sy], [x + sx, h, y + sy + 0.5], [x + sx + 0.5, h, y + sy + 0.5], [x + sx + 0.5, h, y + sy], [0, 1, 0], cc); }
      } else if (!t.slope) pushQuad(pos, nor, col, P[0], P[3], P[2], P[1], [0, 1, 0], c);
      else if (foldMain(corners(t))) { pushTri(pos, nor, col, P[0], P[2], P[1], c); pushTri(pos, nor, col, P[0], P[3], P[2], c); }   // the land's slope folds along RCT's crease
      else { pushTri(pos, nor, col, P[0], P[3], P[1], c); pushTri(pos, nor, col, P[1], P[3], P[2], c); }
      // cliff faces where the land next door is lower at this side's corners (all four sides, since the camera orbits)
      const cliff = new THREE.Color(CLIFF_COL[t.surf] ?? CLIFF_COL[0]); if (!t.owned) cliff.multiplyScalar(0.75);
      for (let d = 0; d < 4; d++) {
        const nb = tileAt(g, x + DX[d], y + DY[d]); const nc = nb ? corners(nb).map(q => q * HU) : null; const [i, j] = SIDE[d];
        const li = nc ? Math.min(cz[i], nc[MATE[d][i]]) : -2, lj = nc ? Math.min(cz[j], nc[MATE[d][j]]) : -2; if (li >= cz[i] && lj >= cz[j]) continue;
        const pi = P[i], pj = P[j], n = [DX[d], 0, DY[d]];
        // wound so the face looks outward: east and north sides go i→j, south and west j→i
        if (d === 0 || d === 3) pushQuad(pos, nor, col, pj, [pj[0], lj, pj[2]], [pi[0], li, pi[2]], pi, n, cliff); else pushQuad(pos, nor, col, pi, [pi[0], li, pi[2]], [pj[0], lj, pj[2]], pj, n, cliff);
      }
      const wz = waterZ(t); if (wz !== null) { const wh = wz * HU - 0.08; const wc = new THREE.Color(0xffffff); pushQuad(wpos, wnor, wcol, [x, wh, y], [x, wh, y + 1], [x + 1, wh, y + 1], [x + 1, wh, y], [0, 1, 0], wc); }
      t.paths.forEach((p, i) => this.pathTile(ppos, pnor, pcol, x, y, t, p, i === 0));
    }
    const land = new THREE.Mesh(this.geo(pos, nor, col), TERRAIN.under ? MAT_SEE : MAT); land.receiveShadow = true; land.castShadow = false; land.userData.terrain = true; this.group.add(land); this.landTargets.push(land);
    let water: THREE.Mesh | null = null; if (wpos.length) { water = new THREE.Mesh(this.geo(wpos, wnor, wcol), this.waterMat); water.receiveShadow = true; this.group.add(water); }
    let paths: THREE.Mesh | null = null; if (ppos.length) { paths = new THREE.Mesh(this.geo(ppos, pnor, pcol), this.pathMat); paths.receiveShadow = true; paths.castShadow = true; this.group.add(paths); }
    this.chunks.set(k, { land, water, paths });
  }
  geo(pos: number[], nor: number[], col: number[]) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return ge; }
  pathTile(pos: number[], nor: number[], col: number[], x: number, y: number, t: Tile, p: PathTile, first: boolean) {
    const g = this.g;
    if (p.z + PATH_CLEAR <= t.h && !TERRAIN.under) {   // deep in a tunnel: hidden, but where it comes out of the hill, a dark mouth
      for (let d = 0; d < 4; d++) { const q = pathLink(g, x, y, p, d as Dir); const nb = tileAt(g, x + DX[d], y + DY[d]); if (!q || !nb || q.z + PATH_CLEAR <= nb.h) continue;
        const z0 = (edgeZ(p, d as Dir) ?? p.z) * HU, ex = x + (d === 0 ? 1.012 : d === 2 ? -0.012 : 0), ey = y + (d === 1 ? 1.012 : d === 3 ? -0.012 : 0), along = d === 0 || d === 2;
        const a = [ex, z0, ey], b = along ? [ex, z0, ey + 1] : [ex + 1, z0, ey]; pushQuad(pos, nor, col, [a[0], z0 + 0.62, a[2]], a, b, [b[0], z0 + 0.62, b[2]], [DX[d], 0, DY[d]], new THREE.Color(0x1d201c)); }
      return;
    }
    const c = new THREE.Color(p.queue ? QUEUE_COL : PATH_COL[p.style] ?? PATH_COL[0]); if (((x * 7 + y * 13) & 1) === 0) c.multiplyScalar(0.94);
    const h0 = p.z * HU + 0.03; const up = LAND_STEP * HU; const inset = 0.04;
    // corners: a=(x,y) b=(x,y+1) c=(x+1,y+1) d=(x+1,y); a ramp raises the two corners on the slope side
    const hi = (cx: number, cy: number) => { if (p.slope === -1) return h0; const d = p.slope; const onHigh = d === 0 ? cx === 1 : d === 1 ? cy === 1 : d === 2 ? cx === 0 : cy === 0; return h0 + (onHigh ? up : 0); };
    const A = [x + inset, hi(0, 0), y + inset], B = [x + inset, hi(0, 1), y + 1 - inset], C = [x + 1 - inset, hi(1, 1), y + 1 - inset], D = [x + 1 - inset, hi(1, 0), y + inset];
    pushQuad(pos, nor, col, A, B, C, D, [0, 1, 0], c);
    if (p.z > landTop(t) + 0.5) {   // a bridge: a deck under the path and posts down to the land
      const deck = new THREE.Color(0x7d776e), dh = 0.08;
      pushQuad(pos, nor, col, [A[0], A[1] - dh, A[2]], [D[0], D[1] - dh, D[2]], [C[0], C[1] - dh, C[2]], [B[0], B[1] - dh, B[2]], [0, -1, 0], deck);
      for (const [px, py] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) { const g0 = Math.max(landZ(t, px, py), waterZ(t) ?? -1) * HU, top = hi(px < 0.5 ? 0 : 1, py < 0.5 ? 0 : 1) - dh, s = 0.035; if (top - g0 < 0.05) continue; const bx = x + px, bz = y + py;
        pushQuad(pos, nor, col, [bx - s, top, bz - s], [bx - s, g0, bz - s], [bx + s, g0, bz - s], [bx + s, top, bz - s], [0, 0, -1], deck); pushQuad(pos, nor, col, [bx + s, top, bz - s], [bx + s, g0, bz - s], [bx + s, g0, bz + s], [bx + s, top, bz + s], [1, 0, 0], deck);
        pushQuad(pos, nor, col, [bx + s, top, bz + s], [bx + s, g0, bz + s], [bx - s, g0, bz + s], [bx - s, top, bz + s], [0, 0, 1], deck); pushQuad(pos, nor, col, [bx - s, top, bz + s], [bx - s, g0, bz + s], [bx - s, g0, bz - s], [bx - s, top, bz - s], [-1, 0, 0], deck); }
    }
    if (p.slope !== -1 || p.z > landTop(t) + 0.5) { // ramp and deck sides
      const side = new THREE.Color(0x6b665f); const lifted = p.z > landTop(t) + 0.5; const lo = (q: number[]) => (lifted ? q[1] - 0.08 : h0 - 0.02);
      pushQuad(pos, nor, col, [A[0], A[1], A[2]], [A[0], lo(A), A[2]], [B[0], lo(B), B[2]], [B[0], B[1], B[2]], [-1, 0, 0], side);
      pushQuad(pos, nor, col, [D[0], D[1], D[2]], [C[0], C[1], C[2]], [C[0], lo(C), C[2]], [D[0], lo(D), D[2]], [1, 0, 0], side);
      pushQuad(pos, nor, col, [B[0], B[1], B[2]], [B[0], lo(B), B[2]], [C[0], lo(C), C[2]], [C[0], C[1], C[2]], [0, 0, 1], side);
      pushQuad(pos, nor, col, [D[0], D[1], D[2]], [D[0], lo(D), D[2]], [A[0], lo(A), A[2]], [A[0], A[1], A[2]], [0, 0, -1], side);
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
    if (!first) return;
    for (let i = 0; i < Math.min(t.litter, 6); i++) { const lc = new THREE.Color(i % 2 ? 0xe8e8e8 : 0xc9a35b); const lx = x + 0.15 + ((i * 7 + x * 3) % 7) / 10, lz = y + 0.15 + ((i * 5 + y) % 7) / 10; pushQuad(pos, nor, col, [lx, h0 + 0.012, lz], [lx, h0 + 0.012, lz + 0.08], [lx + 0.1, h0 + 0.012, lz + 0.08], [lx + 0.1, h0 + 0.012, lz], [0, 1, 0], lc); }
    for (let i = 0; i < Math.min(t.vomit, 3); i++) { const vc = new THREE.Color(0x8fbf3a); const lx = x + 0.3 + i * 0.2, lz = y + 0.5; pushQuad(pos, nor, col, [lx, h0 + 0.012, lz], [lx, h0 + 0.012, lz + 0.14], [lx + 0.16, h0 + 0.012, lz + 0.14], [lx + 0.16, h0 + 0.012, lz], [0, 1, 0], vc); }
  }
}
export { Surface };
