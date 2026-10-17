// Map creation and tile queries. No DOM here. Land, water and paths follow RCT's own rules, ported from OpenRCT2
// (GPL-3.0, github.com/OpenRCT2/OpenRCT2: world/tile_element/Slope.h, world/Map.cpp TileElementHeight, the footpath
// rules): a tile is a base height plus slope bits (corners raised one step, or steep), water has its own surface
// height, and a tile can hold several paths at different heights (bridges and tunnels) that join where their edges meet.
import { DX, DY, LAND_STEP, Surface, type Dir, type GameState, type Tile, type PathTile } from './types';
import { rand } from './rng';
import { runtime } from './runtime';

export const tileAt = (g: GameState, x: number, y: number): Tile | null => (x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.tiles[y * g.w + x]);
export const inBounds = (g: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export function blankTile(h: number, owned: boolean): Tile {
  return { h, surf: Surface.Grass, water: false, owned, paths: [], scenery: null, rideId: null, entrance: null, tracks: [], litter: 0, vomit: 0, litterAge: 0 };
}

// ---------- land: corners and slopes (RCT's slope bits) ----------
export const SLOPE_N = 1, SLOPE_E = 2, SLOPE_S = 4, SLOPE_W = 8, SLOPE_STEEP = 16;
/** Corners in the order used here: 0 = (0,0) RCT's S, 1 = (1,0) E, 2 = (1,1) N, 3 = (0,1) W (tile-local x, y). */
export const CORNER_OFF: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const CORNER_BIT = [SLOPE_S, SLOPE_E, SLOPE_N, SLOPE_W];
export type Corners = [number, number, number, number];
/** The land's height at each corner. */
export function corners(t: Tile): Corners {
  const s = t.slope ?? 0, h = t.h; const c = CORNER_BIT.map(b => (s & b ? h + LAND_STEP : h)) as Corners;
  if (s & SLOPE_STEEP) { const down = CORNER_BIT.findIndex(b => !(s & b)); if (down >= 0) c[(down + 2) & 3] = h + 2 * LAND_STEP; }
  return c;
}
export const landTop = (t: Tile) => Math.max(...corners(t));
export const isFlatLand = (t: Tile) => !(t.slope ?? 0);
/** Which diagonal a sloped tile folds along, as RCT draws it: true = (0,0)–(1,1), false = (1,0)–(0,1). */
export const foldMain = (c: number[]) => c[0] === c[2] && (c[1] !== c[0] || c[3] !== c[0]);
/** Land height at a point inside a tile (fx, fy in 0..1): two flat triangles meeting along the fold, which is exactly the
 *  surface OpenRCT2's TileElementHeight describes for every slope (one corner, a side, a valley, three corners, steep). */
export function landZ(t: Tile, fx: number, fy: number): number {
  if (!t.slope) return t.h; const c = corners(t);
  if (foldMain(c)) return fx >= fy ? c[0] + (c[1] - c[0]) * fx + (c[2] - c[1]) * fy : c[0] + (c[3] - c[0]) * fy + (c[2] - c[3]) * fx;
  return fx + fy <= 1 ? c[0] + (c[1] - c[0]) * fx + (c[3] - c[0]) * fy : c[2] + (c[3] - c[2]) * (1 - fx) + (c[1] - c[2]) * (1 - fy);
}
/** The base height and slope bits for four corner heights; null when RCT has no such slope (corners too far apart). */
export function slopeOf(c: number[]): { h: number; slope: number } | null {
  const lo = Math.min(...c), hi = Math.max(...c);
  if (hi - lo <= LAND_STEP) { let s = 0; c.forEach((v, i) => { if (v > lo) s |= CORNER_BIT[i]; }); return { h: lo, slope: s }; }
  if (hi - lo === 2 * LAND_STEP) {   // steep: one corner low, the two beside it one step up, the opposite two steps up
    const d = c.indexOf(lo); if (c.filter(v => v === lo).length === 1 && c[(d + 2) & 3] === hi && c[(d + 1) & 3] === lo + LAND_STEP && c[(d + 3) & 3] === lo + LAND_STEP)
      return { h: lo, slope: CORNER_BIT[(d + 1) & 3] | CORNER_BIT[(d + 2) & 3] | CORNER_BIT[(d + 3) & 3] | SLOPE_STEEP };
  }
  return null;
}
/** Set a tile's land from four corner heights (false and unchanged when RCT has no such slope). */
export function setCorners(t: Tile, c: number[]): boolean { const s = slopeOf(c); if (!s) return false; t.h = s.h; if (s.slope) t.slope = s.slope; else delete t.slope; return true; }

// ---------- water: its own surface height ----------
/** The water's surface height, or null when the tile is dry. */
export const waterZ = (t: Tile): number | null => (t.water ? t.wz ?? t.h + LAND_STEP : null);
/** Set the water's surface (null or at or below the lowest corner = dry). */
export function setWater(t: Tile, wz: number | null) { if (wz === null || wz <= t.h) { t.water = false; delete t.wz; } else { t.water = true; t.wz = wz; } }
/** The surface a guest or an object stands on at a point: land, or water above it. */
export const surfaceZ = (t: Tile, fx = 0.5, fy = 0.5) => Math.max(landZ(t, fx, fy), waterZ(t) ?? -Infinity);

/** Smooth value noise in [0,1]. */
function noise2(seedRng: { rng: number }, w: number, h: number, cell: number): number[] {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2; const grid: number[] = [];
  for (let i = 0; i < gw * gh; i++) grid.push(rand(seedRng));
  const out: number[] = new Array(w * h);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / cell, fy = y / cell; const x0 = Math.floor(fx), y0 = Math.floor(fy); const tx = sm(fx - x0), ty = sm(fy - y0);
    const v = (xx: number, yy: number) => grid[yy * gw + xx];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
    out[y * w + x] = a + (b - a) * ty;
  }
  return out;
}

export interface MapPreset { w: number; h: number; hills: number /* 0..1 */; water: number /* 0..1 */; trees: number /* 0..1 */; }

/** Generate terrain, ownership, the entrance and a starting path into the park. */
export function generateMap(g: GameState, preset: MapPreset) {
  const { w, h } = preset; g.w = w; g.h = h; g.tiles = new Array(w * h);
  const big = noise2(g, w, h, 14), small = noise2(g, w, h, 5);
  const border = 3;   // unowned ring around the park
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = big[y * w + x] * 0.75 + small[y * w + x] * 0.25;
    // flatten the middle so there is room to build, keep the edges rolling
    const cx = (x - w / 2) / (w / 2), cy = (y - h / 2) / (h / 2); const edge = Math.max(Math.abs(cx), Math.abs(cy));
    n = n * (0.35 + 0.65 * edge * edge) * preset.hills;
    const steps = Math.round(n * 6);
    const owned = x >= border && y >= border && x < w - border && y < h - border;
    const t = blankTile(steps * LAND_STEP, owned);
    g.tiles[y * w + x] = t;
  }
  // water: low spots become ponds
  const wet = noise2(g, w, h, 9);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const t = g.tiles[y * w + x];
    if (t.h === 0 && wet[y * w + x] < preset.water * 0.42) { setWater(t, LAND_STEP); t.surf = Surface.Sand; }
  }
  // water must be flat with its neighbours: make shores sand and water-adjacent tiles level 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = g.tiles[y * w + x];
    if (!t.water) { for (let d = 0; d < 4; d++) { const n = tileAt(g, x + DX[d], y + DY[d]); if (n && n.water && t.h === 0) { t.surf = Surface.Sand; } } }
    if (t.h >= 5 * LAND_STEP) t.surf = Surface.Rock; else if (t.h >= 3 * LAND_STEP && rand(g) < 0.3) t.surf = Surface.Dirt;
  }
  // entrance on the south edge of the owned area, two tiles wide, on a flat strip
  const ex = Math.floor(w / 2) - 1, ey = h - border;   // first unowned row below the park
  for (let yy = ey - 4; yy <= h - 1; yy++) for (let xx = ex - 3; xx <= ex + 4; xx++) { const t = tileAt(g, xx, yy); if (t) { t.h = 0; setWater(t, null); t.surf = Surface.Grass; } }
  // the arch stands on the boundary row (unowned), path runs from the map edge to inside the park
  g.entrance = { x: ex, y: ey, dir: 3 };
  g.spawn = { x: ex, y: h - 1 };
  terrace(g);
  for (let yy = ey - 2; yy <= h - 1; yy++) for (const xx of [ex, ex + 1]) { const t = tileAt(g, xx, yy)!; t.paths = [{ z: t.h, queue: false, rideId: null, style: 0, slope: -1, adds: {} }]; t.scenery = null; }
  // a few benches and lamps on the first inside tiles
  tileAt(g, ex, ey - 2)!.paths[0].adds.lamp = true; tileAt(g, ex + 1, ey - 2)!.paths[0].adds.bin = 0;
  // trees: more outside the park, fewer inside; none on paths or water
  const tree = noise2(g, w, h, 6);
  const kinds = ['tree_oak', 'tree_pine', 'tree_oak', 'tree_oak', 'bush', 'tree_pine', 'tree_pine', 'tree_oak', 'bush', 'tree_pine', 'tree_oak', 'tree_cherry'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = g.tiles[y * w + x]; if (t.paths.length || t.water || t.surf === Surface.Rock) continue;
    const p = t.owned ? preset.trees * 0.08 : preset.trees * 0.45;
    if (tree[y * w + x] * rand(g) * 2 < p) { const k = t.surf === Surface.Sand ? 'tree_palm' : kinds[Math.floor(rand(g) * kinds.length)]; t.scenery = { kind: k, rot: 0, age: 0 }; }
  }
  // keep the entrance strip clear of trees
  for (let yy = ey - 4; yy <= h - 1; yy++) for (let xx = ex - 2; xx <= ex + 3; xx++) { const t = tileAt(g, xx, yy); if (t) t.scenery = null; }
}

/** Terrace the land so neighbouring tiles differ by at most one step, then fold it into RCT's slopes (smoothSlopes). */
export function terrace(g: GameState, passes = 8) {
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const t = g.tiles[y * g.w + x]; let minN = t.h;
      for (let d = 0; d < 4; d++) { const nb = tileAt(g, x + DX[d], y + DY[d]); if (nb) minN = Math.min(minN, nb.h); }
      if (t.h > minN + LAND_STEP) { t.h = minN + LAND_STEP; changed = true; }
    }
    if (!changed) break;
  }
  smoothSlopes(g);
}
/** Turn stepped land into RCT's sloped land: every corner point takes the lowest of the tiles round it, corners settle so
 *  no two points of a tile are more than one step apart, and each tile gets the slope its corners make. Tiles carrying
 *  something that needs its ground as it is (paths, rides, huts, track, big pieces) keep their land. Water stays level. */
export function smoothSlopes(g: GameState) {
  const W = g.w + 1, H = g.h + 1, P = new Float64Array(W * H).fill(Infinity);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const h = g.tiles[y * g.w + x].h; for (const [ox, oy] of CORNER_OFF) { const i = (y + oy) * W + x + ox; if (h < P[i]) P[i] = h; } }
  relax(P, W, H, () => false);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const t = g.tiles[y * g.w + x]; if (t.paths.length || t.rideId !== null || t.entrance || t.tracks.length || t.scenery?.root) continue;
    const c = CORNER_OFF.map(([ox, oy]) => P[(y + oy) * W + x + ox]); const wz = waterZ(t); setCorners(t, c); if (wz !== null) setWater(t, wz);
  }
}
/** Lower corner points until no point is more than one land step above any of its eight neighbours (keeps every tile a
 *  slope RCT has). `pinned` points are never moved. */
function relax(P: Float64Array, W: number, H: number, pinned: (i: number) => boolean) {
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (pinned(i)) continue; let lo = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; lo = Math.min(lo, P[ny * W + nx]); }
      if (P[i] > lo + LAND_STEP) { P[i] = lo + LAND_STEP; changed = true; }
    }
    if (!changed) break;
  }
}

// ---------- scenario landscapes ----------
export type MapShape = 'plain' | 'forest' | 'lake' | 'beach' | 'canyon' | 'desert' | 'island';
/** Reshape a generated map for a scenario: a forest, a lake, a beach and sea, a river canyon, a desert, islands. The
 *  strip round the gate is never touched, so guests always have a way in. */
export function shapeMap(g: GameState, shape: MapShape) {
  if (shape === 'plain') return;
  const { w, h } = g; const ex = g.entrance.x + 0.5, ey = g.entrance.y;
  const near = (x: number, y: number) => Math.abs(x - ex) <= 4.5 && y >= ey - 7;
  const sea = (t: Tile) => { t.h = 0; delete t.slope; setWater(t, LAND_STEP); t.scenery = null; t.surf = Surface.Sand; t.paths = []; };
  const sand = (t: Tile, palms = 0) => { t.surf = Surface.Sand; t.scenery = palms && rand(g) < palms ? { kind: 'tree_palm', rot: 0, age: 0 } : null; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (near(x, y)) continue; const t = g.tiles[y * w + x]; const fx = x / w, fy = y / h;
    switch (shape) {
      case 'forest': if (t.owned && !t.water && !t.scenery && rand(g) < 0.3) t.scenery = { kind: ['tree_oak', 'tree_pine', 'tree_pine', 'tree_cherry', 'bush'][Math.floor(rand(g) * 5)], rot: 0, age: 0 }; break;
      case 'lake': { const d = ((fx - 0.42) / 0.2) ** 2 + ((fy - 0.4) / 0.16) ** 2; if (d < 1) sea(t); else if (d < 1.35) { t.h = 0; sand(t, 0.05); } break; }
      case 'beach': if (fy < 0.16) sea(t); else if (fy < 0.27) { t.h = 0; sand(t, 0.08); } break;
      case 'canyon': { const cx = 0.5 + Math.sin(fy * 7) * 0.16; const d = Math.abs(fx - cx) * w; if (d < 1.6) sea(t); else if (d < 3.5) { t.h = Math.min(t.h, 2); t.surf = Surface.Dirt; } else if (t.h >= 4) t.surf = Surface.Rock; break; }
      case 'desert': if (!t.water) { t.surf = rand(g) < 0.18 ? Surface.Dirt : Surface.Sand; if (t.scenery && !t.scenery.root) t.scenery = rand(g) < 0.12 ? { kind: 'tree_palm', rot: 0, age: 0 } : null; } break;
      case 'island': {
        const blobs: [number, number, number][] = [[0.5, 0.78, 0.2], [0.25, 0.42, 0.17], [0.72, 0.38, 0.17], [0.48, 0.16, 0.12]];
        const land = blobs.some(([bx, by, r]) => ((fx - bx) ** 2 + (fy - by) ** 2) < r * r) || Math.abs(fx - 0.5) < 0.02 && fy > 0.16 || Math.abs(fy - 0.4) < 0.025 && fx > 0.25 && fx < 0.72;
        if (!land) sea(t); else if (t.h > 4) t.h = 4; break;
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = g.tiles[y * w + x]; if (t.water) { t.h = 0; delete t.slope; setWater(t, LAND_STEP); } }   // water lies flat
  terrace(g);
}

// ---------- paths: several per tile, at any height ----------
export const PATH_CLEAR = 4;   // height units a path needs free above it (RCT: 32 z, room for a guest)
export const nkey = (x: number, y: number, z: number) => (z << 20) | (y << 10) | x;   // a path piece: tile + height
export const nx = (k: number) => k & 1023, ny = (k: number) => (k >> 10) & 1023, nz = (k: number) => k >>> 20;
/** The path on a tile at exactly this height. */
export const pathAt = (t: Tile | null | undefined, z: number): PathTile | null => t?.paths.find(p => p.z === z) ?? null;
/** A path at or near the land (not a bridge well above it, not a tunnel well below): blocks building on the ground. */
export const pathsNearLand = (t: Tile) => t.paths.some(p => p.z < landTop(t) + 6 && p.z + PATH_CLEAR > t.h);
/** The path a walker at height z is on: the nearest one (or the lowest when z is not known). */
export function pathNear(t: Tile | null | undefined, z?: number): PathTile | null {
  if (!t || !t.paths.length) return null; if (z === undefined || t.paths.length === 1) return t.paths[0]; let best = t.paths[0], bd = Infinity;
  for (const p of t.paths) { const d = Math.abs(p.z - z); if (d < bd) { bd = d; best = p; } } return best;
}
/** The height of a path's edge on side d, or null when the path does not open that way (a slope joins only along itself). */
export function edgeZ(p: PathTile, d: Dir): number | null {
  if (p.slope === -1) return p.z; if (p.slope === d) return p.z + LAND_STEP; if (p.slope === ((d + 2) & 3)) return p.z; return null;
}
/** The path next door in direction d that this one joins (their touching edges at the same height), or null. */
export function pathLink(g: GameState, x: number, y: number, p: PathTile, d: Dir): PathTile | null {
  const n = tileAt(g, x + DX[d], y + DY[d]); if (!n || !n.paths.length) return null; const e = edgeZ(p, d); if (e === null) return null;
  const od = ((d + 2) & 3) as Dir; for (const q of n.paths) if (edgeZ(q, od) === e) return q; return null;
}
/** Does the path at (x, y) (at height z, or the lowest) join a path in direction d? */
export function pathLinks(g: GameState, x: number, y: number, d: Dir, z?: number): boolean { const p = pathNear(tileAt(g, x, y), z); return !!p && !!pathLink(g, x, y, p, d); }
/** The path pieces a path joins: [x, y, z] of each. */
export function pathNeighbours(g: GameState, x: number, y: number, z?: number): [number, number, number][] {
  const out: [number, number, number][] = []; const p = pathNear(tileAt(g, x, y), z); if (!p) return out;
  for (let d = 0; d < 4; d++) { const q = pathLink(g, x, y, p, d as Dir); if (q) out.push([x + DX[d], y + DY[d], q.z]); }
  return out;
}
/** Walking height on a path (a ramp rises along its slope), or on the surface when there is no path. */
export function walkZ(g: GameState, x: number, y: number, fx: number, fy: number, z?: number): number {
  const t = tileAt(g, x, y); if (!t) return 0; const p = pathNear(t, z);
  if (p) { if (p.slope === -1) return p.z; const d = p.slope; const f = d === 0 ? fx : d === 1 ? fy : d === 2 ? 1 - fx : 1 - fy; return p.z + f * LAND_STEP; }
  return surfaceZ(t, fx, fy);
}

/** Breadth-first route over joined path pieces, from the piece at (sx, sy) nearest height sz to (gx, gy) (any piece there,
 *  or the one at gz). Returns packed piece keys (nkey) from start (exclusive) to goal (inclusive), or null. Visited marks
 *  and parents live in arrays kept per park and reused (a fresh stamp each search), not a new map. */
export function findRoute(g: GameState, sx: number, sy: number, gx: number, gy: number, limit = 4000, allowQueue = false, sz?: number, gz?: number): number[] | null {
  if (sx < 0 || sy < 0 || sx >= g.w || sy >= g.h) return null;
  const st0 = pathNear(g.tiles[sy * g.w + sx], sz); if (!st0) return null;
  if (sx === gx && sy === gy && (gz === undefined || st0.z === gz)) return [];
  const rt = runtime(g); const W = g.w, n = W * g.h * 8, tiles = g.tiles;   // a slot per path piece: tile × 8 + its place on the tile
  if (!rt.seen || rt.seen.length !== n) { rt.seen = new Uint32Array(n); rt.prev = new Int32Array(n); rt.stamp = 0; }
  const seen = rt.seen, prev = rt.prev!; if (++rt.stamp >= 0xffffffff) { seen.fill(0); rt.stamp = 1; } const st = rt.stamp;
  const start = (sy * W + sx) * 8 + Math.min(7, tiles[sy * W + sx].paths.indexOf(st0)); seen[start] = st; prev[start] = -1;
  const q: number[] = [start]; let qi = 0;
  while (qi < q.length && qi < limit) {
    const i = q[qi++], ti = i >> 3, x = ti % W, y = (ti - x) / W; const p = tiles[ti].paths[i & 7];
    for (let d = 0; d < 4; d++) {
      const e = edgeZ(p, d as Dir); if (e === null) continue;
      const nxx = x + DX[d], nyy = y + DY[d]; if (nxx < 0 || nyy < 0 || nxx >= W || nyy >= g.h) continue;
      const nti = nyy * W + nxx, ps = tiles[nti].paths; if (!ps.length) continue;
      const od = ((d + 2) & 3) as Dir; let k = 0; while (k < ps.length && edgeZ(ps[k], od) !== e) k++; if (k === ps.length) continue;
      const ni = nti * 8 + Math.min(7, k); if (seen[ni] === st) continue; const np = ps[k];
      const goal = nxx === gx && nyy === gy && (gz === undefined || np.z === gz);
      if (np.queue && !allowQueue && !goal) continue;
      seen[ni] = st; prev[ni] = i;
      if (goal) { const route: number[] = []; let c = ni; while (c !== start) { const t = c >> 3, cx = t % W, cy = (t - cx) / W; route.push(nkey(cx, cy, tiles[t].paths[c & 7].z)); c = prev[c]; } return route.reverse(); }
      q.push(ni);
    }
  }
  return null;
}

/** Is this tile free for building something of the given footprint (n×n from x,y)? */
export function footprintFree(g: GameState, x: number, y: number, n: number, needOwned = true): string | null {
  let h0: number | null = null;
  for (let yy = y; yy < y + n; yy++) for (let xx = x; xx < x + n; xx++) {
    const t = tileAt(g, xx, yy); if (!t) return 'Off the edge of the map';
    if (needOwned && !t.owned) return 'Land not owned by the park';
    if (t.water) return 'Cannot build on water';
    if (t.paths.length) return 'A path is in the way';
    if (t.slope) return 'Land must be flat here';
    if (t.rideId !== null) return 'Another ride is in the way';
    if (t.entrance) return 'A ride entrance is in the way';
    if (t.tracks.length) return 'Track is in the way';
    if (h0 === null) h0 = t.h; else if (t.h !== h0) return 'Land must be flat here';
  }
  return null;
}
export const sceneryBlocks = (t: Tile) => t.scenery !== null;
