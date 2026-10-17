// Auto-build: with the switch on, the park grows itself at random, a step every few seconds of play, with the park's
// own money (free in a sandbox park). It lays paths, places rides and stalls beside them (connected and opened),
// builds ready-made coasters, plants scenery, hires staff and sets fair prices. Take over any time: switch it off,
// or just build alongside it. Everything it does uses the same commands the player's clicks do.
import { DX, DY, type Dir, type GameState } from './types';
import { cmdPath, cmdPlaceRide, cmdScenery, cmdDemolishRide } from './game';
import { RIDE_BY_KEY, RIDE_TYPES } from './rides';
import { SCENERY } from './scenery';
import { tileAt, footprintFree, terrace, landTop } from './map';
import { spend, Cat } from './finance';
import { autoConnect } from './connect';
import { DESIGNS, cmdBuildDesign, designCost } from './designs';
import { openRide, testRide } from './ridesim';
import { hireStaff } from './staff';
import { fairPrice } from './guests';
import { rand, randInt, pick } from './rng';

export const AUTO_EVERY = 160;   // ticks between steps (4 seconds of play at normal speed)
const RESERVE = 300000;          // cents kept back for wages and upkeep ($3,000), unless the park pays nothing

const invented = (g: GameState, key: string) => g.noMoney || g.research.invented.includes(key);
const canPay = (g: GameState, cost: number) => g.noMoney || g.finance.cash - cost >= RESERVE;

/** Called every tick; does one step every AUTO_EVERY ticks while the switch is on. */
export function updateAutoBuild(g: GameState) {
  if (!g.autoBuild || g.tick % AUTO_EVERY !== 0) return;
  const n = g.rides.length, rides = g.rides.filter(r => RIDE_BY_KEY[r.type].kind !== 'stall').length;
  // what the park needs most: paths to build on, then rides, food and toilets, a coaster now and then, staff, scenery
  const steps: [number, () => boolean][] = [
    [spots(g, 2).length < 4 ? 6 : 1, () => growPath(g)],
    [rides < 3 ? 6 : 3, () => placeRide(g, 'ride')],
    [n - rides < rides / 2 ? 3 : 1, () => placeRide(g, 'stall')],
    [rides >= 3 && g.rides.filter(r => RIDE_BY_KEY[r.type].kind === 'coaster').length < 1 + rides / 5 ? 2 : 0.3, () => buildCoaster(g)],
    [g.staff.length * 25 < g.guestsInPark ? 2 : 0.2, () => hire(g)],
    [1.5, () => plant(g)],
    [0.5, () => prices(g)],
  ];
  for (let tries = 0; tries < 3; tries++) {
    const total = steps.reduce((a, [w]) => a + w, 0); let k = rand(g) * total;
    for (const [w, f] of steps) { k -= w; if (k <= 0) { if (f()) return; break; } }
  }
}

/** Path tiles (not queues) next to free land that is the park's: places to build beside. */
function spots(g: GameState, room = 1): [number, number, Dir][] {
  const out: [number, number, Dir][] = [];
  for (let y = 1; y < g.h - 1; y++) for (let x = 1; x < g.w - 1; x++) {
    const t = g.tiles[y * g.w + x]; if (!t.paths.length || t.paths.every(p => p.queue)) continue;
    for (let d = 0; d < 4; d++) { const nx = x + DX[d] + (DX[d] < 0 ? -room + 1 : 0), ny = y + DY[d] + (DY[d] < 0 ? -room + 1 : 0); if (levelable(g, nx, ny, room)) out.push([x, y, d as Dir]); }
  }
  return out;
}
/** Land the builder may level and build on: the park's, dry, with nothing built on it. */
function levelable(g: GameState, x: number, y: number, n: number): boolean {
  for (let yy = y; yy < y + n; yy++) for (let xx = x; xx < x + n; xx++) { const t = tileAt(g, xx, yy); if (!t || !t.owned || t.water || t.paths.length || t.rideId !== null || t.entrance || t.tracks.length) return false; }
  return true;
}
/** Level an n×n block to height h (trees cleared, $10 a tile), the land round it eased to match. */
function level(g: GameState, x: number, y: number, n: number, h: number): boolean {
  if (!levelable(g, x, y, n)) return false; if (!footprintFree(g, x, y, n)) {
    if (!canPay(g, n * n * 1000)) return false;
    for (let yy = y; yy < y + n; yy++) for (let xx = x; xx < x + n; xx++) { const t = tileAt(g, xx, yy)!; t.h = h; delete t.slope; t.scenery = null; }
    terrace(g, 2); if (!g.noMoney) spend(g, n * n * 1000, Cat.Landscaping);
  }
  return !footprintFree(g, x, y, n);
}
/** Lay a short straight path out from the end of an existing one (or off its side), up to 8 tiles. */
function growPath(g: GameState): boolean {
  const s = spots(g); if (!s.length) return false;
  for (let tries = 0; tries < 6; tries++) {
    const [x, y, d] = pick(g, s); const len = 3 + randInt(g, 6); let laid = 0;
    const h = landTop(tileAt(g, x, y)!);
    for (let i = 1; i <= len; i++) { const nx = x + DX[d] * i, ny = y + DY[d] * i; if (!canPay(g, 2000) || !level(g, nx, ny, 1, h)) break; if (!cmdPath(g, nx, ny, false, 0).ok) break; laid++; }
    if (laid) return true;
  }
  return false;
}
/** A ride (or stall) the park has invented and can pay for, placed beside a path, connected and opened. */
function placeRide(g: GameState, kind: 'ride' | 'stall'): boolean {
  const have = new Set(g.rides.map(r => r.type));
  const types = RIDE_TYPES.filter(d => (kind === 'stall' ? d.kind === 'stall' : d.kind === 'flat') && invented(g, d.key) && canPay(g, d.cost) && d.key !== 'cash_machine');
  if (!types.length) return false;
  const fresh = types.filter(d => !have.has(d.key)); const d = pick(g, fresh.length && rand(g) < 0.8 ? fresh : types);
  const s = spots(g, d.size); if (!s.length) return false;
  for (let tries = 0; tries < 8; tries++) {
    const [x, y, dir] = pick(g, s); const n = d.size; const ox = x + DX[dir] + (DX[dir] < 0 ? -n + 1 : 0) + (DY[dir] ? -randInt(g, n) : 0), oy = y + DY[dir] + (DY[dir] < 0 ? -n + 1 : 0) + (DX[dir] ? -randInt(g, n) : 0);
    const rot = ((dir + 2) & 3) as Dir;   // stalls face the path they stand beside
    if (!level(g, ox, oy, n, landTop(tileAt(g, x, y)!)) || !cmdPlaceRide(g, d.key, ox, oy, rot).ok) continue;
    const r = g.rides[g.rides.length - 1]; if (!autoConnect(g, r.id).ok) { cmdDemolishRide(g, r.id); continue; }
    if (r.status !== 'open') openRide(g, r); return true;
  }
  return false;
}
/** A ready-made coaster on open ground near the paths, connected, tested and opened. */
function buildCoaster(g: GameState): boolean {
  const ok = DESIGNS.filter(d => invented(g, d.type) && canPay(g, designCost(d) + 50000)); if (!ok.length) return false;
  const d = pick(g, ok); const s = spots(g); if (!s.length) return false;
  for (let tries = 0; tries < 12; tries++) {
    const [x, y, dir] = pick(g, s); const far = 2 + randInt(g, 4); const res = cmdBuildDesign(g, d.key, x + DX[dir] * far, y + DY[dir] * far, randInt(g, 4) as Dir);
    if (!res.ok || res.rideId === undefined) continue; const r = g.rides.find(q => q.id === res.rideId)!;
    autoConnect(g, r.id); if (r.status !== 'open') { testRide(g, r); openRide(g, r); } return true;
  }
  return false;
}
function hire(g: GameState): boolean {
  if (!canPay(g, 100000) || g.staff.length * 25 >= g.guestsInPark + 25) return false; const litter = g.tiles.reduce((a, t) => a + t.litter, 0), broken = g.rides.filter(r => r.breakdown).length;
  const want = broken > g.staff.filter(s => s.type === 'mechanic').length ? 'mechanic' : litter > 10 * (1 + g.staff.filter(s => s.type === 'handyman').length) ? 'handyman' : rand(g) < 0.5 ? 'handyman' : rand(g) < 0.6 ? 'mechanic' : 'security';
  return typeof hireStaff(g, want) !== 'string';
}
/** A few trees or flowers on free land beside the paths. */
function plant(g: GameState): boolean {
  const kinds = SCENERY.filter(s => (s.size ?? 1) === 1 && invented(g, 'scenery:' + s.group) && (s.group === 'trees' || s.group === 'gardens') && canPay(g, s.cost * 4)); if (!kinds.length) return false;
  const s = spots(g); if (!s.length) return false; let n = 0;
  for (let i = 0; i < 6; i++) { const [x, y, d] = pick(g, s); const k = pick(g, kinds); const tx = x + DX[d] * (1 + randInt(g, 2)), ty = y + DY[d] * (1 + randInt(g, 2)); if (tileAt(g, tx, ty) && !footprintFree(g, tx, ty, 1) && cmdScenery(g, tx, ty, k.key, randInt(g, 4) as Dir).ok) n++; }
  return n > 0;
}
/** Every ride and stall at a fair price (what guests are happy to pay). */
function prices(g: GameState): boolean {
  if (g.noMoney) return false; let n = 0;
  for (const r of g.rides) { const p = fairPrice(g, r); if (p !== r.price && p > 0) { r.price = p; n++; } }
  return n > 0;
}
