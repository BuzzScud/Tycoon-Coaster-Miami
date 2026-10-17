// The ground in ink: land tops (one colour, or today's checker), cliffs and a skirt round the map so the park
// sits like a block on the page, a faint tile grid, paths with inked borders, water with a shoreline.
import * as THREE from 'three';
import { DX, DY, LAND_STEP, type Dir, type GameState, type Tile } from '../sim/types';
import { tileAt, pathLinks } from '../sim/map';
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
export function inkChunk(g: GameState, s: InkStyle, x0: number, y0: number, n: number): THREE.Group {
  const sk = new Sketch(); usePalette(s);
  const top = (t: Tile) => t.h * HU;
  for (let y = y0; y < Math.min(g.h, y0 + n); y++) for (let x = x0; x < Math.min(g.w, x0 + n); x++) {
    const t = g.tiles[y * g.w + x]; const h = top(t); const v = s.checker ? (x * 7 + y * 13) & 1 : 0;
    let c = t.water ? WATER : (SURF_COL[t.surf] ?? SURF_COL[0])[v]; if (!t.owned) c = dim(c, s.outside);
    sk.quad([[x, h, y], [x, h, y + 1], [x + 1, h, y + 1], [x + 1, h, y]], c, null);
    // cliff faces down to lower neighbours, and the skirt down to the base at the map's edge
    const cliff = t.owned ? (CLIFF_COL[t.surf] ?? CLIFF_COL[0]) : dim(CLIFF_COL[t.surf] ?? CLIFF_COL[0], s.outside);
    for (let d = 0; d < 4; d++) {
      const n = tileAt(g, x + DX[d], y + DY[d]); const lo = n ? top(n) : BASE; if (lo >= h) continue;
      const [a, b] = edgeOf(x, y, d as Dir);
      sk.quad([[a[0], h, a[1]], [b[0], h, b[1]], [b[0], lo, b[1]], [a[0], lo, a[1]]], cliff, null);
      sk.line([[a[0], h, a[1]], [b[0], h, b[1]]], 'edge');
      sk.line([[a[0], lo, a[1]], [b[0], lo, b[1]]], n ? 'fine' : 'edge');
      // a vertical line only where this wall turns or ends (not at every tile seam)
      for (const [pt, side] of [[a, [1, 2, 3, 0][d]], [b, [3, 0, 1, 2][d]]] as const) {
        const m = tileAt(g, x + DX[side], y + DY[side]); const mn = m ? tileAt(g, x + DX[side] + DX[d], y + DY[side] + DY[d]) : null;
        const goesOn = !!m && top(m) === h && (mn ? top(mn) : BASE) === lo;
        if (!goesOn) sk.line([[pt[0], h, pt[1]], [pt[0], lo, pt[1]]], n ? 'fine' : 'edge');
      }
    }
    // the faint grid between level tiles of plain ground
    if (s.grid && !t.water && !t.path) for (const d of [0, 1] as Dir[]) {
      const n = tileAt(g, x + DX[d], y + DY[d]); if (!n || n.water || n.path || top(n) !== h) continue; const [a, b] = edgeOf(x, y, d);
      sk.line([[a[0], h + 0.004, a[1]], [b[0], h + 0.004, b[1]]], 'grid');
    }
    if (t.water) {
      for (let d = 0; d < 4; d++) { const n = tileAt(g, x + DX[d], y + DY[d]); if (n && !n.water) { const [a, b] = edgeOf(x, y, d as Dir); sk.line([[a[0], h + 0.01, a[1]], [b[0], h + 0.01, b[1]]], 'edge'); } }
      const k = (x * 37 + y * 61) % 5; if (k < 2) { const ox = x + 0.25 + ((x * 13) % 4) * 0.08, oy = y + 0.3 + ((y * 7) % 4) * 0.1; sk.line([[ox, h + 0.012, oy], [ox + 0.28, h + 0.012, oy]], 'ripple'); }
    }
    if (t.path) path(sk, g, x, y, t);
  }
  return buildGroup(sk, groundStyle(s));
}
/** The two ground corners of tile (x, y)'s side facing direction d. */
function edgeOf(x: number, y: number, d: Dir): [[number, number], [number, number]] {
  switch (d) { case 0: return [[x + 1, y + 1], [x + 1, y]]; case 1: return [[x, y + 1], [x + 1, y + 1]]; case 2: return [[x, y], [x, y + 1]]; default: return [[x + 1, y], [x, y]]; }
}
function path(sk: Sketch, g: GameState, x: number, y: number, t: Tile) {
  const p = t.path!; const h0 = t.h * HU + 0.025; const up = LAND_STEP * HU;
  const hi = (cx: number, cy: number) => { if (p.slope === -1) return h0; const d = p.slope; const onHigh = d === 0 ? cx === 1 : d === 1 ? cy === 1 : d === 2 ? cx === 0 : cy === 0; return h0 + (onHigh ? up : 0); };
  const A: [number, number, number] = [x, hi(0, 0), y], B: [number, number, number] = [x, hi(0, 1), y + 1], C: [number, number, number] = [x + 1, hi(1, 1), y + 1], D: [number, number, number] = [x + 1, hi(1, 0), y];
  sk.quad([A, B, C, D], p.queue ? QUEUE_COL : PATH_COL[p.style] ?? PATH_COL[0], null);
  const corners: Record<number, [[number, number, number], [number, number, number]]> = { 0: [C, D], 1: [B, C], 2: [A, B], 3: [D, A] };
  for (let d = 0; d < 4; d++) {
    const n = tileAt(g, x + DX[d], y + DY[d]); const linked = pathLinks(g, x, y, d as Dir) || (!!n?.path && (n.path.queue || p.queue) && n.h === t.h);
    const [a, b] = corners[d]; if (!linked) sk.line([a, b], 'edge');
    if (p.slope !== -1 && !linked) sk.quad([a, b, [b[0], h0 - 0.02, b[2]], [a[0], h0 - 0.02, a[2]]], 0x6b665f, null);
    if (p.queue && !linked) { const r = 0.24; sk.line([[a[0], a[1] + r, a[2]], [b[0], b[1] + r, b[2]]], 'fine'); sk.line([[a[0], a[1], a[2]], [a[0], a[1] + r, a[2]]], 'fine'); }
  }
  if (p.adds.lamp) { sk.at(x + 0.85, h0, y + 0.85); sk.box(0x444444, 0, 0.6, 0, 0.05, 1.2, 0.05, 0, { cls: 'fine' }).box(0xffe680, 0, 1.26, 0, 0.15, 0.12, 0.15, 0, { cls: 'fine' }); sk.pop(); }
  if (p.adds.bin !== undefined) { sk.at(x + 0.22, h0, y + 0.22); sk.box(p.adds.bin >= 8 ? 0x9a8f7a : 0x666666, 0, 0.15, 0, 0.14, 0.3, 0.14, 0, { cls: 'fine' }); sk.pop(); }
  if (p.adds.bench && !p.broken) { sk.at(x + 0.5, h0, y + 0.42); sk.box(0x8a5a2b, 0, 0.18, 0, 0.6, 0.04, 0.15, 0, { cls: 'fine' }).box(0x8a5a2b, 0, 0.3, -0.08, 0.6, 0.2, 0.03, 0, { cls: 'fine' }); sk.pop(); }
  for (let i = 0; i < Math.min(t.litter, 6); i++) { const lx = x + 0.15 + ((i * 7 + x * 3) % 7) / 10, lz = y + 0.15 + ((i * 5 + y) % 7) / 10; sk.quad([[lx, h0 + 0.01, lz], [lx, h0 + 0.01, lz + 0.08], [lx + 0.1, h0 + 0.01, lz + 0.08], [lx + 0.1, h0 + 0.01, lz]], i % 2 ? 0xe8e8e8 : 0xc9a35b, null); }
}
