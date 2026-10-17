// Per-park working memory that is never saved: id → index lookups, the walking crowd on each tile, queue lines
// traced once a tick, and reusable buffers for route finding. It only ever speeds up a lookup; whenever it might be
// out of date it is rebuilt from the park itself, so the rules never depend on it.
import type { GameState, Guest, Ride } from './types';

interface Index<T> { arr: T[]; n: number; at: Map<number, number> }
interface Runtime {
  rides: Index<Ride> | null; guests: Index<Guest> | null;
  crowdTick: number; crowd: Uint16Array | null;            // walking guests per tile, counted once a tick
  entering: number;                                        // guests between the map edge and the gate (last tick)
  lines: WeakMap<Ride, { tick: number; line: [number, number][] }>;
  seen: Uint32Array | null; prev: Int32Array | null; stamp: number;   // route finding: visited stamps + parents
}
const RT = new WeakMap<GameState, Runtime>();
export function runtime(g: GameState): Runtime {
  let r = RT.get(g);
  if (!r) RT.set(g, r = { rides: null, guests: null, crowdTick: -1, crowd: null, entering: 0, lines: new WeakMap(), seen: null, prev: null, stamp: 0 });
  return r;
}

/** A hit is checked against the array itself; a miss rebuilds the index once (the array may have been changed in place). */
function find<T extends { id: number }>(arr: T[], idx: Index<T> | null, id: number, set: (i: Index<T>) => void): T | undefined {
  if (idx && idx.arr === arr && idx.n === arr.length) { const i = idx.at.get(id); if (i !== undefined && arr[i]?.id === id) return arr[i]; }
  const at = new Map<number, number>(); for (let i = 0; i < arr.length; i++) at.set(arr[i].id, i); set({ arr, n: arr.length, at });
  const i = at.get(id); return i === undefined ? undefined : arr[i];
}
/** The ride with this id (a quick lookup instead of a search through every ride). */
export function rideById(g: GameState, id: number | null | undefined): Ride | undefined {
  if (id === null || id === undefined) return undefined; const rt = runtime(g); return find(g.rides, rt.rides, id, i => { rt.rides = i; });
}
/** The guest with this id. */
export function guestById(g: GameState, id: number | null | undefined): Guest | undefined {
  if (id === null || id === undefined) return undefined; const rt = runtime(g); return find(g.guests, rt.guests, id, i => { rt.guests = i; });
}
/** How many guests are walking on a tile right now (counted once per tick for everyone). */
export function crowdAt(g: GameState, x: number, y: number): number {
  const rt = runtime(g);
  if (rt.crowdTick !== g.tick || !rt.crowd || rt.crowd.length !== g.w * g.h) {
    const c = rt.crowd && rt.crowd.length === g.w * g.h ? rt.crowd.fill(0) : new Uint16Array(g.w * g.h);
    for (const o of g.guests) if (o.state === 'walking' && o.tx >= 0 && o.ty >= 0 && o.tx < g.w && o.ty < g.h) c[o.ty * g.w + o.tx]++;
    rt.crowd = c; rt.crowdTick = g.tick;
  }
  return x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : rt.crowd[y * g.w + x];
}
