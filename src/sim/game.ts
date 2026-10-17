// Game state creation, the tick, and every build command (each one undoable).
import { DX, DY, LAND_STEP, MONTH_TICKS, WEEK_TICKS, FORTNIGHT_TICKS, DAYS_IN_MONTH, Surface, clamp, key, type Dir, type GameState, type Ride, type Tile, type TrackPiece, type NewsItem, type PathTile } from './types';
import { rand, randInt } from './rng';
import { generateMap, shapeMap, tileAt, footprintFree, inBounds, corners, landTop, isFlatLand, pathsNearLand, slopeOf, setCorners, waterZ, setWater, pathAt, pathLink, edgeZ, CORNER_OFF, PATH_CLEAR, type MapShape, type Corners } from './map';
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
import { weeklyEvent, applyEvent } from './events';
import { rideById } from './runtime';

export interface NewParkOptions { name: string; size: 'small' | 'medium' | 'large'; cash: number; loan: number; maxLoan: number; difficulty: 'easy' | 'normal' | 'hard'; sandbox: boolean; seed?: number; goalMinutes?: number /* 0 or absent = free play */; tempo?: number /* TEMPOS index */; terrain?: { hills: number; water: number; trees: number }; shape?: MapShape; }
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
  generateMap(g, { w: n, h: n, hills: o.difficulty === 'easy' ? 0.5 : 0.8, water: o.difficulty === 'hard' ? 0.9 : 0.6, trees: 1, ...o.terrain }); if (o.shape) shapeMap(g, o.shape);
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
  updateWeather(g); applyEvent(g, (icon, text) => news(g, icon, text));
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
  weeklyInterest(g); weeklyResearchCost(g); updateMarketing(g); weeklyEvent(g, (icon, text, subject) => news(g, icon, text, subject));
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

// ---------- land: RCT's land tool ----------
/** What may not move with the land: a ride, a hut or a big piece standing on it. Paths and track stay where they are
 *  (they become bridges or tunnels); trees and small pieces ride on the land. */
const landLocked = (t: Tile) => t.rideId !== null || !!t.entrance || (!!t.scenery && sizeOf(t.scenery.kind) > 1);
export const LAND_COST = 2000;
/** Raise (dir 1) or lower (-1) land, RCT's way. A tile: a flat tile moves a whole step, a sloped one flattens to its top
 *  (raising) or its bottom (lowering). A corner (0..3, see map.ts CORNER_OFF): just that corner. Smooth (the default):
 *  the land round it slopes away one step a tile instead of leaving a cliff, as far as it has to; cliffs = only the
 *  chosen tiles move. Paths and track keep their height. */
export function cmdLand(g: GameState, x: number, y: number, dir: 1 | -1, brush = 1, opts: { corner?: number; cliffs?: boolean } = {}): CmdResult {
  const sel: Tile[] = []; for (let yy = y; yy < y + brush; yy++) for (let xx = x; xx < x + brush; xx++) { const t = tileAt(g, xx, yy); if (t) sel.push(t); }
  if (!sel.length) return fail('Off the map');
  for (const t of sel) { if (!t.owned) return fail('You do not own this land'); if (landLocked(t)) return fail('Clear the tile first'); }
  // the corner points being moved and where they go (points are on the (w+1) × (h+1) grid)
  const W = g.w + 1; const target = new Map<number, number>();
  const put = (px: number, py: number, v: number) => { const i = py * W + px; const old = target.get(i); target.set(i, old === undefined ? v : dir > 0 ? Math.max(old, v) : Math.min(old, v)); };
  for (let yy = y; yy < y + brush; yy++) for (let xx = x; xx < x + brush; xx++) {
    const t = tileAt(g, xx, yy); if (!t) continue; const c = corners(t);
    if (opts.corner !== undefined && brush === 1) { const [ox, oy] = CORNER_OFF[opts.corner]; put(xx + ox, yy + oy, c[opts.corner] + dir * LAND_STEP); continue; }
    const lo = Math.min(...c), hi = Math.max(...c); const to = lo === hi ? lo + dir * LAND_STEP : dir > 0 ? hi : lo;
    CORNER_OFF.forEach(([ox, oy]) => put(xx + ox, yy + oy, to));
  }
  for (const v of target.values()) if (v < 0 || v > 14 * LAND_STEP) return fail(dir > 0 ? 'Too high' : 'Too low');
  // every tile touching a moved point: its corners as they are now
  const changed = new Map<number, Corners>();   // tile index → new corners
  const cornersOf = (tx: number, ty: number): Corners => { const k = ty * g.w + tx; return changed.get(k) ?? corners(g.tiles[k]); };
  const setPoint = (px: number, py: number, v: number, onlyTiles?: Set<number>) => {
    for (let i = 0; i < 4; i++) { const tx = px - CORNER_OFF[i][0], ty = py - CORNER_OFF[i][1]; if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) continue; const k = ty * g.w + tx; if (onlyTiles && !onlyTiles.has(k)) continue;
      const c = [...cornersOf(tx, ty)] as Corners; const nv = dir > 0 ? Math.max(c[i], v) : Math.min(c[i], v); if (c[i] === nv) continue; c[i] = nv; changed.set(k, c); }   // raising only lifts, lowering only drops
  };
  const selSet = new Set<number>(); for (let yy = y; yy < y + brush; yy++) for (let xx = x; xx < x + brush; xx++) if (tileAt(g, xx, yy)) selSet.add(yy * g.w + xx);
  for (const [i, v] of target) setPoint(i % W, (i - (i % W)) / W, v, opts.cliffs ? selSet : undefined);
  if (!opts.cliffs) {
    // smooth: walk outward, moving each neighbouring corner just enough that no two corners of a tile are more than one
    // step apart (a hill slopes down one step a tile; a pit slopes up). Points already moved are not moved back.
    const queue = [...target.keys()]; const seen = new Set(queue);
    for (let qi = 0; qi < queue.length && qi < 20000; qi++) {
      const i = queue[qi], px = i % W, py = (i - px) / W; const v = pointHeight(px, py);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx > g.w || qy > g.h) continue;
        // only neighbours across a tile (same tile corner pairs)
        for (const [tx, ty] of tilesBetween(px, py, qx, qy)) {
          const c = cornersOf(tx, ty); const ci = cornerIndex(tx, ty, qx, qy); const u = c[ci];
          const want = dir > 0 ? Math.max(u, v - LAND_STEP) : Math.min(u, v + LAND_STEP); if (want === u) continue;
          setPoint(qx, qy, want); const j = qy * W + qx; if (!seen.has(j)) { seen.add(j); queue.push(j); }
        }
      }
    }
    function pointHeight(px: number, py: number): number { let v = dir > 0 ? -Infinity : Infinity; for (let i = 0; i < 4; i++) { const tx = px - CORNER_OFF[i][0], ty = py - CORNER_OFF[i][1]; if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) continue; const h = cornersOf(tx, ty)[i]; v = dir > 0 ? Math.max(v, h) : Math.min(v, h); } return v; }
  }
  // check, price, apply
  let cost = 0; const before: { k: number; t: Tile }[] = [];
  for (const [k, c] of changed) {
    const t = g.tiles[k]; if (!slopeOf(c)) return fail('The land cannot slope like that');
    if (landLocked(t)) return fail('Something is in the way of the slope'); if (!t.owned) return fail('The slope would reach land the park does not own');
    cost += LAND_COST;
  }
  if (!changed.size) return fail(dir > 0 ? 'Too high' : 'Too low');
  if (!canAfford(g, cost)) return fail('Not enough cash');
  for (const [k, c] of changed) { const t = g.tiles[k]; before.push({ k, t: snapshotTile(t) }); const wz = waterZ(t); setCorners(t, c); setWater(t, wz); }   // the ground keeps its type, as in RCT (no more rock on high land)
  spend(g, cost, Cat.Landscaping);
  pushUndo('land', () => { for (const b of before) g.tiles[b.k] = b.t; earn(g, cost, Cat.Landscaping); });
  return { ok: true, cost };
}
/** The tiles that have both points (px,py) and (qx,qy) as corners (1 for a diagonal, 2 for a shared edge). */
function tilesBetween(px: number, py: number, qx: number, qy: number): [number, number][] {
  const out: [number, number][] = []; const x0 = Math.min(px, qx), y0 = Math.min(py, qy);
  if (px !== qx && py !== qy) { out.push([x0, y0]); return out; }
  if (px === qx) { out.push([px - 1, y0], [px, y0]); } else { out.push([x0, py - 1], [x0, py]); }
  return out;
}
const cornerIndex = (tx: number, ty: number, px: number, py: number) => CORNER_OFF.findIndex(([ox, oy]) => tx + ox === px && ty + oy === py);
/** Raise (1) or lower (-1) the water over an area, a step at a time: dry land gets water one step above its highest
 *  corner; water lowered to the land's lowest corner drains away. Nothing that would end up under water may stand there. */
export function cmdWater(g: GameState, x: number, y: number, dir: 1 | -1 = 1, brush = 1): CmdResult {
  const sel: { x: number; y: number; t: Tile; wz: number | null }[] = [];
  for (let yy = y; yy < y + brush; yy++) for (let xx = x; xx < x + brush; xx++) {
    const t = tileAt(g, xx, yy); if (!t) continue; if (!t.owned) return fail('You do not own this land');
    const cur = waterZ(t); const wz = cur === null ? (dir > 0 ? landTop(t) + LAND_STEP : null) : cur + dir * LAND_STEP;
    if (wz !== null && wz > 16 * LAND_STEP) return fail('Too high');
    if (wz !== null && wz > t.h && (t.rideId !== null || t.entrance || t.paths.some(p => p.z < wz) || (t.scenery && sizeOf(t.scenery.kind) > 1))) return fail('Something would be under water');
    sel.push({ x: xx, y: yy, t, wz: wz !== null && wz > t.h ? wz : null });
  }
  if (dir < 0 && sel.every(s => waterZ(s.t) === null)) return fail('There is no water here');
  const cost = 2500 * sel.length; if (!canAfford(g, cost)) return fail('Not enough cash');
  const before = sel.map(s => ({ k: s.y * g.w + s.x, t: snapshotTile(s.t) }));
  for (const s of sel) { setWater(s.t, s.wz); if (s.t.water && s.t.scenery && !SCENERY_BY_KEY[s.t.scenery.kind]?.waterable && landTop(s.t) < s.t.wz!) s.t.scenery = null; }
  spend(g, cost, Cat.Landscaping);
  pushUndo('water', () => { for (const b of before) g.tiles[b.k] = b.t; earn(g, cost, Cat.Landscaping); });
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

// ---------- paths: on the land, on bridges, in tunnels ----------
export const PATH_COST = 1000, QUEUE_COST = 1500;
/** What else occupies height on a tile, [bottom, top] in height units (rides, huts, big pieces, track, other paths). */
function occupied(g: GameState, t: Tile, skip?: PathTile): [number, number][] {
  const out: [number, number][] = []; const top = landTop(t);
  if (t.rideId !== null) { const r = g.rides.find(q => q.id === t.rideId); out.push([t.h, top + (r ? RIDE_BY_KEY[r.type].height * 2 : 8)]); }
  if (t.entrance) out.push([t.h, top + 6]);
  if (t.scenery && sizeOf(t.scenery.kind) > 1) out.push([t.h, top + 8]);
  for (const tr of t.tracks) { const r = g.rides.find(q => q.id === tr.rideId); const p = r?.pieces[tr.piece]; if (!p) continue; const d = PIECE_BY_KEY[p.type]; out.push([p.z + Math.min(d.dz, 0), p.z + Math.max(d.dz, 0) + d.clearance]); }
  for (const p of t.paths) if (p !== skip) out.push([p.z, p.z + PATH_CLEAR + (p.slope === -1 ? 0 : LAND_STEP)]);
  return out;
}
/** Where a path laid on the land goes: on a ramp where the land rises along one side, flat on level land, and flat at
 *  the top of any other slope (RCT does the same). */
export function pathOnLand(t: Tile): { z: number; slope: Dir | -1 } {
  const c = corners(t); const lo = Math.min(...c), hi = Math.max(...c); if (lo === hi) return { z: lo, slope: -1 };
  // a side up: the two corners on one side raised, nothing steep
  if (hi - lo === LAND_STEP && c.filter(v => v === hi).length === 2) for (let d = 0 as Dir; d < 4; d++) {
    const side = SIDE_CORNERS[d]; if (c[side[0]] === hi && c[side[1]] === hi) return { z: lo, slope: d };
  }
  return { z: hi, slope: -1 };
}
/** The two corners on each side: east (+x) = 1, 2; south (+y) = 2, 3; west = 3, 0; north = 0, 1. */
const SIDE_CORNERS: [number, number][] = [[1, 2], [2, 3], [3, 0], [0, 1]];
/** Lay a path. On the land by default (it follows a ramp where the land rises along a side, and ramps up to a path one
 *  step higher next door); with `at`, at that height and slope: a bridge above the land or a tunnel through it. A tile
 *  can hold several paths at different heights when there is room between them. */
export function cmdPath(g: GameState, x: number, y: number, queue: boolean, style = 0, at?: { z: number; slope: Dir | -1 }): CmdResult {
  const t = tileAt(g, x, y); if (!t) return fail('Off the map');
  if (!t.owned) return fail('You do not own this land');
  let { z, slope } = at ?? pathOnLand(t);
  if (!at) {
    if (t.water) return fail('Cannot build a path on water: build a bridge');
    if (t.rideId !== null || t.entrance) return fail('A ride is in the way');
    if (t.scenery && sizeOf(t.scenery.kind) > 1) return fail('Remove the ' + (SCENERY_BY_KEY[t.scenery.kind]?.name.toLowerCase() ?? 'piece') + ' first');
    // flat land: a ramp up to a path one step higher next door (when nothing at this level joins), as before
    if (slope === -1 && !queue && isFlatLand(t)) {
      const same: number[] = [], higher: number[] = [];
      for (let d = 0; d < 4; d++) { const n = tileAt(g, x + DX[d], y + DY[d]); for (const q of n?.paths ?? []) { if (q.queue) continue; if (edgeZ(q, ((d + 2) & 3) as Dir) === z) same.push(d); if (edgeZ(q, ((d + 2) & 3) as Dir) === z + LAND_STEP) higher.push(d); } }
      if (same.length === 0 && higher.length === 1) slope = higher[0] as Dir;
      else if (same.length === 1 && higher.length === 1 && ((same[0] + 2) & 3) === higher[0]) slope = higher[0] as Dir;
    }
  } else {
    const wz = waterZ(t); if (wz !== null && z < wz) return fail('A path cannot go under water');
    if (t.scenery && sizeOf(t.scenery.kind) === 1 && z < landTop(t) + 6 && z >= t.h - PATH_CLEAR) return fail('Scenery is in the way');
  }
  if (z < 0) return fail('Too low'); if (z > 40 * LAND_STEP) return fail('Too high');
  const existing = pathAt(t, z);
  if (existing && existing.queue === queue && existing.style === style && existing.slope === slope) return fail('There is already a path here');
  const top = z + PATH_CLEAR + (slope === -1 ? 0 : LAND_STEP);
  for (const [lo, hi] of occupied(g, t, existing ?? undefined)) if (z < hi && top > lo) return fail(t.paths.some(p => p !== existing && p.z < hi && p.z >= lo) ? 'Another path is in the way' : 'Something is in the way');
  const cost = queue ? QUEUE_COST : PATH_COST; if (!canAfford(g, cost)) return fail('Not enough cash');
  const before = snapshotTile(t);
  const p: PathTile = { z, queue, rideId: null, style, slope, adds: existing?.adds ?? {} };
  t.paths = [...t.paths.filter(q => q !== existing), p].sort((a, b) => a.z - b.z); if (!at) t.scenery = null;
  // a path half in the land (too shallow to be a tunnel) cuts the land down to its level, which leaves a wall where a
  // tunnel starts next door, as RCT players dig before they tunnel
  if (at && landTop(t) > z + (slope === -1 ? 0 : LAND_STEP) && t.h < z + PATH_CLEAR && !t.water) {
    const c = corners(t).map((v, i) => { const [ox, oy] = CORNER_OFF[i]; const up = slope === -1 ? 0 : (slope === 0 ? ox : slope === 1 ? oy : slope === 2 ? 1 - ox : 1 - oy) * LAND_STEP; return Math.min(v, z + up); }) as Corners;
    if (slopeOf(c) !== null) setCorners(t, c); else setCorners(t, [z, z, z, z]);
    if (t.scenery && sizeOf(t.scenery.kind) === 1) t.scenery = null;
  }
  // the other way round: a flat path one step LOWER next door becomes a ramp up to this one (when that does not break a junction)
  const touched: { x: number; y: number; before: Tile }[] = [];
  if (!at && !queue && slope === -1) for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d]; const n = tileAt(g, nx, ny); const q = n?.paths.find(o => !o.queue && o.slope === -1 && o.z === z - LAND_STEP); if (!n || !q) continue;
    const toward = ((d + 2) & 3) as Dir;   // direction from the neighbour towards this tile
    let sideLinks = false; for (let dd = 0; dd < 4; dd++) { if (dd === toward || dd === d) continue; if (pathLink(g, nx, ny, q, dd as Dir)) sideLinks = true; }
    if (sideLinks) continue;
    touched.push({ x: nx, y: ny, before: snapshotTile(n) }); q.slope = toward;
  }
  spend(g, cost, Cat.RideConstruction);
  pushUndo('path', () => { g.tiles[y * g.w + x] = before; for (const c of touched) g.tiles[c.y * g.w + c.x] = c.before; earn(g, cost, Cat.RideConstruction); });
  return { ok: true, cost };
}
/** The path on a tile a tool means: the one at height z, or the top one (what is seen from above). */
export const pathFor = (t: Tile | null, z?: number): PathTile | null => (!t || !t.paths.length ? null : z !== undefined ? pathAt(t, z) : t.paths[t.paths.length - 1]);
export function cmdRemovePath(g: GameState, x: number, y: number, z?: number): CmdResult {
  const t = tileAt(g, x, y); const p = pathFor(t, z); if (!t || !p) return fail('No path here');
  if (!t.owned) return fail('You do not own this land');
  const before = snapshotTile(t); t.paths = t.paths.filter(q => q !== p); if (!t.paths.length) { t.litter = 0; t.vomit = 0; }
  for (const gu of g.guests) if (gu.tx === x && gu.ty === y) gu.route = null;
  pushUndo('remove path', () => { g.tiles[y * g.w + x] = before; });
  return { ok: true, cost: 0 };
}
export function cmdPathAdd(g: GameState, x: number, y: number, what: 'bench' | 'lamp' | 'bin', z?: number): CmdResult {
  const t = tileAt(g, x, y); const p = pathFor(t, z); if (!t || !p) return fail('Needs a path');
  if (p.queue && what !== 'lamp') return fail('Only lamps fit on a queue');
  if (p.slope !== -1) return fail('Not on a slope');
  const cost = what === 'bench' ? 1500 : what === 'lamp' ? 700 : 900; if (!canAfford(g, cost)) return fail('Not enough cash');
  const before = { ...p.adds };
  if (what === 'bin') p.adds.bin = 0; else p.adds[what] = true; p.broken = false;
  spend(g, cost, Cat.RideConstruction);
  pushUndo('path item', () => { p.adds = before; earn(g, cost, Cat.RideConstruction); });
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
    if (t.water || pathsNearLand(t) || t.rideId !== null || t.entrance || t.tracks.length) return fail('Something is in the way');
    if (n > 1 && !isFlatLand(t)) return fail(`The ${def.name.toLowerCase()} needs level ground (${n}×${n})`);
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
  if (t.water || pathsNearLand(t) || t.rideId !== null || t.entrance || t.tracks.length || t.scenery) return fail('Something is in the way');
  if (!isFlatLand(t)) return fail('Land must be flat here');
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
    const low = Math.min(at.z, end.z), high = at.z + Math.max(def.dz, 0) + def.clearance;
    if (t.scenery && low < landTop(t) + 4 && high > t.h) return 'Scenery is in the way';   // under the ground (a tunnel) is fine
    const wz = waterZ(t); if (wz !== null && low < wz) return 'Track would go under water';
    for (const p of t.paths) if (low < p.z + PATH_CLEAR + (p.slope === -1 ? 0 : LAND_STEP) && high > p.z) return 'A path is in the way';
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
  const at = coasterCursor(g, ride) ?? { x: ride.x, y: ride.y, z: landTop(tileAt(g, ride.x, ride.y)!) + 2, dir: ride.rot };
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
  if (!t.owned) return fail('You do not own this land'); if (t.water || pathsNearLand(t) || t.rideId !== null || t.entrance || t.scenery) return fail('Something is in the way');
  if (!canAfford(g, def.cost)) return fail('Not enough cash');
  const ride = blankRide(g, typeKey, x, y, dir); g.rides.push(ride); spend(g, def.cost, Cat.RideConstruction);
  const r = cmdAddPiece(g, ride.id, 'station', false, 0);
  if (!r.ok) { g.rides.pop(); earn(g, def.cost, Cat.RideConstruction); return r; }
  undoStack.pop(); // the piece's own undo entry; one entry for the whole start instead
  pushUndo('new coaster', () => { removeRideFromMap(g, ride); g.rides = g.rides.filter(x => x !== ride); earn(g, def.cost + pieceCost(ride, 'station'), Cat.RideConstruction); });
  return { ok: true, cost: def.cost };
}
export { turnDir, inBounds, rand };
