// Game state creation, the tick, and every build command (each one undoable).
import { DX, DY, LAND_STEP, MONTH_TICKS, WEEK_TICKS, FORTNIGHT_TICKS, DAYS_IN_MONTH, Surface, clamp, key, type Dir, type GameState, type Ride, type Tile, type TrackPiece, type NewsItem } from './types';
import { rand, randInt } from './rng';
import { generateMap, tileAt, footprintFree, inBounds } from './map';
import { newFinance, spend, earn, canAfford, weeklyInterest, weeklyResearchCost, shiftMonth, Cat } from './finance';
import { RIDE_BY_KEY, STARTING_INVENTED, RIDE_TYPES } from './rides';
import { SCENERY_BY_KEY, SCENERY, sizeOf } from './scenery';
import { PIECE_BY_KEY, pieceTiles, pieceEnd, turnDir } from './track';
import { tempoOf } from './time';
import { updateGuests, spawnGuests } from './guests';
import { updateRides, computeRideValue, removeRideFromMap, flatRatings } from './ridesim';
import { updateStaff } from './staff';
import { updateParkRating, updateParkValue, updateSuggestedMax } from './park';
import { updateResearch, researchQueue, unlockEverything } from './research';
import { updateWeather, newWeather } from './weather';
import { updateAwards } from './awards';
import { updateMarketing } from './marketing';
import { updateGoals, addChronicle, makeGoals } from './goals';
import { rideById } from './runtime';

export interface NewParkOptions { name: string; size: 'small' | 'medium' | 'large'; cash: number; loan: number; maxLoan: number; difficulty: 'easy' | 'normal' | 'hard'; sandbox: boolean; seed?: number; goalMinutes?: number /* 0 or absent = free play */; tempo?: number /* TEMPOS index */; }
export const SIZES = { small: 48, medium: 64, large: 96 };

export function newGame(o: NewParkOptions): GameState {
  const seed = o.seed ?? (Date.now() & 0x7fffffff);
  const g: GameState = {
    version: 1, seed, rng: seed, tick: 0, monthTick: 0, monthsElapsed: 0, speed: 1, parkName: o.name,
    w: 0, h: 0, tiles: [], rides: [], nextRideId: 1, guests: [], nextGuestId: 1, staff: [], nextStaffId: 1,
    finance: newFinance(o.cash, o.loan, o.maxLoan, true, 0),
    research: { stage: 'initial', progress: 0, current: null, queue: [], invented: [...STARTING_INVENTED], lastInvented: null, expectedMonth: null },
    campaigns: [], news: [], weather: newWeather(), awards: [],
    rating: 700, ratingHist: [], guestHist: [], cashHist: [], ratingCasualtyPenalty: 0, parkOpen: true,
    entrance: { x: 0, y: 0, dir: 3 }, spawn: { x: 0, y: 0 }, guestsInPark: 0, totalAdmissions: 0, suggestedMax: 0,
    difficultGuests: o.difficulty === 'hard', lostCount: 0, stats: { totalRidesTaken: 0, vomits: 0, litterSwept: 0, crashesEver: 0 },
    noMoney: o.sandbox, landPrice: o.difficulty === 'easy' ? 3000 : o.difficulty === 'hard' ? 9000 : 5000, musicOn: true, tempo: o.tempo ?? 0,
  };
  const n = SIZES[o.size];
  generateMap(g, { w: n, h: n, hills: o.difficulty === 'easy' ? 0.5 : 0.8, water: o.difficulty === 'hard' ? 0.9 : 0.6, trees: 1 });
  g.research.queue = researchQueue(g);
  g.research.stage = 'initial';
  if (o.difficulty === 'easy') g.finance.interestRate = 7; if (o.difficulty === 'hard') g.finance.interestRate = 13;
  if (!o.goalMinutes || o.sandbox) unlockEverything(g);   /* free play and sandbox: everything available */
  if (o.goalMinutes) { g.goals = makeGoals(g, o.goalMinutes, o.size, o.difficulty); const gl = g.goals; news(g, 'park', `Goals for ${o.goalMinutes} minutes: ${gl.guests} guests in the park, a rating of ${gl.rating}${gl.cash ? `, and $${(gl.cash / 100).toLocaleString('en-US')} on hand` : ''}. Hold them all for two minutes.`); }
  news(g, 'park', `Welcome to ${o.name}! Lay paths from the entrance and build your first ride.`);
  return g;
}

export function news(g: GameState, icon: string, text: string, subject?: NewsItem['subject']) {
  g.news.unshift({ tick: g.tick, icon, text, subject }); if (g.news.length > 60) g.news.length = 60; addChronicle(g, text);
}

// ---------- the tick ----------
export function tick(g: GameState) {
  // the calendar moves 1, 2 or 4 month-ticks a tick (the tempo); days, weeks and fortnights start when a step crosses them
  const prev = g.monthTick, now = prev + tempoOf(g).month, days = DAYS_IN_MONTH[g.monthsElapsed % 8]; g.tick++;
  const newDay = Math.floor((prev * days) / MONTH_TICKS) !== Math.floor((now * days) / MONTH_TICKS);
  const newWeek = Math.floor(prev / WEEK_TICKS) !== Math.floor(now / WEEK_TICKS);
  const newFortnight = Math.floor(prev / FORTNIGHT_TICKS) !== Math.floor(now / FORTNIGHT_TICKS) && now < MONTH_TICKS;
  g.monthTick = now;
  if (now >= MONTH_TICKS) { g.monthTick = now - MONTH_TICKS; g.monthsElapsed++; monthStart(g); }
  if (newWeek) weekStart(g);
  if (newFortnight) fortnight(g);
  if (newDay) dayStart(g);
  spawnGuests(g);
  updateGuests(g);
  updateRides(g);
  updateStaff(g);
  updateResearch(g);
  updateWeather(g);
  if ((g.tick & 511) === 0) { updateParkRating(g); updateSuggestedMax(g); }
  if ((g.tick & 2047) === 0) { updateParkValue(g); for (const r of g.rides) r.value = computeRideValue(g, r); }
  if ((g.tick & 1023) === 0) tidyLitterAges(g);
  updateGoals(g, text => news(g, 'park', text));
}
function dayStart(g: GameState) {
  g.ratingCasualtyPenalty = Math.max(0, g.ratingCasualtyPenalty - (g.noMoney ? 40 : 7));
  g.ratingHist.push(g.rating); if (g.ratingHist.length > 240) g.ratingHist.shift();
  g.guestHist.push(g.guestsInPark); if (g.guestHist.length > 240) g.guestHist.shift();
  g.cashHist.push(g.finance.cash); if (g.cashHist.length > 240) g.cashHist.shift();
}
function weekStart(g: GameState) {
  // wages
  const wages: Record<string, number> = { handyman: 5000, mechanic: 8000, security: 6000, entertainer: 5500 };
  let w = 0; for (const s of g.staff) w += wages[s.type] / 4; if (w) spend(g, w, Cat.Wages);
  weeklyInterest(g); weeklyResearchCost(g); updateMarketing(g);
  g.finance.weeklyProfit = 0;
}
function fortnight(g: GameState) {
  let up = 0; for (const r of g.rides) if (r.status !== 'closed' || r.type.endsWith('coaster')) up += RIDE_BY_KEY[r.type].upkeep;
  if (up) spend(g, up, Cat.RunningCosts);
}
function monthStart(g: GameState) {
  shiftMonth(g); updateAwards(g);
  for (const r of g.rides) { r.incomeHist.unshift(0); if (r.incomeHist.length > 16) r.incomeHist.length = 16; }
  if (g.finance.loan > 0 && g.finance.cash < 0) news(g, 'finance', 'The park is in the red: income cannot cover the loan interest and wages.');
}
function tidyLitterAges(g: GameState) { for (const t of g.tiles) if (t.litter || t.vomit) t.litterAge += 1024; }

// ---------- undo ----------
export interface UndoEntry { label: string; undo: () => void }
export const undoStack: UndoEntry[] = [];
let undoCollect: UndoEntry[] | null = null;
export function pushUndo(label: string, undo: () => void) { if (undoCollect) { undoCollect.push({ label, undo }); return; } undoStack.push({ label, undo }); if (undoStack.length > 50) undoStack.shift(); }
/** Run several commands as one step: a single Cmd+Z takes all of them back (a painted row, an area of flowers).
 *  The steps are collected as they happen, so a full undo list (50) cannot split them. */
export function undoGroup(fn: () => void, label: () => string) {
  const outer = undoCollect, steps: UndoEntry[] = []; undoCollect = steps; try { fn(); } finally { undoCollect = outer; }
  if (steps.length === 1) pushUndo(steps[0].label, steps[0].undo); else if (steps.length) pushUndo(label(), () => { for (const e of [...steps].reverse()) e.undo(); });
}
/** Try several commands together: if fn says no, everything it did is taken back at once and nothing reaches the undo
 *  list; if it says yes, its steps join whatever group is collecting (or the undo list). Groups and trials nest. */
export function trial(fn: () => boolean, label = 'build'): boolean {
  const outer = undoCollect, steps: UndoEntry[] = []; undoCollect = steps; let ok = false;
  try { ok = fn(); } finally { undoCollect = outer; if (!ok) for (const e of [...steps].reverse()) e.undo(); }
  if (ok && steps.length) { if (outer) outer.push(...steps); else pushUndo(steps.length === 1 ? steps[0].label : label, () => { for (const e of [...steps].reverse()) e.undo(); }); }
  return ok;
}
export function undo(): string | null { const e = undoStack.pop(); if (!e) return null; e.undo(); return e.label; }

export type CmdResult = { ok: true; cost: number } | { ok: false; error: string };
const fail = (error: string): CmdResult => ({ ok: false, error });
const snapshotTile = (t: Tile): Tile => JSON.parse(JSON.stringify(t));

// ---------- land ----------
export function cmdLand(g: GameState, x: number, y: number, dir: 1 | -1, brush = 1): CmdResult {
  const changes: { x: number; y: number; before: Tile }[] = []; let cost = 0;
  for (let yy = y; yy < y + brush; yy++) for (let xx = x; xx < x + brush; xx++) {
    const t = tileAt(g, xx, yy); if (!t) continue;
    if (!t.owned) return fail('You do not own this land');
    if (t.path || t.rideId !== null || t.entrance || t.tracks.length || (t.scenery && sizeOf(t.scenery.kind) > 1)) return fail('Clear the tile first');
    const nh = t.h + dir * LAND_STEP; if (nh < 0 || nh > 14 * LAND_STEP) return fail(dir > 0 ? 'Too high' : 'Too low');
    cost += 2000;
  }
  if (!canAfford(g, cost)) return fail('Not enough cash');
  for (let yy = y; yy < y + brush; yy++) for (let xx = x; xx < x + brush; xx++) {
    const t = tileAt(g, xx, yy); if (!t) continue; changes.push({ x: xx, y: yy, before: snapshotTile(t) });
    t.h += dir * LAND_STEP; if (t.water && dir > 0) t.water = false;
    if (t.scenery && SCENERY_BY_KEY[t.scenery.kind]?.waterable) { /* flowers survive */ }
    t.surf = t.h >= 5 * LAND_STEP ? Surface.Rock : t.surf === Surface.Rock ? Surface.Grass : t.surf;
  }
  spend(g, cost, Cat.Landscaping);
  pushUndo('land', () => { for (const c of changes) g.tiles[c.y * g.w + c.x] = c.before; earn(g, cost, Cat.Landscaping); });
  return { ok: true, cost };
}
export function cmdWater(g: GameState, x: number, y: number): CmdResult {
  const t = tileAt(g, x, y); if (!t) return fail('Off the map');
  if (!t.owned) return fail('You do not own this land');
  if (t.path || t.rideId !== null || t.entrance || t.tracks.length) return fail('Clear the tile first');
  const before = snapshotTile(t); const cost = 2500; if (!canAfford(g, cost)) return fail('Not enough cash');
  if (t.water) { t.water = false; t.h += LAND_STEP; t.surf = Surface.Grass; }
  else { if (t.h < LAND_STEP) return fail('Lower land first'); if (t.scenery && sizeOf(t.scenery.kind) > 1) return fail('Remove the piece there first'); t.h -= LAND_STEP; t.water = true; t.scenery = null; t.surf = Surface.Sand; }
  spend(g, cost, Cat.Landscaping);
  pushUndo('water', () => { g.tiles[y * g.w + x] = before; earn(g, cost, Cat.Landscaping); });
  return { ok: true, cost };
}
export function cmdSurface(g: GameState, x: number, y: number, surf: Surface): CmdResult {
  const t = tileAt(g, x, y); if (!t || !t.owned) return fail('You do not own this land'); if (t.water) return fail('That is water');
  const before = t.surf; t.surf = surf; pushUndo('surface', () => { t.surf = before; }); return { ok: true, cost: 0 };
}
export function cmdBuyLand(g: GameState, x: number, y: number): CmdResult {
  const t = tileAt(g, x, y); if (!t) return fail('Off the map'); if (t.owned) return fail('Already owned');
  if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) return fail('The edge of the map cannot be bought');
  if (!canAfford(g, g.landPrice)) return fail('Not enough cash');
  t.owned = true; spend(g, g.landPrice, Cat.Land);
  pushUndo('buy land', () => { t.owned = false; earn(g, g.landPrice, Cat.Land); });
  return { ok: true, cost: g.landPrice };
}

// ---------- paths ----------
export const PATH_COST = 1000, QUEUE_COST = 1500;
export function cmdPath(g: GameState, x: number, y: number, queue: boolean, style = 0): CmdResult {
  const t = tileAt(g, x, y); if (!t) return fail('Off the map');
  if (!t.owned) return fail('You do not own this land');
  if (t.water) return fail('Cannot build a path on water');
  if (t.rideId !== null || t.entrance) return fail('A ride is in the way');
  if (t.path && t.path.queue === queue && t.path.style === style) return fail('There is already a path here');
  const cost = queue ? QUEUE_COST : PATH_COST; if (!canAfford(g, cost)) return fail('Not enough cash');
  const before = snapshotTile(t);
  // ramps: if exactly one flat neighbour path sits one step higher and none at the same level, make this tile a ramp up to it
  let slope: Dir | -1 = -1;
  if (!queue) {
    const same: number[] = [], higher: number[] = [];
    for (let d = 0; d < 4; d++) { const n = tileAt(g, x + DX[d], y + DY[d]); if (n && n.path && !n.path.queue) { if (n.h === t.h && n.path.slope === -1) same.push(d); if (n.h === t.h + LAND_STEP && n.path.slope === -1) higher.push(d); } }
    if (same.length === 0 && higher.length === 1) slope = higher[0] as Dir;
    else if (same.length === 1 && higher.length === 1 && ((same[0] + 2) & 3) === higher[0]) slope = higher[0] as Dir;
  }
  if (t.scenery && sizeOf(t.scenery.kind) > 1) return fail('Remove the ' + (SCENERY_BY_KEY[t.scenery.kind]?.name.toLowerCase() ?? 'piece') + ' first');
  t.path = { queue, rideId: null, style, slope, adds: t.path?.adds ?? {} }; t.scenery = null;
  // the other way round: a flat path one step LOWER next to this tile becomes a ramp up to it (when that does not break a junction)
  const touched: { x: number; y: number; before: Tile }[] = [];
  if (!queue && slope === -1) for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d]; const n = tileAt(g, nx, ny); if (!n?.path || n.path.queue || n.path.slope !== -1 || n.h !== t.h - LAND_STEP) continue;
    const toward = ((d + 2) & 3) as Dir;   // direction from the neighbour towards this tile
    let sideLinks = false; for (let dd = 0; dd < 4; dd++) { if (dd === toward || dd === d) continue; const m = tileAt(g, nx + DX[dd], ny + DY[dd]); if (m?.path && m.h === n.h) sideLinks = true; }
    if (sideLinks) continue;
    touched.push({ x: nx, y: ny, before: snapshotTile(n) }); n.path.slope = toward;
  }
  spend(g, cost, Cat.RideConstruction);
  pushUndo('path', () => { g.tiles[y * g.w + x] = before; for (const c of touched) g.tiles[c.y * g.w + c.x] = c.before; earn(g, cost, Cat.RideConstruction); });
  return { ok: true, cost };
}
export function cmdRemovePath(g: GameState, x: number, y: number): CmdResult {
  const t = tileAt(g, x, y); if (!t || !t.path) return fail('No path here');
  if (!t.owned) return fail('You do not own this land');
  const before = snapshotTile(t); t.path = null; t.litter = 0; t.vomit = 0;
  for (const gu of g.guests) if (gu.tx === x && gu.ty === y) gu.route = null;
  pushUndo('remove path', () => { g.tiles[y * g.w + x] = before; });
  return { ok: true, cost: 0 };
}
export function cmdPathAdd(g: GameState, x: number, y: number, what: 'bench' | 'lamp' | 'bin'): CmdResult {
  const t = tileAt(g, x, y); if (!t || !t.path) return fail('Needs a path');
  if (t.path.queue && what !== 'lamp') return fail('Only lamps fit on a queue');
  if (t.path.slope !== -1) return fail('Not on a slope');
  const cost = what === 'bench' ? 1500 : what === 'lamp' ? 700 : 900; if (!canAfford(g, cost)) return fail('Not enough cash');
  const before = { ...t.path.adds };
  if (what === 'bin') t.path.adds.bin = 0; else t.path.adds[what] = true; t.path.broken = false;
  spend(g, cost, Cat.RideConstruction);
  pushUndo('path item', () => { t.path!.adds = before; earn(g, cost, Cat.RideConstruction); });
  return { ok: true, cost };
}

// ---------- scenery ----------
/** The corner tile of the piece on (x, y), and every tile it covers. */
export function pieceAt(g: GameState, x: number, y: number): { root: [number, number]; tiles: Tile[]; kind: string } | null {
  const t = tileAt(g, x, y); if (!t?.scenery) return null; const [rx, ry] = t.scenery.root ?? [x, y]; const n = sizeOf(t.scenery.kind); const tiles: Tile[] = [];
  for (let yy = ry; yy < ry + n; yy++) for (let xx = rx; xx < rx + n; xx++) { const c = tileAt(g, xx, yy); if (c?.scenery) tiles.push(c); }
  return { root: [rx, ry], tiles, kind: t.scenery.kind };
}
/** Flat rides' ratings follow the scenery round them: refreshed whenever a piece is placed or removed. */
function refreshFlatRatings(g: GameState) { for (const r of g.rides) if (RIDE_BY_KEY[r.type].kind === 'flat') r.ratings = flatRatings(g, r); }
/** Clear a whole piece (all its tiles) from any tile it covers; returns an undo. */
function clearPiece(g: GameState, x: number, y: number): () => void {
  const p = pieceAt(g, x, y); if (!p) return () => {}; const before = p.tiles.map(t => [t, t.scenery] as const); for (const t of p.tiles) t.scenery = null;
  return () => { for (const [t, s] of before) t.scenery = s; };
}
/** Place a piece with its corner at (x, y). Big pieces need every tile free, owned and level. */
export function cmdScenery(g: GameState, x: number, y: number, kind: string, rot: Dir, colour?: number): CmdResult {
  const def = SCENERY_BY_KEY[kind]; if (!def) return fail('Unknown item'); const n = def.size ?? 1;
  const first = tileAt(g, x, y); if (!first) return fail('Off the map');
  for (let yy = y; yy < y + n; yy++) for (let xx = x; xx < x + n; xx++) {
    const t = tileAt(g, xx, yy); if (!t) return fail('Off the map');
    if (!t.owned) return fail('You do not own this land');
    if (t.water || t.path || t.rideId !== null || t.entrance || t.tracks.length) return fail('Something is in the way');
    if (t.scenery) return fail('Remove the item there first');
    if (t.h !== first.h) return fail(`The ${def.name.toLowerCase()} needs level ground (${n}×${n})`);
  }
  if (!canAfford(g, def.cost)) return fail('Not enough cash');
  const placed: Tile[] = []; for (let yy = y; yy < y + n; yy++) for (let xx = x; xx < x + n; xx++) { const t = tileAt(g, xx, yy)!; t.scenery = { kind, rot, age: 0, ...(n > 1 ? { root: [x, y] as [number, number] } : {}), ...(colour !== undefined ? { colour } : {}) }; placed.push(t); }
  spend(g, def.cost, Cat.Landscaping); refreshFlatRatings(g);
  pushUndo('scenery', () => { for (const t of placed) t.scenery = null; earn(g, def.cost, Cat.Landscaping); refreshFlatRatings(g); });
  return { ok: true, cost: def.cost };
}
export function cmdRemoveScenery(g: GameState, x: number, y: number): CmdResult {
  const t = tileAt(g, x, y); if (!t || !t.scenery) return fail('Nothing here');
  if (!t.owned) return fail('You do not own this land');
  const restore = clearPiece(g, x, y); refreshFlatRatings(g); pushUndo('remove scenery', () => { restore(); refreshFlatRatings(g); });
  return { ok: true, cost: 0 };
}
/** Turn a piece a quarter (all its tiles keep the same corner). */
export function cmdRotateScenery(g: GameState, x: number, y: number): CmdResult {
  const p = pieceAt(g, x, y); if (!p) return fail('Nothing here'); const before = p.tiles[0].scenery!.rot; const rot = ((before + 1) & 3) as Dir;
  for (const t of p.tiles) t.scenery!.rot = rot; pushUndo('turn scenery', () => { for (const t of p.tiles) if (t.scenery) t.scenery.rot = before; });
  return { ok: true, cost: 0 };
}
/** Change a piece's accent colour (a palette index). */
export function cmdRecolourScenery(g: GameState, x: number, y: number, colour: number): CmdResult {
  const p = pieceAt(g, x, y); if (!p) return fail('Nothing here'); if (!SCENERY_BY_KEY[p.kind]?.recolour) return fail('This piece has one colour');
  const before = p.tiles[0].scenery!.colour; for (const t of p.tiles) t.scenery!.colour = colour;
  pushUndo('recolour scenery', () => { for (const t of p.tiles) if (t.scenery) t.scenery.colour = before; });
  return { ok: true, cost: 0 };
}

// ---------- rides ----------
let rideNameCounters: Record<string, number> = {};
function rideName(g: GameState, typeKey: string): string {
  const base = RIDE_BY_KEY[typeKey].name; let n = 1;
  while (g.rides.some(r => r.name === `${base} ${n}`)) n++;
  return `${base} ${n}`;
}
export function blankRide(g: GameState, typeKey: string, x: number, y: number, rot: Dir): Ride {
  const def = RIDE_BY_KEY[typeKey];
  const c = def.coaster;
  return { id: g.nextRideId++, type: typeKey, name: rideName(g, typeKey), x, y, rot, status: 'closed', price: def.price, price2: def.item2Price ?? 300, ratings: def.kind === 'flat' ? { ...def.base! } : null, stats: null,
    built: g.monthsElapsed, reliability: 25000, breakdown: null, lastInspection: 0, inspection: 30, downtime: 0, downHist: 0, customers: 0, recent: [0], income: 0, incomeHist: [0], popularity: 255, satisfaction: 0, value: 0,
    queue: [], riders: [], cycle: 0, running: false, colours: [c ? c.carColour : randInt(g, 12), randInt(g, 12), randInt(g, 12)], entrance: null, exit: null, pieces: [], trains: [], numTrains: 1, carsPerTrain: c ? c.cars : 0, closedLoop: false, crashes: 0, thoughtGood: 0, thoughtBad: 0 };
}
export function cmdPlaceRide(g: GameState, typeKey: string, x: number, y: number, rot: Dir): CmdResult {
  const def = RIDE_BY_KEY[typeKey]; if (!def) return fail('Unknown ride');
  if (!g.research.invented.includes(typeKey)) return fail('Not yet researched');
  const why = footprintFree(g, x, y, def.size); if (why) return fail(why);
  for (let yy = y; yy < y + def.size; yy++) for (let xx = x; xx < x + def.size; xx++) if (tileAt(g, xx, yy)!.scenery) return fail('Scenery is in the way');
  if (!canAfford(g, def.cost)) return fail('Not enough cash');
  const ride = blankRide(g, typeKey, x, y, rot);
  g.rides.push(ride);
  for (let yy = y; yy < y + def.size; yy++) for (let xx = x; xx < x + def.size; xx++) tileAt(g, xx, yy)!.rideId = ride.id;
  spend(g, def.cost, Cat.RideConstruction);
  if (def.kind === 'stall') { ride.status = 'open'; }
  pushUndo('place ride', () => { removeRideFromMap(g, ride); g.rides = g.rides.filter(r => r !== ride); earn(g, def.cost, Cat.RideConstruction); });
  return { ok: true, cost: def.cost };
}
/** Entrance / exit hut on a tile next to the ride (flat rides) or next to a station piece (coasters). dir = side facing the ride. */
export function cmdPlaceEntrance(g: GameState, rideId: number, x: number, y: number, exit: boolean): CmdResult {
  const ride = rideById(g, rideId); if (!ride) return fail('No such ride');
  const t = tileAt(g, x, y); if (!t) return fail('Off the map');
  if (!t.owned) return fail('You do not own this land');
  if (t.water || t.path || t.rideId !== null || t.entrance || t.tracks.length || t.scenery) return fail('Something is in the way');
  const def = RIDE_BY_KEY[ride.type];
  // which side touches the ride?
  let dir: Dir | -1 = -1;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d]; const n = tileAt(g, nx, ny); if (!n) continue;
    if (def.kind === 'coaster') { if (n.tracks.some(tr => tr.rideId === rideId && ride.pieces[tr.piece]?.type === 'station') && Math.abs(n.h - t.h) <= LAND_STEP * 0) { dir = d as Dir; break; } }
    else if (n.rideId === rideId && n.h === t.h) { dir = d as Dir; break; }
  }
  if (dir === -1) return fail(def.kind === 'coaster' ? 'Must touch a station piece at the same height' : 'Must touch the ride at the same height');
  const cost = 2000; if (!canAfford(g, cost)) return fail('Not enough cash');
  const before = snapshotTile(t); const prev = exit ? ride.exit : ride.entrance;
  if (prev) { const pt = tileAt(g, prev.x, prev.y); if (pt) pt.entrance = null; }
  t.entrance = { rideId, exit, dir }; if (exit) ride.exit = { x, y, dir }; else ride.entrance = { x, y, dir };
  spend(g, cost, Cat.RideConstruction);
  pushUndo(exit ? 'exit' : 'entrance', () => { g.tiles[y * g.w + x] = before; if (exit) ride.exit = prev; else ride.entrance = prev; if (prev) tileAt(g, prev.x, prev.y)!.entrance = { rideId, exit, dir: prev.dir }; earn(g, cost, Cat.RideConstruction); });
  return { ok: true, cost };
}
export function cmdDemolishRide(g: GameState, rideId: number): CmdResult {
  const ride = rideById(g, rideId); if (!ride) return fail('No such ride');
  const snapshot = JSON.parse(JSON.stringify(ride)) as Ride;
  const tiles = new Map<number, Tile>();
  const def = RIDE_BY_KEY[ride.type];
  const remember = (x: number, y: number) => { const t = tileAt(g, x, y); if (t && !tiles.has(key(x, y))) tiles.set(key(x, y), snapshotTile(t)); };
  if (def.kind === 'coaster') for (const p of ride.pieces) for (const [x, y] of pieceTiles(p)) remember(x, y);
  else for (let yy = ride.y; yy < ride.y + def.size; yy++) for (let xx = ride.x; xx < ride.x + def.size; xx++) remember(xx, yy);
  if (ride.entrance) remember(ride.entrance.x, ride.entrance.y); if (ride.exit) remember(ride.exit.x, ride.exit.y);
  for (const t of g.tiles) if (t.path && t.path.rideId === rideId) { /* queue stays, loses its link */ }
  removeRideFromMap(g, ride); g.rides = g.rides.filter(r => r !== ride);
  const refund = Math.floor(def.cost * 0.5);
  earn(g, refund, Cat.RideConstruction);
  pushUndo('demolish ride', () => { g.rides.push(snapshot); for (const [k, t] of tiles) g.tiles[(k >> 10) * g.w + (k & 1023)] = t; spend(g, refund, Cat.RideConstruction); });
  return { ok: true, cost: -refund };
}

// ---------- coaster construction ----------
export interface BuildCursor { x: number; y: number; z: number; dir: Dir }
export function coasterCursor(g: GameState, ride: Ride): BuildCursor | null {
  if (!ride.pieces.length) return null; return pieceEnd(ride.pieces[ride.pieces.length - 1]);
}
export function pieceCost(ride: Ride, pieceKey: string): number {
  const def = RIDE_BY_KEY[ride.type]; return Math.round((def.coaster?.pieceCost ?? 3000) * PIECE_BY_KEY[pieceKey].costMul);
}
/** Check whether a piece can be built at the cursor. Returns null when fine, otherwise the reason. */
export function checkPiece(g: GameState, ride: Ride, pieceKey: string, at: BuildCursor): string | null {
  const def = PIECE_BY_KEY[pieceKey]; const rdef = RIDE_BY_KEY[ride.type]; const c = rdef.coaster!;
  if (def.inversion && !c.loops) return 'This coaster type cannot go upside down';
  if (c.pieces && !c.pieces.includes(pieceKey)) return `A ${rdef.name} cannot use that piece`;
  if (ride.closedLoop) return 'The circuit is already complete';
  if (def.station && ride.pieces.length && ride.pieces[ride.pieces.length - 1].type !== 'station') return 'Station pieces must be together';
  if (!def.station && !ride.pieces.length) return 'Start with a station';
  const piece: TrackPiece = { type: pieceKey, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: false, bank: 0 };
  const tiles = pieceTiles(piece);
  const end = pieceEnd(piece);
  if (end.z < 0) return 'Track would go below ground';
  for (const [x, y] of tiles) {
    const t = tileAt(g, x, y); if (!t) return 'Off the edge of the map';
    if (!t.owned) return 'Land not owned by the park';
    if (t.rideId !== null || t.entrance) return 'A ride is in the way';
    if (t.scenery && at.z < t.h + 4) return 'Scenery is in the way';
    const ground = t.water ? t.h + LAND_STEP : t.h;
    const low = Math.min(at.z, end.z);
    if (low < ground) return 'Track would go underground';
    if (t.path && low < ground + 4) return 'Not enough room over the path';
    if (at.z - t.h > c.maxHeight) return `Too high for this coaster (max ${c.maxHeight} units)`;
    for (const tr of t.tracks) {
      const other = tr.rideId === ride.id ? ride : rideById(g, tr.rideId); const op = other?.pieces[tr.piece]; if (!op) continue;
      const oz = op.z; const odef = PIECE_BY_KEY[op.type];
      const top = oz + Math.max(odef.dz, 0) + odef.clearance, bot = oz + Math.min(odef.dz, 0);
      const mytop = at.z + Math.max(def.dz, 0) + def.clearance, mybot = low;
      if (!(mybot >= top || mytop <= bot)) {
        // allowed only when closing the loop onto the first station piece
        const first = ride.pieces[0];
        if (!(tr.rideId === ride.id && tr.piece === 0 && end.x === first.x && end.y === first.y && end.z === first.z && end.dir === first.dir)) return 'Track is in the way';
      }
    }
  }
  return null;
}
export function cmdAddPiece(g: GameState, rideId: number, pieceKey: string, chain: boolean, bank: -1 | 0 | 1): CmdResult {
  const ride = rideById(g, rideId); if (!ride) return fail('No such ride');
  const at = coasterCursor(g, ride) ?? { x: ride.x, y: ride.y, z: tileAt(g, ride.x, ride.y)!.h + 2, dir: ride.rot };
  const why = checkPiece(g, ride, pieceKey, at); if (why) return fail(why);
  const cost = pieceCost(ride, pieceKey); if (!canAfford(g, cost)) return fail('Not enough cash');
  const def = PIECE_BY_KEY[pieceKey];
  const piece: TrackPiece = { type: pieceKey, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: chain && !!def.chainable, bank: def.bankable ? bank : 0 };
  const idx = ride.pieces.length; ride.pieces.push(piece);
  for (const [x, y] of pieceTiles(piece)) tileAt(g, x, y)!.tracks.push({ rideId, piece: idx });
  spend(g, cost, Cat.RideConstruction);
  // closed loop?
  const end = pieceEnd(piece); const first = ride.pieces[0];
  ride.closedLoop = idx > 2 && end.x === first.x && end.y === first.y && end.z === first.z && end.dir === first.dir;
  ride.stats = null; ride.ratings = null; ride.status = 'closed';
  pushUndo('track piece', () => { removeLastPiece(g, ride); earn(g, cost, Cat.RideConstruction); });
  return { ok: true, cost };
}
function removeLastPiece(g: GameState, ride: Ride) {
  const idx = ride.pieces.length - 1; if (idx < 0) return; const piece = ride.pieces[idx];
  for (const [x, y] of pieceTiles(piece)) { const t = tileAt(g, x, y); if (t) t.tracks = t.tracks.filter(tr => !(tr.rideId === ride.id && tr.piece === idx)); }
  ride.pieces.pop(); ride.closedLoop = false; ride.stats = null; ride.ratings = null; ride.status = 'closed'; ride.trains = [];
}
export function cmdRemovePiece(g: GameState, rideId: number): CmdResult {
  const ride = rideById(g, rideId); if (!ride || !ride.pieces.length) return fail('Nothing to remove');
  const piece = ride.pieces[ride.pieces.length - 1]; const refund = Math.floor(pieceCost(ride, piece.type) * 0.7);
  const copy = { ...piece }; removeLastPiece(g, ride); earn(g, refund, Cat.RideConstruction);
  pushUndo('remove piece', () => { const idx = ride.pieces.length; ride.pieces.push(copy); for (const [x, y] of pieceTiles(copy)) tileAt(g, x, y)!.tracks.push({ rideId, piece: idx }); spend(g, refund, Cat.RideConstruction); });
  return { ok: true, cost: -refund };
}
/** Start a new coaster: the first station piece goes at (x,y) heading dir. */
export function cmdStartCoaster(g: GameState, typeKey: string, x: number, y: number, dir: Dir): CmdResult {
  const def = RIDE_BY_KEY[typeKey]; if (!def?.coaster) return fail('Not a coaster');
  if (!g.research.invented.includes(typeKey)) return fail('Not yet researched');
  const t = tileAt(g, x, y); if (!t) return fail('Off the map');
  if (!t.owned) return fail('You do not own this land'); if (t.water || t.path || t.rideId !== null || t.entrance || t.scenery) return fail('Something is in the way');
  if (!canAfford(g, def.cost)) return fail('Not enough cash');
  const ride = blankRide(g, typeKey, x, y, dir); g.rides.push(ride); spend(g, def.cost, Cat.RideConstruction);
  const r = cmdAddPiece(g, ride.id, 'station', false, 0);
  if (!r.ok) { g.rides.pop(); earn(g, def.cost, Cat.RideConstruction); return r; }
  undoStack.pop(); // the piece's own undo entry; one entry for the whole start instead
  pushUndo('new coaster', () => { removeRideFromMap(g, ride); g.rides = g.rides.filter(x => x !== ride); earn(g, def.cost + pieceCost(ride, 'station'), Cat.RideConstruction); });
  return { ok: true, cost: def.cost };
}
export { turnDir, inBounds, rand };
