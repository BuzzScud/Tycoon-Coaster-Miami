// Map creation and tile queries. No DOM here.
import { DX, DY, LAND_STEP, Surface, key, type Dir, type GameState, type Tile } from './types';
import { rand } from './rng';

export const tileAt = (g: GameState, x: number, y: number): Tile | null => (x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.tiles[y * g.w + x]);
export const inBounds = (g: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
/** Ground height at a tile (height units). Water tiles count as their water surface for walking purposes. */
export const groundZ = (g: GameState, x: number, y: number): number => { const t = tileAt(g, x, y); return t ? t.h : 0; };

export function blankTile(h: number, owned: boolean): Tile {
  return { h, surf: Surface.Grass, water: false, owned, path: null, scenery: null, rideId: null, entrance: null, tracks: [], litter: 0, vomit: 0, litterAge: 0 };
}

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
    if (t.h === 0 && wet[y * w + x] < preset.water * 0.42) { t.water = true; t.surf = Surface.Sand; }
  }
  // water must be flat with its neighbours: make shores sand and water-adjacent tiles level 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = g.tiles[y * w + x];
    if (!t.water) { for (let d = 0; d < 4; d++) { const n = tileAt(g, x + DX[d], y + DY[d]); if (n && n.water && t.h === 0) { t.surf = Surface.Sand; } } }
    if (t.h >= 5 * LAND_STEP) t.surf = Surface.Rock; else if (t.h >= 3 * LAND_STEP && rand(g) < 0.3) t.surf = Surface.Dirt;
  }
  // entrance on the south edge of the owned area, two tiles wide, on a flat strip
  const ex = Math.floor(w / 2) - 1, ey = h - border;   // first unowned row below the park
  for (let yy = ey - 3; yy <= h - 1; yy++) for (let xx = ex - 2; xx <= ex + 3; xx++) { const t = tileAt(g, xx, yy); if (t) { t.h = 0; t.water = false; t.surf = Surface.Grass; } }
  // the arch stands on the boundary row (unowned), path runs from the map edge to inside the park
  g.entrance = { x: ex, y: ey, dir: 3 };
  g.spawn = { x: ex, y: h - 1 };
  for (let yy = ey - 2; yy <= h - 1; yy++) for (const xx of [ex, ex + 1]) { const t = tileAt(g, xx, yy)!; t.path = { queue: false, rideId: null, style: 0, slope: -1, adds: {} }; t.scenery = null; }
  // a few benches and lamps on the first inside tiles
  tileAt(g, ex, ey - 2)!.path!.adds.lamp = true; tileAt(g, ex + 1, ey - 2)!.path!.adds.bin = 0;
  // terrace the land so neighbouring tiles differ by at most one step (like the original's gentle slopes)
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = g.tiles[y * w + x]; let minN = t.h;
      for (let d = 0; d < 4; d++) { const nb = tileAt(g, x + DX[d], y + DY[d]); if (nb) minN = Math.min(minN, nb.h); }
      if (t.h > minN + LAND_STEP) { t.h = minN + LAND_STEP; changed = true; }
    }
    if (!changed) break;
  }
  // trees: more outside the park, fewer inside; none on paths or water
  const tree = noise2(g, w, h, 6);
  const kinds = ['tree_oak', 'tree_pine', 'tree_oak', 'tree_oak', 'bush', 'tree_pine', 'tree_pine', 'tree_oak', 'bush', 'tree_pine', 'tree_oak', 'tree_cherry'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = g.tiles[y * w + x]; if (t.path || t.water || t.surf === Surface.Rock) continue;
    const p = t.owned ? preset.trees * 0.08 : preset.trees * 0.45;
    if (tree[y * w + x] * rand(g) * 2 < p) { const k = t.surf === Surface.Sand ? 'tree_palm' : kinds[Math.floor(rand(g) * kinds.length)]; t.scenery = { kind: k, rot: 0, age: 0 }; }
  }
  // keep the entrance strip clear of trees
  for (let yy = ey - 4; yy <= h - 1; yy++) for (let xx = ex - 2; xx <= ex + 3; xx++) { const t = tileAt(g, xx, yy); if (t) t.scenery = null; }
}

// ---------- paths ----------
/** True when a path on (x,y) links to a path on the neighbour in direction d (same level, or a ramp). */
export function pathLinks(g: GameState, x: number, y: number, d: Dir): boolean {
  const a = tileAt(g, x, y), b = tileAt(g, x + DX[d], y + DY[d]);
  if (!a || !b || !a.path || !b.path) return false;
  const za = a.h, zb = b.h;
  // queue tiles only link along their line (handled by the queue logic); for walking we treat queue↔path as linked at the queue head
  if (a.path.slope === -1 && b.path.slope === -1) return za === zb;
  if (a.path.slope === d) return zb === za + LAND_STEP || (b.path.slope === d && zb === za + LAND_STEP);     // going up the ramp
  if (a.path.slope === ((d + 2) & 3)) return zb === za;                                                            // leaving the ramp at its foot
  if (b.path.slope === ((d + 2) & 3)) return zb === za - LAND_STEP;                                                // stepping down onto a ramp's top end
  if (b.path.slope === d) return zb === za;                                                                        // onto a ramp's foot
  return false;
}
export function pathNeighbours(g: GameState, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d < 4; d++) if (pathLinks(g, x, y, d as Dir)) out.push([x + DX[d], y + DY[d]]);
  return out;
}
/** Walking height on a path tile (ramps interpolate between their two ends). */
export function walkZ(g: GameState, x: number, y: number, fx: number, fy: number): number {
  const t = tileAt(g, x, y); if (!t) return 0;
  if (t.path && t.path.slope !== -1) { const d = t.path.slope; const f = d === 0 ? fx : d === 1 ? fy : d === 2 ? 1 - fx : 1 - fy; return t.h + f * LAND_STEP; }
  return t.water ? t.h + LAND_STEP : t.h;
}

/** Breadth-first route over connected path tiles. Returns packed keys from start (exclusive) to goal (inclusive), or null. */
export function findRoute(g: GameState, sx: number, sy: number, gx: number, gy: number, limit = 4000, allowQueue = false): number[] | null {
  if (sx === gx && sy === gy) return [];
  const start = key(sx, sy), goal = key(gx, gy);
  const prev = new Map<number, number>(); prev.set(start, -1);
  const q: number[] = [start]; let qi = 0;
  while (qi < q.length && qi < limit) {
    const k = q[qi++]; const x = k & 1023, y = k >> 10;
    for (let d = 0; d < 4; d++) {
      if (!pathLinks(g, x, y, d as Dir)) continue;
      const nx = x + DX[d], ny = y + DY[d], nk = key(nx, ny);
      if (prev.has(nk)) continue;
      const nt = g.tiles[ny * g.w + nx];
      if (nt.path!.queue && !allowQueue && nk !== goal) continue;
      prev.set(nk, k);
      if (nk === goal) { const route: number[] = []; let c = nk; while (c !== start) { route.push(c); c = prev.get(c)!; } return route.reverse(); }
      q.push(nk);
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
    if (t.path) return 'A path is in the way';
    if (t.rideId !== null) return 'Another ride is in the way';
    if (t.entrance) return 'A ride entrance is in the way';
    if (t.tracks.length) return 'Track is in the way';
    if (h0 === null) h0 = t.h; else if (t.h !== h0) return 'Land must be flat here';
  }
  return null;
}
export const sceneryBlocks = (t: Tile) => t.scenery !== null;
