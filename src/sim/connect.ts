// Auto-connect: give a ride its entrance and exit huts and lay the paths that join them to the park's paths, in as few
// tiles as the ground allows (a stall gets a path to its counter). Everything goes through the normal build commands,
// so it costs what building by hand costs, and every try is checked by walking it: a guest from the gate must reach
// the end of the queue, and a guest leaving by the exit must reach the gate. A try that fails is taken back whole.
import { DX, DY, LAND_STEP, type Dir, type GameState, type Ride, type Tile } from './types';
import { tileAt, pathLinks, findRoute, pathNeighbours, pathAt, landTop, isFlatLand, nkey } from './map';
import { isStation } from './track';
import { RIDE_BY_KEY } from './rides';
import { cmdPath, cmdPlaceEntrance, cmdRemoveScenery, trial } from './game';
import { traceQueue } from './guests';
import { trackDone, isShuttle } from './ridesim';

/** Trees and bushes may be cleared for a path or a hut; anything else placed by hand is never touched. */
const CLEARABLE = new Set(['tree_oak', 'tree_pine', 'tree_palm', 'tree_cherry', 'bush']);
const MAX_LEN = 40;   // longest path laid for one hut

export interface ConnectResult { ok: boolean; why?: string; huts: number; paths: number; cost: number }

/** Path tiles a guest can walk to from inside the gate (not through queues). */
export function parkNetwork(g: GameState): Uint8Array {
  const net = new Uint8Array(g.w * g.h); const sx = g.entrance.x, sy = g.entrance.y - 2; const p0 = tileAt(g, sx, sy)?.paths[0]; if (!p0) return net;
  const seen = new Set<number>([nkey(sx, sy, p0.z)]); const q: [number, number, number][] = [[sx, sy, p0.z]]; net[sy * g.w + sx] = 1;   // over path pieces (bridges count), marking their tiles
  for (let i = 0; i < q.length; i++) {
    const [x, y, z] = q[i];
    for (const [nx, ny, nz] of pathNeighbours(g, x, y, z)) { const k = nkey(nx, ny, nz); if (seen.has(k) || pathAt(g.tiles[ny * g.w + nx], nz)!.queue) continue; seen.add(k); net[ny * g.w + nx] = 1; q.push([nx, ny, nz]); }
  }
  return net;
}

/** Can a new path go on this tile (maybe after clearing a tree)? Existing footpaths count as already laid. */
function open(g: GameState, t: Tile | null, reserved: Set<number>, k: number): 'path' | 'free' | 'tree' | null {
  if (!t || !t.owned || t.water || t.rideId !== null || t.entrance || t.tracks.length || reserved.has(k)) return null;
  if (t.paths.length) return t.paths.some(p => !p.queue && Math.abs(p.z - landTop(t)) <= LAND_STEP) ? 'path' : null;
  if (t.scenery) return CLEARABLE.has(t.scenery.kind) && !t.scenery.root ? 'tree' : null;
  return 'free';
}

/** Cheapest way from every tile back to the park's paths (many sources at once): cost per tile laid, more for a tree
 *  to clear or a step up or down. parent[] leads toward the network. */
function costField(g: GameState, net: Uint8Array, reserved: Set<number>) {
  const n = g.w * g.h, cost = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1); const heap: [number, number][] = [];
  const push = (c: number, k: number) => { heap.push([c, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let k = 0; k < n; k++) if (net[k]) { cost[k] = 0; push(0, k); }
  while (heap.length) {
    const [c, k] = pop(); if (c > cost[k] || c > MAX_LEN * 4) continue; const x = k % g.w, y = (k - x) / g.w, h = landTop(g.tiles[k]);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue; const nk = ny * g.w + nx; if (net[nk]) continue;
      const t = g.tiles[nk]; const kind = open(g, t, reserved, nk); if (!kind || Math.abs(landTop(t) - h) > LAND_STEP) continue;
      if (t.paths.length && g.tiles[k].paths.length && !pathLinks(g, x, y, d as Dir)) continue;   // two existing paths that do not join
      const step = (kind === 'path' ? 0.3 : 1) + (kind === 'tree' ? 3 : 0) + (landTop(t) !== h ? 3 : 0) + (t.slope ? 1 : 0);
      if (c + step < cost[nk]) { cost[nk] = c + step; parent[nk] = k; push(c + step, nk); }
    }
  }
  return { cost, parent };
}

/** The tiles from `from` back to (not including) the network, in that order. */
function routeBack(parent: Int32Array, net: Uint8Array, from: number): number[] | null {
  const out: number[] = []; let k = from; while (k >= 0 && !net[k]) { out.push(k); if (out.length > MAX_LEN) return null; k = parent[k]; } return k >= 0 ? out : null;
}

/** Lay the tiles (queue for the first `queueTiles`, counted from the hut), from the network end outward so ramps
 *  form the way they do when a path is dragged by hand. Returns false when a tile could not be built. */
function lay(g: GameState, route: number[], queueTiles: number, style: number): boolean {
  for (let i = route.length - 1; i >= 0; i--) {
    const k = route[i], x = k % g.w, y = (k - x) / g.w, t = g.tiles[k]; const queue = i < queueTiles;
    if (t.paths.some(p => !p.queue) && !queue) continue;
    if (t.scenery && !cmdRemoveScenery(g, x, y).ok) return false;
    if (!cmdPath(g, x, y, queue, style).ok) return false;
  }
  return true;
}

interface Spot { x: number; y: number; dir: Dir; fx: number; fy: number }
/** Tiles where a hut can stand: beside the ride (flat rides) or beside a station piece (track rides), at its height. */
function hutSpots(g: GameState, r: Ride): Spot[] {
  const def = RIDE_BY_KEY[r.type]; const out: Spot[] = []; const seen = new Set<number>();
  const add = (x: number, y: number, dir: Dir, h: number) => {
    const t = tileAt(g, x, y); if (!t || t.h !== h || seen.has(y * g.w + x)) return; seen.add(y * g.w + x);
    if (!t.owned || t.water || t.paths.length || t.slope || t.rideId !== null || t.entrance || t.tracks.length) return;
    if (t.scenery && (!CLEARABLE.has(t.scenery.kind) || t.scenery.root)) return;
    out.push({ x, y, dir, fx: x - DX[dir], fy: y - DY[dir] });
  };
  if (def.kind === 'coaster') {
    for (const p of r.pieces) { if (!isStation(p.type)) continue; const h = tileAt(g, p.x, p.y)?.h ?? 0; for (const s of [(p.dir + 1) & 3, (p.dir + 3) & 3]) add(p.x + DX[s], p.y + DY[s], ((s + 2) & 3) as Dir, h); }
  } else {
    const n = def.size, h = tileAt(g, r.x, r.y)?.h ?? 0;
    for (let i = 0; i < n; i++) { add(r.x + i, r.y - 1, 1, h); add(r.x + i, r.y + n, 3, h); add(r.x - 1, r.y + i, 0, h); add(r.x + n, r.y + i, 2, h); }
  }
  return out;
}

const gate = (g: GameState) => ({ x: g.entrance.x, y: g.entrance.y - 2 });
/** Can a guest walk from the gate to (x, y)? (a queue tile may be the goal) */
const reachable = (g: GameState, x: number, y: number) => { const s = gate(g); return (s.x === x && s.y === y) || findRoute(g, s.x, s.y, x, y, 20000) !== null; };

/** Give the ride what it is missing (entrance, exit, the paths to them, a stall's path) through the normal commands. */
export function autoConnect(g: GameState, rideId: number): ConnectResult {
  const r = g.rides.find(x => x.id === rideId); const res: ConnectResult = { ok: false, huts: 0, paths: 0, cost: 0 };
  if (!r) return { ...res, why: 'No such ride' }; const def = RIDE_BY_KEY[r.type];
  if (!tileAt(g, gate(g).x, gate(g).y)?.paths.length) return { ...res, why: 'Lay a path from the park gate first' };
  if (def.kind === 'coaster' && !trackDone(r)) return { ...res, why: isShuttle(r) ? 'Finish the track first' : 'Finish the circuit first' };
  const cash0 = g.finance.cash; const pathsBefore = g.tiles.reduce((a, t) => a + t.paths.length, 0);
  let why = '';
  const ok = trial(() => {
    if (def.kind === 'stall') {
      const fx = r.x + DX[r.rot], fy = r.y + DY[r.rot]; const t = tileAt(g, fx, fy); if (!t) { why = 'The counter faces the edge of the map'; return false; }
      if (t.paths.length && reachable(g, fx, fy)) return true;
      return connectTile(g, fx, fy, 0, new Set(), () => reachable(g, fx, fy)) || (why = 'No room for a path to the counter', false);
    }
    for (const exit of [false, true]) {
      const have = exit ? r.exit : r.entrance;
      if (have) { const fx = have.x - DX[have.dir], fy = have.y - DY[have.dir]; const t = tileAt(g, fx, fy);
        if (t?.paths.length && checkHut(g, r, exit)) continue;
        if (!connectTile(g, fx, fy, exit ? 0 : 8, new Set(), () => checkHut(g, r, exit))) { why = `No room for a path to the ${exit ? 'exit' : 'entrance'}`; return false; } continue; }
      const net = parkNetwork(g); const other = exit ? r.entrance : r.exit; const reserved = new Set<number>(other ? [other.y * g.w + other.x] : []);
      const spots = hutSpots(g, r).filter(s => !reserved.has(s.y * g.w + s.x)); const field = costField(g, net, reserved);
      const scored = spots.map(s => { const fk = s.fy * g.w + s.fx; const ft = tileAt(g, s.fx, s.fy); const c = ft && net[fk] ? 0 : field.cost[fk]; return { s, c }; }).filter(o => isFinite(o.c)).sort((a, b) => a.c - b.c);
      let placed = false;
      for (const { s } of scored.slice(0, 6)) {
        placed = trial(() => {
          const t = tileAt(g, s.x, s.y)!; if (t.scenery && !cmdRemoveScenery(g, s.x, s.y).ok) return false;
          if (!cmdPlaceEntrance(g, r.id, s.x, s.y, exit).ok) return false;
          const fk = s.fy * g.w + s.fx; const own = costField(g, net, new Set([...reserved, s.y * g.w + s.x]));   // the route may not cross its own hut
          const route = net[fk] ? [] : routeBack(own.parent, net, fk); if (!route) return false;
          const queueTiles = exit ? 0 : flatRun(g, route, tileAt(g, s.x, s.y)!.h, 8);
          return lay(g, route, queueTiles, 0) && checkHut(g, r, exit);
        });
        if (placed) break;
      }
      if (!placed) { why = scored.length ? `Could not join the ${exit ? 'exit' : 'entrance'} to a path` : `No room beside the ride for the ${exit ? 'exit' : 'entrance'}`; return false; }
    }
    return true;
  }, 'connect ' + r.name);
  if (!ok) return { ...res, why: why || (g.finance.cash < 2000 ? 'Not enough cash' : 'Could not connect the ride') };
  res.ok = true; res.cost = cash0 - g.finance.cash; res.paths = g.tiles.reduce((a, t) => a + t.paths.length, 0) - pathsBefore; res.huts = (r.entrance ? 1 : 0) + (r.exit ? 1 : 0);
  return res;
}
/** How many tiles from the hut stay level (a queue line cannot ramp), at most `max`. */
function flatRun(g: GameState, route: number[], h: number, max: number): number { let n = 0; while (n < route.length && n < max && isFlatLand(g.tiles[route[n]]) && g.tiles[route[n]].h === h && !g.tiles[route[n]].paths.length) n++; return n; }
/** Join one tile to the park's paths (a stall's counter, or the front of a hut placed by hand). */
function connectTile(g: GameState, fx: number, fy: number, queueTiles: number, reserved: Set<number>, check: () => boolean): boolean {
  const net = parkNetwork(g); const fk = fy * g.w + fx; if (net[fk]) return check();
  const field = costField(g, net, reserved); const route = routeBack(field.parent, net, fk); if (!route) return false;
  const h = g.tiles[fk].h; return trial(() => lay(g, route, Math.min(queueTiles, flatRun(g, route, h, queueTiles)), 0) && check());
}
/** The walk test for a hut: the gate reaches the end of the entrance's queue; the exit's front reaches the gate. */
function checkHut(g: GameState, r: Ride, exit: boolean): boolean {
  const hut = exit ? r.exit : r.entrance; if (!hut) return false;
  if (exit) { const fx = hut.x - DX[hut.dir], fy = hut.y - DY[hut.dir]; return !!tileAt(g, fx, fy)?.paths.length && reachable(g, fx, fy); }
  const line = traceQueue(g, r); if (!line.length) return false; const [ex, ey] = line[line.length - 1]; return reachable(g, ex, ey);
}
