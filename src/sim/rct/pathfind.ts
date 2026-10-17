// Guest pathfinding, ported from OpenRCT2's GuestPathfinding.cpp (GPL-3.0, https://github.com/OpenRCT2/OpenRCT2),
// adapted to this game's paths (several per tile, joined edge to edge at matching heights).
//
// Guests do not plan a whole route. At every junction they look ahead a limited way: a depth-first search down each
// way out that stops after 5 junctions (7 with a park map or on the way out, 8 when lost on the way out), scores
// where each search got to by its distance from the goal and takes the best. They remember the last 4 junctions
// they passed on the way to this goal and which ways out they already tried, so a guest in a tangle of paths
// tries each way in turn. Without a goal they walk aimlessly: straight on half the time, otherwise any way but back.
//
// Differences from the original, for speed: a decision checks at most 5,000 tiles, not 15,000; the search runs on a copy of the path network rebuilt at most every
// 32 ticks (a guest only ever steps along paths that exist now), the guest's memory narrows the ways out at the
// junction they stand on but not deeper in the search, and the answer for the same junction, goal and ways out is
// shared by every guest asking within those 32 ticks.
import { DX, DY, type Dir, type GameState, type Guest, type PathTile } from '../types';
import { pathLink, nkey } from '../map';

export const MAX_JUNCTIONS = { guest: 5, map: 7, leaving: 7, leavingLost: 8 } as const;
const MAX_TILES = 5000;    // a whole decision checks at most this many tiles, shared out over the ways tried (RCT: 15,000;
                           // a third keeps a dense grid of paths from stalling a tick, and the junction limit usually stops first)
const MAX_STEPS = 200;     // one search path stops after this many tiles
const REBUILD = 32;        // ticks a copy of the path network is used for

/** The ways a path piece joins its neighbours, as a 4-bit mask (bit d = direction d). */
export function linkMask(g: GameState, x: number, y: number, p: PathTile): number {
  let m = 0; for (let d = 0; d < 4; d++) if (pathLink(g, x, y, p, d as Dir)) m |= 1 << d; return m;
}
const bits = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
const lowBit = (m: number) => m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : m & 8 ? 3 : -1;

/** RCT's distance score: tiles count 32, the shorter axis a sixteenth, height 2 a step. 0 = at the goal. */
export function heuristic(x: number, y: number, z: number, gx: number, gy: number, gz: number): number {
  let dx = Math.abs(x - gx) * 32, dy = Math.abs(y - gy) * 32; const dz = Math.abs(z - gz) * 2;
  if (dx < dy) dx >>= 4; else dy >>= 4; return dx + dy + dz;
}

/** The path network as arrays: a node per path piece, its neighbour node each way (-1 none), its ways-out mask,
 *  whether it is a thin junction, and the ride whose queue it is (-1 none). */
interface Graph { tick: number; nodes: number; at: Map<number, number>; key: Int32Array; x: Int16Array; y: Int16Array; z: Int16Array; nb: Int32Array; mask: Uint8Array; thin: Uint8Array; qride: Int32Array; memo: Map<string, number> }
const GRAPHS = new WeakMap<GameState, Graph>();
function graph(g: GameState): Graph {
  const old = GRAPHS.get(g); if (old && g.tick - old.tick < REBUILD && g.tick >= old.tick) return old;
  const at = new Map<number, number>(); const keys: number[] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) for (const p of g.tiles[y * g.w + x].paths) { at.set(nkey(x, y, p.z), keys.length); keys.push(nkey(x, y, p.z)); }
  const n = keys.length; const G: Graph = { tick: g.tick, nodes: n, at, key: Int32Array.from(keys), x: new Int16Array(n), y: new Int16Array(n), z: new Int16Array(n), nb: new Int32Array(n * 4).fill(-1), mask: new Uint8Array(n), thin: new Uint8Array(n), qride: new Int32Array(n).fill(-1), memo: new Map() };
  const queue = new Uint8Array(n);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) for (const p of g.tiles[y * g.w + x].paths) {
    const i = at.get(nkey(x, y, p.z))!; G.x[i] = x; G.y[i] = y; G.z[i] = p.z; if (p.queue) { queue[i] = 1; if (p.rideId !== null) G.qride[i] = p.rideId; }
    for (let d = 0; d < 4; d++) { const q = pathLink(g, x, y, p, d as Dir); if (q) { G.nb[i * 4 + d] = at.get(nkey(x + DX[d], y + DY[d], q.z))!; G.mask[i] |= 1 << d; } }
  }
  for (let i = 0; i < n; i++) { let c = 0; for (let d = 0; d < 4; d++) { const j = G.nb[i * 4 + d]; if (j >= 0 && !queue[j]) c++; } G.thin[i] = c > 2 ? 1 : 0; }   // queue lines coming off a path do not make a junction
  GRAPHS.set(g, G); return G;
}

/** Where the path in direction d leads, following it while it has only one way on (25 tiles at most). */
export function leadsTo(g: GameState, x: number, y: number, z: number, d: Dir): 'deadEnd' | 'junction' | 'queue' | 'limit' | 'none' {
  const G = graph(g); const i0 = G.at.get(nkey(x, y, z)); if (i0 === undefined) return 'none'; let i: number = i0;
  for (let level = 0; level <= 25; level++) {
    const j: number = G.nb[i * 4 + d]; if (j < 0) return 'none';
    if (G.qride[j] >= 0) return 'queue';
    const m = G.mask[j] & ~(1 << ((d + 2) & 3)); if (!m) return 'deadEnd'; if (bits(m) > 1) return 'junction';
    i = j; d = lowBit(m) as Dir;
  }
  return 'limit';
}

interface Search { junctions: number; maxJ: number; tiles: number; queueRide: number; hist: Int32Array; start: number; gx: number; gy: number; gz: number; score: number; steps: number }
function better(s: Search, score: number, steps: number) { if (score < s.score || (score === s.score && steps < s.steps)) { s.score = score; s.steps = steps; } }

/** PeepPathfindHeuristicSearch: from node i out through edge d and on, scoring where each search path ends. */
function search(G: Graph, s: Search, i: number, d: number, steps: number) {
  const j = G.nb[i * 4 + d]; steps++; s.tiles--;
  if (j < 0 || j === s.start) return;                         // nothing there, or back where the search began
  const score = heuristic(G.x[j], G.y[j], G.z[j], s.gx, s.gy, s.gz);
  if (score === 0) { better(s, score, steps); return; }       // the goal
  if (G.qride[j] >= 0 && G.qride[j] !== s.queueRide) return;  // another ride's queue line: not a way through
  const all = G.mask[j]; const edges = all & ~(1 << ((d + 2) & 3));
  if (!edges) return;                                         // a dead end: never the best way
  if (steps >= MAX_STEPS || s.tiles <= 0) { better(s, score, steps); return; }
  if (G.thin[j]) {
    for (let k = s.junctions + 1; k <= s.maxJ; k++) if (s.hist[k] === j) return;   // a loop in this search
    if (s.junctions <= 0) { better(s, score, steps); return; }
    s.hist[s.junctions] = j; s.junctions--;
  }
  for (let e = 0; e < 4; e++) {
    if (!(edges & (1 << e))) continue;
    const saved = s.junctions; search(G, s, j, e, steps); s.junctions = saved;
  }
}

/** ChooseDirection: the way out of (x, y) piece p that gets closest to the goal, or -1 when no search gets anywhere.
 *  The guest's memory (gu.pf) is updated as in the original. */
export function chooseDirection(g: GameState, gu: Guest, x: number, y: number, p: PathTile, goal: [number, number, number], queueRide: number | null, maxJ: number): number {
  const G = graph(g); const here = nkey(x, y, p.z), goalKey = nkey(goal[0], goal[1], goal[2]); const i = G.at.get(here);
  if (i === undefined) return -1;
  const permitted = linkMask(g, x, y, p); const isThin = G.thin[i] === 1;
  let mem = gu.pf; let edges = permitted;
  if (isThin && mem && mem.goal === goalKey) {
    const m = mem.keys.indexOf(here);
    if (m >= 0) { mem.tried[m] &= permitted; edges = mem.tried[m]; if (!edges) { mem.tried[m] = permitted; edges = permitted; } }
  }
  if (!mem || mem.goal !== goalKey) { mem = { goal: goalKey, keys: [], tried: [], next: 0 }; gu.pf = mem; }
  if (!edges) return -1;
  let chosen = lowBit(edges);
  if (edges & ~(1 << chosen)) {
    const memoKey = `${i}:${goalKey}:${maxJ}:${edges}:${queueRide ?? -1}`; const hit = G.memo.get(memoKey);
    if (hit !== undefined) chosen = hit;
    else {
      let bestScore = 0xffff, bestSteps = 0xff; const n = bits(edges);
      for (let e = 0; e < 4; e++) {
        if (!(edges & (1 << e))) continue;
        const s: Search = { junctions: maxJ, maxJ, tiles: Math.floor(MAX_TILES / n), queueRide: queueRide ?? -1, hist: new Int32Array(maxJ + 1).fill(-1), start: i, gx: goal[0], gy: goal[1], gz: goal[2], score: 0xffff, steps: 0xff };
        s.hist[0] = i; search(G, s, i, e, 0);
        if (s.score < bestScore || (s.score === bestScore && s.steps < bestSteps)) { chosen = e; bestScore = s.score; bestSteps = s.steps; }
      }
      if (bestScore === 0xffff) chosen = -1;
      G.memo.set(memoKey, chosen);
    }
    if (chosen < 0) return -1;
  }
  if (isThin) {   // remember this junction and the ways now tried (the way taken, and the way they came in)
    const back = 1 << ((gu.dir + 2) & 3); let m = mem.keys.indexOf(here);
    if (m < 0) { m = mem.next; mem.next = (mem.next + 1) & 3; mem.keys[m] = here; mem.tried[m] = permitted; }
    mem.tried[m] &= ~(1 << chosen) & ~back;
  }
  return chosen;
}

/** GuestPathfindAimless: straight on half the time when it can, otherwise any of the allowed ways. */
export function aimless(rand: () => number, dir: Dir, edges: number): number {
  if (rand() < 0.5 && edges & (1 << dir)) return dir;
  const opts: number[] = []; for (let d = 0; d < 4; d++) if (edges & (1 << d)) opts.push(d);
  return opts.length ? opts[Math.floor(rand() * opts.length)] : -1;
}
