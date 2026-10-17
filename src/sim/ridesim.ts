// Ride operation: coaster physics and tests, ratings, flat-ride cycles, breakdowns, trains.
import { LAND_STEP, TILE_M, UNIT_M, clamp, type GameState, type Ride, type RideStats, type Ratings, type Train } from './types';
import { RIDE_BY_KEY, BREAKDOWN_WEIGHTS } from './rides';
import { PIECE_BY_KEY, pieceTiles, pointAt } from './track';
import { tileAt } from './map';
import { sceneryAround, THEME_RIDES, THEME_RADIUS, THEME_MIN, THEME_LIFT } from './scenery';
import { rand, randInt } from './rng';
import { Cat, earn } from './finance';
import { news } from './game';
import { guestById } from './runtime';

const G = 9.81;
/** Where each piece starts along the track (metres) and the whole length, kept until the track changes. */
const TABLES = new WeakMap<Ride, { pieces: Ride['pieces']; n: number; at: number[]; total: number }>();
function table(r: Ride) {
  let t = TABLES.get(r); if (t && t.pieces === r.pieces && t.n === r.pieces.length) return t;
  const at: number[] = []; let s = 0; for (const p of r.pieces) { at.push(s); s += PIECE_BY_KEY[p.type].length; }
  TABLES.set(r, t = { pieces: r.pieces, n: r.pieces.length, at, total: s }); return t;
}
export const pieceLen = (r: Ride) => table(r).total;

// ---------- open / close / test ----------
export function openRide(g: GameState, r: Ride): string | null {
  const def = RIDE_BY_KEY[r.type];
  if (def.kind !== 'stall' && (!r.entrance || !r.exit)) return 'The ride needs an entrance and an exit first';
  if (def.kind === 'coaster') { if (!r.closedLoop) return 'The track is not a complete circuit'; if (!r.stats) return 'Test the ride first'; if (!r.stats.completed) return 'The test failed: ' + r.stats.failReason; }
  if (r.breakdown) return 'Fix the breakdown first';
  r.status = 'open'; if (def.kind === 'coaster') setupTrains(g, r); r.running = def.kind === 'flat';
  return null;
}
export function closeRide(_g: GameState, r: Ride) {
  r.status = 'closed'; r.running = false; r.riders = []; r.cycle = 0;
  for (const t of r.trains) { t.riders = []; t.state = 'station'; t.pos = 0; t.v = 0; }
  r.queue = [];
}
export function testRide(g: GameState, r: Ride): string | null {
  const def = RIDE_BY_KEY[r.type]; if (def.kind !== 'coaster') { r.status = 'testing'; r.running = true; return null; }
  if (!r.closedLoop) return 'The track is not a complete circuit';
  r.stats = simulateTest(g, r); r.ratings = r.stats.completed ? computeCoasterRatings(g, r, r.stats) : null;
  r.status = 'testing'; setupTrains(g, r); r.value = computeRideValue(g, r);
  return null;
}
export function rideTestSummary(r: Ride): string { const s = r.stats; if (!s) return 'Not tested'; return s.completed ? `Max ${Math.round(s.maxSpeed * 2.237)} mph, ${s.drops} drops` : s.failReason ?? 'Failed'; }

function setupTrains(g: GameState, r: Ride) {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const n = clamp(r.numTrains, 1, 4); const cars = clamp(r.carsPerTrain || c.cars, 1, 8);
  const stationLen = r.pieces.filter(p => p.type === 'station').length * TILE_M;
  r.trains = []; for (let i = 0; i < n; i++) r.trains.push({ cars, pos: stationLen - 1 - i * 1e6, v: 0, state: 'station', wait: i * 300, riders: [], lapStart: g.tick, maxV: 0 });
  // trains beyond the first start spaced around the loop
  const total = pieceLen(r); for (let i = 1; i < n; i++) { r.trains[i].pos = ((stationLen - 1 - (total / n) * i) % total + total) % total; r.trains[i].state = 'running'; r.trains[i].v = 3; }
}

// ---------- physics ----------
interface Probe { s: number; z: number; slope: number; piece: number; }
/** Advance a train one tick along the track. Returns false if the train stalls (cannot make it up a hill). */
function stepTrain(g: GameState, r: Ride, t: Train, sampleG?: (p: Probe, v: number, vertG: number, latG: number) => void): boolean {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const dt = 1 / 40; const total = pieceLen(r);
  const here = probe(r, t.pos); const ahead = probe(r, t.pos + 1.0);
  const pdef = PIECE_BY_KEY[r.pieces[here.piece].type]; const piece = r.pieces[here.piece];
  let a = -G * Math.sin(here.slope);                            // gravity along the track
  a -= c.friction * t.v * Math.abs(t.v) * 0.08 + 0.15 * Math.sign(t.v) * (Math.abs(t.v) > 0.05 ? 1 : 0);   // drag + rolling friction
  if (pdef.loop) a -= 0.6 * Math.sign(t.v);
  let v = t.v + a * dt;
  if (piece.chain || pdef.station) { if (v < c.liftSpeed) v = c.liftSpeed; }
  if (pdef.brakes && v > 7) v = Math.max(7, v - 12 * dt);
  if (pdef.booster) v = Math.max(v, 16);
  if (v < 0.05 && !piece.chain && !pdef.station && !pdef.booster) { if (here.slope > 0.05) return false; v = 0.05; }
  // G forces: vertical = cos(slope) + v² × curvature; lateral from turn radius
  const kappa = (ahead.slope - here.slope) / 1.0; const vertG = clamp(Math.cos(here.slope) + (v * v * kappa) / G, -3, 6);
  const latG = pdef.turn ? (v * v) / ((pdef.radius + 0.75) * TILE_M * G) * (piece.bank ? 0.35 : 1) : 0;   // effective radius: the car's path is wider than the centre line
  sampleG?.(here, v, vertG, latG);
  t.v = v; t.pos += v * dt; t.maxV = Math.max(t.maxV, v);
  if (t.pos >= total) t.pos -= total;
  return true;
}
function probe(r: Ride, s: number): Probe {
  const tb = table(r), total = tb.total; s = ((s % total) + total) % total;
  let lo = 0, hi = tb.at.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tb.at[mid] < s) lo = mid; else hi = mid - 1; }   // the last piece starting before s
  const i = lo; s -= tb.at[i];
  const p = pointAt(r.pieces[i], s); return { s, z: p.z, slope: p.slope, piece: i };
}
/** Run a test train round the circuit and measure everything the ratings need. */
export function simulateTest(g: GameState, r: Ride): RideStats {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const total = pieceLen(r);
  const t: Train = { cars: c.cars, pos: 0, v: 0, state: 'running', wait: 0, riders: [], lapStart: 0, maxV: 0 };
  const st: RideStats = { length: total, maxSpeed: 0, avgSpeed: 0, duration: 0, drops: 0, highestDrop: 0, maxPosG: 1, maxNegG: 1, maxLatG: 0, airTime: 0, inversions: r.pieces.filter(p => PIECE_BY_KEY[p.type].loop).length, turns: r.pieces.filter(p => PIECE_BY_KEY[p.type].turn !== 0 && !p.bank).length, bankedTurns: r.pieces.filter(p => PIECE_BY_KEY[p.type].turn !== 0 && p.bank).length, sheltered: 0, completed: false };
  let ticks = 0, sumV = 0, lastZ = probe(r, 0).z, climbing = false, crest = 0, lapDone = false;
  const maxTicks = 40 * 60 * 6;   // 6 minutes of ride time at most
  while (ticks < maxTicks) {
    const ok = stepTrain(g, r, t, (p, v, vg, lg) => { st.maxPosG = Math.max(st.maxPosG, vg); st.maxNegG = Math.min(st.maxNegG, vg); st.maxLatG = Math.max(st.maxLatG, lg); if (vg < 0) st.airTime++; sumV += v;
      if (p.z > lastZ + 0.004) { if (!climbing) { climbing = true; } crest = Math.max(crest, p.z); } else if (p.z < lastZ - 0.004) { if (climbing) { climbing = false; st.drops++; const drop = crest - p.z; st.highestDrop = Math.max(st.highestDrop, drop); crest = p.z; } else { st.highestDrop = Math.max(st.highestDrop, Math.max(crest, lastZ) - p.z); } } lastZ = p.z; });
    if (!ok) { st.failReason = 'The train cannot get over the hill at piece ' + (probe(r, t.pos).piece + 1) + '. Add a chain lift or lower it.'; st.duration = ticks; return st; }
    ticks++;
    if (ticks > 40 && t.pos < 1.5 && t.v > 0 && !lapDone) { lapDone = true; break; }
  }
  if (!lapDone) { st.failReason = 'The train never got back to the station.'; st.duration = ticks; return st; }
  st.maxSpeed = t.maxV; st.avgSpeed = sumV / ticks; st.duration = ticks; st.completed = true;
  // the highest drop also needs to count the first descent after the lift
  st.highestDrop = Math.max(st.highestDrop, Math.round(st.highestDrop));
  if (st.maxSpeed > 40) { st.failReason = 'Too fast: the train would derail.'; st.completed = false; }
  return st;
}

// ---------- ratings (in hundredths) ----------
export function computeCoasterRatings(g: GameState, r: Ride, s: RideStats): Ratings {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const base = def.base!;
  let e = base.e, i = base.i, n = base.n;
  // length, speed, duration
  e += Math.min(s.length, 1800) * 0.0873 * 1.2;
  const ms = s.maxSpeed; e += ms * 2.7; i += ms * 5.4; n += ms * 2.2;
  e += s.avgSpeed * 1.4; i += s.avgSpeed * 2.5;
  e += Math.min(s.duration, 6000) * 0.0045;
  e += (c.cars - 1) * 2.9;
  // G forces (the original's weights: +G e .08 i .8 n .26; lateral e .4 i 1 n .33)
  const pg = s.maxPosG, ng = s.maxNegG, lg = s.maxLatG;
  e += pg * 8; i += pg * 80; n += pg * 26;
  e += clamp(ng, -2.5, 0) * -24; i += (ng - 1) * -80; n += (ng - 1) * -22;
  e += Math.min(1.5, lg) * 40; i += lg * 100; n += lg * 33;
  // turns, drops, inversions, air time
  e += Math.min(s.turns, 8) * 2.5 + Math.min(s.bankedTurns, 8) * 3.75; i += (s.turns + s.bankedTurns) * 1.25; n += (s.turns + s.bankedTurns) * 5;
  e += Math.min(9, s.drops) * 11.1; i += Math.min(12, s.drops) * 14.2; n += Math.min(12, s.drops) * 10;
  e += s.highestDrop * 2 * 0.49 * 2; i += s.highestDrop * 2 * 0.98; n += s.highestDrop * 2 * 0.63;
  e += Math.min(6, s.inversions) * 26.7; i += s.inversions * 50; n += s.inversions * 21.7;
  e += Math.min(s.airTime, 200) / 8; n += s.airTime / 16;
  // scenery near the station (within 5 tiles), each piece counted once at its value
  const st = r.pieces[0]; const scen = sceneryAround(g, st.x, st.y, st.x, st.y, 5).value;
  e += Math.min(scen, 47) * 5 * 0.4;
  // requirement penalties
  const rq = c.requirements;
  if (s.length < rq.minLength) { e /= 2; i /= 2; n /= 2; }
  if (s.highestDrop < rq.minDrop && !s.inversions) { e /= 2; i /= 2; n /= 2; }
  if (s.maxSpeed < rq.minSpeed) { e /= 2; i /= 2; n /= 2; }
  if (s.drops < rq.minDrops && !s.inversions) { e /= 2; i /= 2; n /= 2; }
  if (rq.needNegG && s.maxNegG >= 0.1 && !s.inversions) { e /= 2; i /= 2; n /= 2; }   // wants at least a touch of air time
  // lateral G penalty: too much sideways force ruins the ride
  if (lg > 2.8) { i += 375; n += 200; } if (lg > 3.1) { i += 1225; n += 600; e = Math.max(0, e / 2 - 200); }
  if (pg > 5.5) { e *= 0.5; i += 300; n += 200; }
  // intensity penalty
  for (const th of [1000, 1100, 1200, 1320, 1450]) if (i >= th) e -= e / 4;
  return { e: Math.round(clamp(e, 0, 3000)), i: Math.round(clamp(i, 0, 3000)), n: Math.round(clamp(n, 0, 3000)) };
}

/** Ride value in cents, like the original: ratings × type multipliers, aged, docked for duplicates. */
export function computeRideValue(g: GameState, r: Ride): number {
  if (!r.ratings) return 0; const def = RIDE_BY_KEY[r.type]; const m = def.multipliers;
  let v = (r.ratings.e * m[0] + r.ratings.i * m[1] + r.ratings.n * m[2]) / 1024;
  const age = g.monthsElapsed - r.built;
  if (age < 5) v += 30; else if (age < 13) v += 10; else if (age < 40) v *= 1; else if (age < 64) v *= 0.75; else if (age < 88) v *= 9 / 16; else if (age < 104) v *= 27 / 64; else if (age < 120) v *= 81 / 256; else if (age < 128) v *= 81 / 512; else if (age < 200) v *= 81 / 1024; else v *= 9 / 16;
  if (g.rides.some(o => o !== r && o.type === r.type && o.status === 'open')) v -= v / 4;
  return Math.max(0, Math.round(v * 10));   // value 59 ⇒ $5.90 (cents = 590)
}

// ---------- per tick ----------
export function updateRides(g: GameState) {
  for (const r of g.rides) {
    const def = RIDE_BY_KEY[r.type];
    if (def.kind === 'coaster' && (r.status === 'open' || r.status === 'testing') && !r.breakdown) runTrains(g, r);
    if (def.kind === 'flat' && (r.status === 'open' || r.status === 'testing')) runFlat(g, r);
    if ((g.tick & 255) === 0 && def.kind !== 'stall') breakdownCheck(g, r);
    if ((g.tick & 2047) === 0) { inspectionCheck(g, r); if (def.kind === 'flat') r.ratings = flatRatings(g, r); }
    if (r.breakdown) { r.downHist++; }
    if ((g.tick & 8191) === 0) { r.downtime = Math.min(100, Math.round((r.downHist / 8192) * 100)); r.downHist = 0; }
    if ((g.tick + r.id * 37) % 12000 === 0) { r.recent.unshift(0); if (r.recent.length > 8) r.recent.length = 8; }
  }
}
function runTrains(g: GameState, r: Ride) {
  const total = pieceLen(r); if (total <= 0 || !r.trains.length) return;
  const stationLen = r.pieces.filter(p => p.type === 'station').length * TILE_M;
  for (const t of r.trains) {
    if (t.state === 'crashed') continue;
    if (t.state === 'station') {
      t.wait--; const capacity = t.cars * (RIDE_BY_KEY[r.type].coaster?.seats ?? 4);
      const full = t.riders.length >= capacity; const anyone = t.riders.length > 0;
      if (t.wait <= 0 && (r.status === 'testing' || full || (anyone && t.wait < -400) || t.wait < -1600)) {
        // only one train may leave while another is still in the station block
        t.state = 'running'; t.v = 2; t.lapStart = g.tick; if (r.status === 'open') { for (const id of t.riders) { const gu = guestById(g, id); if (gu) gu.state = 'riding'; } }
      }
      continue;
    }
    const before = t.pos;
    const ok = stepTrain(g, r, t);
    if (!ok) { // stalled on a hill: roll back to the station (counts as a failed lap)
      t.v = -1; }
    // arrived back at the station?
    if (t.state === 'running' && ((before > stationLen + 2 && (t.pos < stationLen - 1 || t.pos < before - total / 2)) || (t.pos < stationLen - 1 && g.tick - t.lapStart > 200))) {
      // another train in the station? queue behind it
      if (r.trains.some(o => o !== t && o.state === 'station')) { t.pos = Math.max(0, stationLen - 6); t.v = 0; continue; }
      t.state = 'station'; t.pos = stationLen - 1; t.v = 0; t.wait = 120;
      finishLap(g, r, t);
    }
  }
}
export function finishLap(g: GameState, r: Ride, t: Train) {
  r.customers += t.riders.length; r.recent[0] = (r.recent[0] || 0) + t.riders.length; g.stats.totalRidesTaken += t.riders.length;
  for (const id of t.riders) { const gu = guestById(g, id); if (gu) { gu.state = 'leavingRide' as any; } }
  t.riders = []; r.running = true;
}
function runFlat(g: GameState, r: Ride) {
  const def = RIDE_BY_KEY[r.type];
  if (r.running) { r.cycle++; if (r.cycle >= def.rideTicks) { r.running = false; r.cycle = 0; r.customers += r.riders.length; r.recent[0] = (r.recent[0] || 0) + r.riders.length; g.stats.totalRidesTaken += r.riders.length; for (const id of r.riders) { const gu = guestById(g, id); if (gu) gu.state = 'leavingRide' as any; } r.riders = []; } }
  else { r.cycle++; const full = r.riders.length >= def.capacity; if (r.status === 'testing' || full || (r.riders.length > 0 && r.cycle > 500) || r.cycle > 1800) { if (r.riders.length > 0 || r.status === 'testing') { r.running = true; r.cycle = 0; for (const id of r.riders) { const gu = guestById(g, id); if (gu) gu.state = 'riding'; } } else r.cycle = 0; } }
}

/** A flat ride's ratings: its type's, plus nearby scenery (each piece at its value), plus its theme when enough
 *  pieces of that theme stand round it (e.g. Space pieces round Space Rings). Refreshed every 2048 ticks. */
export function flatRatings(g: GameState, r: Ride): Ratings {
  const def = RIDE_BY_KEY[r.type]; const b = def.base!; const n = def.size - 1; const near = sceneryAround(g, r.x, r.y, r.x + n, r.y + n, 5);
  let e = b.e + Math.min(near.value, 47) * 2;
  const theme = Object.keys(THEME_RIDES).find(th => THEME_RIDES[th].includes(r.type));
  if (theme && sceneryAround(g, r.x, r.y, r.x + n, r.y + n, THEME_RADIUS, theme).themed >= THEME_MIN) e = Math.round(e * (1 + THEME_LIFT));
  return { e, i: b.i, n: b.n };
}
// ---------- breakdowns ----------
function breakdownCheck(g: GameState, r: Ride) {
  const def = RIDE_BY_KEY[r.type]; if (r.status !== 'open' || r.breakdown || !def.breakdowns.length) return;
  const years = Math.floor((g.monthsElapsed - r.built) / 8);
  const pen = years === 0 ? 0 : years === 1 ? def.unreliability / 8 : years === 2 ? def.unreliability / 4 : years <= 4 ? def.unreliability / 2 : years <= 7 ? def.unreliability : def.unreliability * 2;
  r.reliability = Math.max(0, r.reliability - (def.unreliability + pen));
  const roll = randInt(g, 0x300000);
  if (r.reliability === 0 || roll <= 1 + 25000 - r.reliability) {
    const types = def.breakdowns.filter(t => !(t === 'brakes_failure' && (g.monthsElapsed - r.built < 16 || r.reliability > 12500)));
    const weights = types.map(t => (t === 'brakes_failure' && g.weather.kind >= 3 ? 20 : BREAKDOWN_WEIGHTS[t]));
    let w = rand(g) * weights.reduce((a, b) => a + b, 0); let type = types[0]; for (let i = 0; i < types.length; i++) { w -= weights[i]; if (w <= 0) { type = types[i]; break; } }
    r.breakdown = { type, since: g.tick, mechanicId: null, fixing: 0 }; r.crashes++;
    news(g, 'wrench', `${r.name} has broken down (${(BREAKDOWN_WEIGHTS[type] !== undefined ? type.replace(/_/g, ' ') : type)}).`, { kind: 'ride', id: r.id });
    if (type === 'brakes_failure' && def.kind === 'coaster' && rand(g) < 0.25) crash(g, r);
  }
}
function crash(g: GameState, r: Ride) {
  const t = r.trains.find(x => x.state === 'running'); if (!t) return;
  t.state = 'crashed'; const n = t.riders.length;
  for (const id of t.riders) { const gu = guestById(g, id); if (gu) { gu.state = 'left'; } }
  t.riders = []; g.guestsInPark = Math.max(0, g.guestsInPark - n); g.stats.crashesEver++;
  g.ratingCasualtyPenalty = Math.min(1000, g.ratingCasualtyPenalty + 200 + n * 25);
  r.status = 'closed'; r.running = false;
  news(g, 'crash', `${r.name} crashed! ${n ? n + ' guests were hurt.' : 'Luckily the train was empty.'}`, { kind: 'ride', id: r.id });
}
function inspectionCheck(g: GameState, r: Ride) {
  const def = RIDE_BY_KEY[r.type]; if (def.kind === 'stall' || r.status === 'closed') return;
  r.lastInspection += 2048; if (r.inspection === 0) return;
  // interval is in in-game "minutes" ≈ 2048 ticks per unit as in the original
  if (r.lastInspection >= r.inspection * 2048 / 10) { (r as any).dueInspection = true; }
}
/** Called by a mechanic when a fix completes. */
export function fixRide(g: GameState, r: Ride) {
  r.breakdown = null; r.reliability = Math.min(25000, r.reliability + 6000 + randInt(g, 4000));
  for (const t of r.trains) if (t.state === 'crashed') { t.state = 'station'; t.pos = 0; t.v = 0; }
  news(g, 'wrench', `${r.name} has been fixed.`, { kind: 'ride', id: r.id });
}
export function inspectRide(g: GameState, r: Ride) {
  r.lastInspection = 0; (r as any).dueInspection = false; r.reliability = Math.min(25000, r.reliability + Math.round(((25000 - r.reliability) / 4) * rand(g)));
}

export function removeRideFromMap(g: GameState, r: Ride) {
  const def = RIDE_BY_KEY[r.type];
  if (def.kind === 'coaster') { for (const p of r.pieces) for (const [x, y] of pieceTiles(p)) { const t = tileAt(g, x, y); if (t) t.tracks = t.tracks.filter(tr => tr.rideId !== r.id); } }
  else for (let yy = r.y; yy < r.y + def.size; yy++) for (let xx = r.x; xx < r.x + def.size; xx++) { const t = tileAt(g, xx, yy); if (t && t.rideId === r.id) t.rideId = null; }
  for (const e of [r.entrance, r.exit]) if (e) { const t = tileAt(g, e.x, e.y); if (t && t.entrance?.rideId === r.id) t.entrance = null; }
  for (const t of g.tiles) if (t.path && t.path.rideId === r.id) t.path.rideId = null;
  for (const gu of g.guests) { if (gu.rideId === r.id) { gu.rideId = null; gu.state = 'walking'; gu.route = null; } if (gu.headingTo === r.id) gu.headingTo = null; }
}
export { earn, Cat, LAND_STEP, UNIT_M };
