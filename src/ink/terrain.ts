// The ground in ink: land tops (one colour, or today's checker), cliffs and a skirt round the map so the park
// sits like a block on the page, a faint tile grid, paths with inked borders, water with a shoreline.
import * as THREE from 'three';
import { DX, DY, LAND_STEP, type Dir, type GameState, type Tile, type PathTile } from '../sim/types';
import { tileAt, corners, foldMain, landZ, landTop, waterZ, pathLink, edgeZ, CORNER_OFF, PATH_CLEAR } from '../sim/map';
import { HU } from '../three/world';
import { Sketch, buildGroup, groundStyle, type InkStyle } from './kit';

const INK_PAL = { surf: { 0: [0x5f9e43, 0x55913b], 1: [0xe0cf93, 0xd6c486], 2: [0x9a7446, 0x8c6a40], 3: [0x9a9a9a, 0x8a8a8a], 4: [0x4b7a35, 0x43702f] } as Record<number, [number, number]>, cliff: { 0: 0x6f5a35, 1: 0xb59f6a, 2: 0x6f5030, 3: 0x6b6b6b, 4: 0x5a4a2c } as Record<number, number>, path: [0x8e8a85, 0xa37556, 0x9ba39d], queue: 0x9a8f85, water: 0x3f86d8 };
/** RCT's ground: deeper grass, earthy cliffs, grey tarmac, a strong blue sea. */
const RCT_PAL: typeof INK_PAL = { surf: { 0: [0x3f8a26, 0x3f8a26], 1: [0xd9c27a, 0xd9c27a], 2: [0x8a5f33, 0x8a5f33], 3: [0x8e8e86, 0x8e8e86], 4: [0x2f6e1f, 0x2f6e1f] }, cliff: { 0: 0x6b4526, 1: 0xa8874f, 2: 0x6b4526, 3: 0x6e6e66, 4: 0x5a3a20 }, path: [0x7d7d78, 0x9c5e3c, 0x8f938a], queue: 0x8a7d66, water: 0x2f62c4 };
let SURF_COL = INK_PAL.surf, CLIFF_COL = INK_PAL.cliff, PATH_COL = INK_PAL.path, QUEUE_COL = INK_PAL.queue, WATER = INK_PAL.water;
const usePalette = (s: InkStyle) => { const p = s.palette === 'rct' ? RCT_PAL : INK_PAL; SURF_COL = p.surf; CLIFF_COL = p.cliff; PATH_COL = p.path; QUEUE_COL = p.queue; WATER = p.water; };
const BASE = -0.7;   // the bottom of the map block
const dim = (c: number, k: number) => { const x = new THREE.Color(c).multiplyScalar(k); return x.getHex(); };

/** The whole map in one group (the preview page). */
export function inkGround(g: GameState, s: InkStyle): THREE.Group { return inkChunk(g, s, 0, 0, Math.max(g.w, g.h)); }
/** One square patch of the map, x0..x0+n, y0..y0+n (the game rebuilds only the patch an edit touched). */
/** The view's ground options: `under` sees through the land (RCT's underground view), so tunnels show. */
export const GROUND = { under: false };
export function inkChunk(g: GameState, s: InkStyle, x0: number, y0: number, n: number): THREE.Group {
  const sk = new Sketch(), land = GROUND.under ? new Sketch() : sk; usePalette(s);
  for (let y = y0; y < Math.min(g.h, y0 + n); y++) for (let x = x0; x < Math.min(g.w, x0 + n); x++) {
    const t = g.tiles[y * g.w + x]; const c = corners(t).map(v => v * HU); const v = s.checker ? (x * 7 + y * 13) & 1 : 0;
    let col = t.water ? dim((SURF_COL[t.surf] ?? SURF_COL[0])[0], 0.8) : (SURF_COL[t.surf] ?? SURF_COL[0])[v]; if (!t.owned) col = dim(col, s.outside);
    // the land's top: flat, or two triangles folded along RCT's crease
    const P = CORNER_OFF.map(([ox, oy], i) => [x + ox, c[i], y + oy] as [number, number, number]);
    if (!t.slope) land.quad([P[0], P[3], P[2], P[1]], col, null);
    else for (const [a, b, d] of foldMain(corners(t)) ? [[0, 2, 1], [0, 3, 2]] : [[0, 3, 1], [1, 3, 2]]) land.quad([P[a], P[b], P[d]], lit(col, P[a], P[b], P[d]), null);
    // cliff faces where the land next door is lower at this side's corners, and the skirt down to the base at the map's edge
    const cliff = t.owned ? (CLIFF_COL[t.surf] ?? CLIFF_COL[0]) : dim(CLIFF_COL[t.surf] ?? CLIFF_COL[0], s.outside);
    for (let d = 0; d < 4; d++) {
      const nb = tileAt(g, x + DX[d], y + DY[d]); const [i, j] = SIDE[d]; const nc = nb ? corners(nb).map(q => q * HU) : null;
      const lo = (k: number) => (nc ? Math.min(c[k], nc[MATE[d][k]]) : BASE);
      const li = lo(i), lj = lo(j); if (li >= c[i] && lj >= c[j]) continue;
      const pi = P[i], pj = P[j];
      land.quad([pi, pj, [pj[0], lj, pj[2]], [pi[0], li, pi[2]]], cliff, null);
      sk.line([pi, pj], 'edge'); sk.line([[pi[0], li, pi[2]], [pj[0], lj, pj[2]]], nb ? 'fine' : 'edge');
      for (const [pt, low, k] of [[pi, li, i], [pj, lj, j]] as const) { const goesOn = c[k] - low > 0.001; if (goesOn) sk.line([pt, [pt[0], low, pt[2]]], nb ? 'fine' : 'edge'); }
    }
    // the faint grid between tiles of plain ground; it follows the slopes, so hills read as hills
    if (s.grid && !t.water && !t.paths.length) for (const d of [0, 1] as Dir[]) {
      const nb = tileAt(g, x + DX[d], y + DY[d]); if (!nb || nb.water || nb.paths.length) continue; const nc = corners(nb).map(q => q * HU); const [i, j] = SIDE[d];
      if (Math.abs(nc[MATE[d][i]] - c[i]) > 0.001 || Math.abs(nc[MATE[d][j]] - c[j]) > 0.001) continue;
      sk.line([[P[i][0], c[i] + 0.004, P[i][2]], [P[j][0], c[j] + 0.004, P[j][2]]], 'grid');
    }
    const wz = waterZ(t);
    if (wz !== null) {
      const h = wz * HU; sk.quad([[x, h, y], [x, h, y + 1], [x + 1, h, y + 1], [x + 1, h, y]], t.owned ? WATER : dim(WATER, s.outside), null);
      for (let d = 0; d < 4; d++) { const nb = tileAt(g, x + DX[d], y + DY[d]); if (nb && waterZ(nb) === null) { const [a, b] = edgeOf(x, y, d as Dir); sk.line([[a[0], h + 0.01, a[1]], [b[0], h + 0.01, b[1]]], 'edge'); } }
      const k = (x * 37 + y * 61) % 5; if (k < 2) { const ox = x + 0.25 + ((x * 13) % 4) * 0.08, oy = y + 0.3 + ((y * 7) % 4) * 0.1; sk.line([[ox, h + 0.012, oy], [ox + 0.28, h + 0.012, oy]], 'ripple'); }
    }
    t.paths.forEach((p, i) => path(sk, g, x, y, t, p, i === 0));
  }
  if (!GROUND.under) return buildGroup(sk, groundStyle(s));
  // see-through: the land first (it is what the pointer hits), faint, over the paths and tracks under it
  const grp = buildGroup(land, groundStyle(s), { opacity: 0.32 }); for (const o of [...buildGroup(sk, groundStyle(s)).children]) grp.add(o); return grp;
}
/** A slope's colour: lighter facing the light (north-west), darker facing away, as RCT shades its hills. */
function lit(col: number, a: number[], b: number[], c: number[]): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx, ny, nz) || 1;
  return dim(col, 1 - 0.55 * (0.6 * nx + 0.8 * nz) / l);
}
/** Each side's two corners (east, south, west, north) and, for each, the matching corner on the tile next door. */
const SIDE: [number, number][] = [[1, 2], [3, 2], [0, 3], [0, 1]];
const MATE: Record<number, number>[] = [{ 1: 0, 2: 3 }, { 3: 0, 2: 1 }, { 0: 1, 3: 2 }, { 0: 3, 1: 2 }];
/** The two ground corners of tile (x, y)'s side facing direction d. */
function edgeOf(x: number, y: number, d: Dir): [[number, number], [number, number]] {
  switch (d) { case 0: return [[x + 1, y + 1], [x + 1, y]]; case 1: return [[x, y + 1], [x + 1, y + 1]]; case 2: return [[x, y], [x, y + 1]]; default: return [[x + 1, y], [x, y]]; }
}
function path(sk: Sketch, g: GameState, x: number, y: number, t: Tile, p: PathTile, first: boolean) {
  const land = landTop(t);
  if (p.z + PATH_CLEAR <= t.h && !GROUND.under) {   // deep in a tunnel: hidden, but where it comes out of the hill, a dark mouth
    for (let d = 0; d < 4; d++) { const q = pathLink(g, x, y, p, d as Dir); const nb = tileAt(g, x + DX[d], y + DY[d]); if (!q || !nb || q.z + PATH_CLEAR <= nb.h) continue;
      const [a, b] = edgeOf(x, y, d as Dir); const ox = DX[d] * 0.012, oy = DY[d] * 0.012; const z0 = (edgeZ(p, d as Dir) ?? p.z) * HU + 0.01; sk.quad([[a[0] + ox, z0, a[1] + oy], [b[0] + ox, z0, b[1] + oy], [b[0] + ox, z0 + 0.62, b[1] + oy], [a[0] + ox, z0 + 0.62, a[1] + oy]], 0x1d201c, 'edge'); }
    return;
  }
  const h0 = p.z * HU + 0.025; const up = LAND_STEP * HU;
  const hi = (cx: number, cy: number) => { if (p.slope === -1) return h0; const d = p.slope; const onHigh = d === 0 ? cx === 1 : d === 1 ? cy === 1 : d === 2 ? cx === 0 : cy === 0; return h0 + (onHigh ? up : 0); };
  const A: [number, number, number] = [x, hi(0, 0), y], B: [number, number, number] = [x, hi(0, 1), y + 1], C: [number, number, number] = [x + 1, hi(1, 1), y + 1], D: [number, number, number] = [x + 1, hi(1, 0), y];
  sk.quad([A, B, C, D], p.queue ? QUEUE_COL : PATH_COL[p.style] ?? PATH_COL[0], null);
  // a bridge: the deck's edge and posts down to the land below
  const lifted = p.z > land + 0.5;
  if (lifted) {
    const deck = 0.07; for (const [a, b] of [[A, B], [B, C], [C, D], [D, A]] as const) sk.quad([a, b, [b[0], b[1] - deck, b[2]], [a[0], a[1] - deck, a[2]]], 0x7d776e, null);
    for (const [px, py] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) { const g0 = Math.max(landZ(t, px, py), waterZ(t) ?? -1) * HU; const top = hi(px < 0.5 ? 0 : 1, py < 0.5 ? 0 : 1) - deck; if (top - g0 > 0.05) { sk.at(x + px, g0, y + py); sk.box(0x8a8378, 0, (top - g0) / 2, 0, 0.07, top - g0, 0.07, 0, { cls: 'fine' }); sk.pop(); } }
  }
  const sideCorners: Record<number, [[number, number, number], [number, number, number]]> = { 0: [C, D], 1: [B, C], 2: [A, B], 3: [D, A] };
  for (let d = 0; d < 4; d++) {
    const q = pathLink(g, x, y, p, d as Dir); const nb = tileAt(g, x + DX[d], y + DY[d]);
    const linked = !!q || (!!nb && nb.paths.some(o => (o.queue || p.queue) && o.z === p.z));
    const [a, b] = sideCorners[d]; if (!linked) sk.line([a, b], 'edge');
    if (p.slope !== -1 && !linked && !lifted) sk.quad([a, b, [b[0], h0 - 0.02, b[2]], [a[0], h0 - 0.02, a[2]]], 0x6b665f, null);
    if ((p.queue || lifted) && !linked) { const r = 0.24; sk.line([[a[0], a[1] + r, a[2]], [b[0], b[1] + r, b[2]]], 'fine'); sk.line([[a[0], a[1], a[2]], [a[0], a[1] + r, a[2]]], 'fine'); }   // queue rails, bridge railings
  }
  if (p.adds.lamp) { sk.at(x + 0.85, h0, y + 0.85); sk.box(0x444444, 0, 0.6, 0, 0.05, 1.2, 0.05, 0, { cls: 'fine' }).box(0xffe680, 0, 1.26, 0, 0.15, 0.12, 0.15, 0, { cls: 'fine' }); sk.pop(); }
  if (p.adds.bin !== undefined) { sk.at(x + 0.22, h0, y + 0.22); sk.box(p.adds.bin >= 8 ? 0x9a8f7a : 0x666666, 0, 0.15, 0, 0.14, 0.3, 0.14, 0, { cls: 'fine' }); sk.pop(); }
  if (p.adds.bench && !p.broken) { sk.at(x + 0.5, h0, y + 0.42); sk.box(0x8a5a2b, 0, 0.18, 0, 0.6, 0.04, 0.15, 0, { cls: 'fine' }).box(0x8a5a2b, 0, 0.3, -0.08, 0.6, 0.2, 0.03, 0, { cls: 'fine' }); sk.pop(); }
  if (first) for (let i = 0; i < Math.min(t.litter, 6); i++) { const lx = x + 0.15 + ((i * 7 + x * 3) % 7) / 10, lz = y + 0.15 + ((i * 5 + y) % 7) / 10; sk.quad([[lx, h0 + 0.01, lz], [lx, h0 + 0.01, lz + 0.08], [lx + 0.1, h0 + 0.01, lz + 0.08], [lx + 0.1, h0 + 0.01, lz]], i % 2 ? 0xe8e8e8 : 0xc9a35b, null); }
}
