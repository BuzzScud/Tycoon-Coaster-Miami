// Ride operation: coaster physics and tests, ratings, flat-ride cycles, breakdowns, trains.
import { LAND_STEP, TILE_M, UNIT_M, clamp, type GameState, type Ride, type RideStats, type Ratings, type Train } from './types';
import { RIDE_BY_KEY, BREAKDOWN_WEIGHTS } from './rides';
import { PIECE_BY_KEY, pieceTiles, pointAt, isStation } from './track';
import { factor, gFrom } from './rct/gforce';
import * as M from './rct/motion';
import { RctMeter, rctRatings } from './rct/ratings';
import { RCT_RIDES, type RctRideData } from './rct/ride-data';
import { tileAt } from './map';
import { sceneryAround, THEME_RIDES, THEME_RADIUS, THEME_MIN, THEME_LIFT } from './scenery';
import { rand, randInt } from './rng';
import { Cat, earn } from './finance';
import { news } from './game';
import { guestById } from './runtime';

const G = 9.81;
const CURVE_HALF = 3;   // metres either side over which the track's bend is measured
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
  const stationLen = stationLength(r);
  r.trains = []; for (let i = 0; i < n; i++) r.trains.push({ cars, pos: stationLen - 1 - i * 1e6, v: 0, state: 'station', wait: i * 300, riders: [], lapStart: g.tick, maxV: 0 });
  const brakes = blockBrakes(r);
  if (brakes.length) { // block sections: the others wait on the block brakes, last brake first (one train a section)
    for (let i = 1; i < n; i++) { const b = brakes[brakes.length - i]; if (!b) { r.trains.length = i; break; } Object.assign(r.trains[i], { pos: b.end - 0.3, state: 'running', v: 0 }); }
    return;
  }
  // trains beyond the first start spaced around the loop
  const total = pieceLen(r); for (let i = 1; i < n; i++) { r.trains[i].pos = ((stationLen - 1 - (total / n) * i) % total + total) % total; r.trains[i].state = 'running'; r.trains[i].v = 3; }
}

// ---------- physics ----------
interface Probe { s: number; z: number; slope: number; piece: number; uz: number; pa: number }
/** Advance a train one tick along the track. Returns false if the train stalls (cannot make it up a hill). */
function stepTrain(g: GameState, r: Ride, t: Train, sampleG?: (p: Probe, v: number, vertG: number, latG: number) => void): boolean {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const dt = 1 / 40; const total = pieceLen(r);
  const here = probe(r, t.pos); const behind = probe(r, t.pos - CURVE_HALF), ahead = probe(r, t.pos + CURVE_HALF);
  const pdef = PIECE_BY_KEY[r.pieces[here.piece].type]; const piece = r.pieces[here.piece];
  let a = -G * Math.sin(here.slope);                            // gravity along the track
  a -= c.friction * t.v * Math.abs(t.v) * 0.08 + 0.15 * Math.sign(t.v) * (Math.abs(t.v) > 0.05 ? 1 : 0);   // drag + rolling friction
  if (pdef.inversion || pdef.inverted) a -= 0.6 * Math.sign(t.v);
  let v = t.v + a * dt;
  if (piece.chain || pdef.station) { if (v < c.liftSpeed) v = c.liftSpeed; }
  if (pdef.brakes && v > 7) v = Math.max(7, v - 12 * dt);
  if (pdef.booster) v = Math.max(v, 16);
  if (c.powered) v = clamp(v, c.powered * 0.9, c.powered + 1);   // the engine: steady on the level, up hills and down
  if (c.current && pdef.dz <= 0 && !pdef.station && v < c.current) v = Math.min(c.current, v + 1.2 * dt);   // the water carries the boat
  if (pdef.splash && v > 2) v = Math.max(2, v - v * 1.4 * dt);   // ploughing through the water
  if (v < 0.05 && !piece.chain && !pdef.station && !pdef.booster) { if (here.slope > 0.05) return false; v = 0.05; }
  // G forces: vertical = cos(slope) + v² × curvature, the curvature measured over a few metres (a real track eases
  // into a drop; the pieces meet at a corner, and a corner measured over one metre read as a 6 g spike at every joint).
  // Upside down (loops, corkscrews) the riders are pressed into their seats: about v²/r on a 6 m radius.
  const kappa = (ahead.slope - behind.slope) / (2 * CURVE_HALF);
  const upside = pdef.inversion || pdef.inverted;
  let vertG = upside ? clamp(1 + (v * v) / (6 * G) * (pdef.loop ? 0.75 : 0.35), 1, 5) : clamp(Math.cos(here.slope) + (v * v * kappa) / G, -3, 6);
  let latG = pdef.turn ? (v * v) / ((pdef.radius + 0.75) * TILE_M * G) * (piece.bank || pdef.banked ? 0.35 : 1) : 0;   // effective radius: the car's path is wider than the centre line
  if (!pdef.legacy) {   // RCT's own G: gravity by how upright the car is, plus speed over the piece's factors where it is
    const prog = (here.s / pdef.length) * pdef.steps;
    vertG = clamp(here.uz + gFrom(factor(pdef.vf, prog), v), -3, 6); latG = Math.abs(gFrom(factor(pdef.lf, prog), v));
  }
  sampleG?.(here, v, vertG, latG);
  t.v = v; t.pos += v * dt; t.maxV = Math.max(t.maxV, v);
  if (t.pos >= total) t.pos -= total;
  return true;
}
/** Is the ride's track all RCT pieces? (then its trains move as RCT's do; tracks with older pieces keep the old physics) */
export const isRctTrack = (r: Ride) => r.pieces.length > 0 && !r.pieces.some(p => PIECE_BY_KEY[p.type].legacy);
/** Where the station ends along the track (its pieces come first). */
export function stationLength(r: Ride): number { let s = 0; for (const p of r.pieces) { const d = PIECE_BY_KEY[p.type]; if (!d.station) break; s += d.legacy ? TILE_M : d.length; } return s; }
/** The ride's operating mode and settings, filled in from its RCT ride type where it has not set them. */
export function rideMode(r: Ride): { mode: string; liftV: number; launchV: number; launchAcc: number; rtd: RctRideData | undefined } {
  const c = RIDE_BY_KEY[r.type].coaster; const rtd = c?.rct ? RCT_RIDES[c.rct] : undefined;
  const lift = r.liftSpeed ?? rtd?.lift[0] ?? Math.round((c?.liftSpeed ?? 2.5) * 2.237);
  const launch = r.launchSpeed ?? rtd?.operating[0] ?? 10;
  return { mode: r.mode ?? rtd?.defaultMode ?? 'continuousCircuit', liftV: lift * M.LIFT_V_PER_UNIT, launchV: launch << 16, launchAcc: launch << (rtd?.booster[2] ?? 12), rtd };
}
/** One tick of a train on RCT track, as RCT moves it. Returns false when it stalls on a climb. */
function stepTrainRct(g: GameState, r: Ride, t: Train, sampleG?: (p: Probe, v: number, vertG: number, latG: number) => void): boolean {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const total = pieceLen(r); const om = rideMode(r);
  if (t.V === undefined) { t.V = M.msToV(t.v); t.acc = 0; }
  let V = t.V + (t.acc ?? 0);                                    // updateVelocity
  const d = M.metresPerTick(V); t.pos += d;
  const steps = Math.abs(d) / M.STEP_M; const mass = t.cars * M.CAR_MASS + t.riders.length * M.RIDER_MASS;
  const accs: number[] = []; let onLift = false; const head = probe(r, t.pos); const hdef = PIECE_BY_KEY[r.pieces[head.piece].type];
  for (let k = 0; k < t.cars; k++) {
    const q = k ? probe(r, t.pos - k * M.CAR_SPACING_M) : head; const piece = r.pieces[q.piece]; const pd = PIECE_BY_KEY[piece.type];
    const moves = Math.max(1, Math.floor(steps)); let a = q.pa;   // its pitch, averaged over the positions it moved through
    if (pd.brakes && !pd.block && V > M.BRAKE_SPEED << M.TRACK_SPEED_SHIFT) a = Math.trunc(-V * 16 / moves);
    if (pd.block && V > M.BRAKE_SPEED << M.TRACK_SPEED_SHIFT) a = Math.trunc(-V * 16 / moves);
    if (pd.booster && V < M.BOOSTER_SPEED << M.TRACK_SPEED_SHIFT) a = Math.trunc(((om.rtd?.legacyBooster[1] ?? 18) << 16) / moves);
    if (piece.chain) onLift = true;
    accs.push(a);
  }
  let acc = M.trainAcceleration(accs, V, mass);
  if (c.powered || c.current) { const speed = Math.round(((c.powered ?? c.current ?? 3) * 2.237) / 0.5625); acc = M.poweredAcceleration(V, speed, 20, mass, acc, !!c.current, Math.abs(head.slope) > 0.05); }   // RCT's powered speed: × 2¹⁴ in velocity (0.5625 mph a unit)
  if (hdef.splash && head.s / hdef.length * hdef.steps >= 48 && head.s / hdef.length * hdef.steps <= 128) acc -= V >> 6;   // ploughing through the water
  if (onLift && V <= om.liftV) acc = M.LIFT_ACC;                  // the chain pulls the train up at the lift speed
  if (t.pos < stationLength(r)) {                                // leaving the station
    if (/[lL]aunch/.test(om.mode) && !/Shuttle/.test(om.mode)) { if (om.launchV > V) acc = om.launchAcc; }
    else if (!c.powered && V <= M.DEPART_V) acc = M.DEPART_ACC;
  }
  t.V = V; t.acc = acc; const v = M.vToMs(V);
  if (V <= 0 && head.slope > 0.02 && !onLift) return false;      // stalled on a climb
  // G forces as RCT measures them on the front car: gravity by how upright it is, plus speed over the piece's factors
  const prog = (head.s / hdef.length) * hdef.steps;
  const vertG = head.uz + (Math.abs(V) * 98 * 10) / (factor(hdef.vf, prog) || Infinity) / 65536 / 100;
  const latG = (Math.abs(V) * 98 * 10) / (factor(hdef.lf, prog) || Infinity) / 65536 / 100;
  sampleG?.(head, v, vertG, latG);
  t.v = v; t.maxV = Math.max(t.maxV, v);
  if (t.pos >= total) t.pos -= total;
  return true;
}
function probe(r: Ride, s: number): Probe {
  const tb = table(r), total = tb.total; s = ((s % total) + total) % total;
  let lo = 0, hi = tb.at.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tb.at[mid] < s) lo = mid; else hi = mid - 1; }   // the last piece starting before s
  const i = lo; s -= tb.at[i];
  const p = pointAt(r.pieces[i], s); return { s, z: p.z, slope: p.slope, piece: i, uz: p.uz, pa: p.pa };
}
/** A test run's log, every 4 ticks (RCT's ride graphs): speed (m/s), height (units), vertical and lateral G, piece. */
export interface RideGraph { v: number[]; z: number[]; gv: number[]; gl: number[]; piece: number[] }
const GRAPHS = new WeakMap<Ride, RideGraph>();
/** The last test run's log (kept in memory only; a loaded park measures again on its next test). */
export const rideGraph = (r: Ride) => GRAPHS.get(r) ?? null;
/** Run a test train round the circuit and measure everything the ratings need. */
export function simulateTest(g: GameState, r: Ride): RideStats {
  const def = RIDE_BY_KEY[r.type]; const c = def.coaster!; const total = pieceLen(r);
  const t: Train = { cars: c.cars, pos: 0, v: 0, state: 'running', wait: 0, riders: [], lapStart: 0, maxV: 0 }; const rct = isRctTrack(r);
  const st: RideStats = { length: total, maxSpeed: 0, avgSpeed: 0, duration: 0, drops: 0, highestDrop: 0, maxPosG: 1, maxNegG: 1, maxLatG: 0, airTime: 0, inversions: r.pieces.filter(p => PIECE_BY_KEY[p.type].inversion).length, helices: r.pieces.filter(p => PIECE_BY_KEY[p.type].helix).length, turns: r.pieces.filter(p => PIECE_BY_KEY[p.type].turn !== 0 && !p.bank).length, bankedTurns: r.pieces.filter(p => PIECE_BY_KEY[p.type].turn !== 0 && p.bank).length, sheltered: 0, completed: false };
  let ticks = 0, sumV = 0, lastZ = probe(r, 0).z, climbing = false, crest = 0, lapDone = false, lastPiece = -1, away = false; st.splashes = 0; const stLen = stationLength(r);
  const maxTicks = 40 * 60 * 6;   // 6 minutes of ride time at most
  const meter = rct ? new RctMeter() : null; let meterPiece = -1; const graph: RideGraph = { v: [], z: [], gv: [], gl: [], piece: [] }; GRAPHS.set(r, graph);
  while (ticks < maxTicks) {
    const ok = (rct ? stepTrainRct : stepTrain)(g, r, t, (p, v, vg, lg) => {
      if (meter) {   // RCT's measuring: every tick, and on reaching each new piece
        if (p.piece !== meterPiece) { meterPiece = p.piece; meter.newPiece(r.pieces[p.piece].type, t.V ?? 0, Math.floor(p.z)); }
        const tile = tileAt(g, Math.floor(pointAt(r.pieces[p.piece], p.s).x), Math.floor(pointAt(r.pieces[p.piece], p.s).y));
        const under = !!tile && (tile.h > p.z + 1 || tile.paths.some(q => q.z > p.z + 2));
        meter.everyTick(t.V ?? 0, t.acc ?? 0, Math.trunc(vg * 100), Math.trunc(lg * 100), under, Math.abs(p.slope) > 0.05, Math.abs(p.uz) < 0.95);
        vg = clamp(vg, -3, 6); lg = Math.abs(lg);
      }
      if ((ticks & 3) === 0) { graph.v.push(+v.toFixed(2)); graph.z.push(+p.z.toFixed(2)); graph.gv.push(+vg.toFixed(2)); graph.gl.push(+lg.toFixed(2)); graph.piece.push(p.piece); }   // the data RCT logs for its ride graphs
      if (p.piece !== lastPiece) { lastPiece = p.piece; if (PIECE_BY_KEY[r.pieces[p.piece].type].splash && v > 3) st.splashes!++; } st.maxPosG = Math.max(st.maxPosG, vg); st.maxNegG = Math.min(st.maxNegG, vg); st.maxLatG = Math.max(st.maxLatG, lg); if (vg < 0) st.airTime++; sumV += v;
      if (p.z > lastZ + 0.004) { if (!climbing) { climbing = true; } crest = Math.max(crest, p.z); } else if (p.z < lastZ - 0.004) { if (climbing) { climbing = false; st.drops++; const drop = crest - p.z; st.highestDrop = Math.max(st.highestDrop, drop); crest = p.z; } else { st.highestDrop = Math.max(st.highestDrop, Math.max(crest, lastZ) - p.z); } } lastZ = p.z; });
    if (!ok) { st.failReason = 'The train cannot get over the hill at piece ' + (probe(r, t.pos).piece + 1) + '. Add a chain lift or lower it.'; st.duration = ticks; return st; }
    ticks++;
    if (t.pos > stLen + 1) away = true;
    if (away && ticks > 40 && t.pos < 1.5 && t.v > 0 && !lapDone) { lapDone = true; break; }
  }
  if (!lapDone) { st.failReason = 'The train never got back to the station.'; st.duration = ticks; return st; }
  st.maxSpeed = t.maxV; st.avgSpeed = sumV / ticks; st.duration = ticks; st.completed = true;
  if (meter) {   // the figures RCT shows and rates by
    const m = st.rct = meter.finish();
    st.length = m.length / 65536; st.maxSpeed = M.vToMs(m.maxV); st.avgSpeed = M.vToMs(m.avgV); st.maxPosG = m.maxPosG / 100; st.maxNegG = m.maxNegG / 100; st.maxLatG = m.maxLatG / 100;
    st.airTime = m.airTime; st.drops = m.drops; st.highestDrop = m.highestDrop; st.inversions = m.inversions; st.helices = m.helices;
    st.turns = m.turns[0].reduce((a, b) => a + b, 0) + m.turns[2].reduce((a, b) => a + b, 0); st.bankedTurns = m.turns[1].reduce((a, b) => a + b, 0); if (m.splash) st.splashes = Math.max(st.splashes ?? 0, 1);
  }
  // the highest drop also needs to count the first descent after the lift
  st.highestDrop = Math.max(st.highestDrop, Math.round(st.highestDrop));
  if (st.maxSpeed > 40) { st.failReason = 'Too fast: the train would derail.'; st.completed = false; }
  return st;
}

// ---------- ratings (in hundredths) ----------
export function computeCoasterRatings(g: GameState, r: Ride, s: RideStats): Ratings {
  if (s.rct) { const rt = rctRatings(g, r, s.rct); if (rt) return rt; }   // RCT's own ratings, from its measurements
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
  const hx = s.helices ?? 0; e += Math.min(hx, 12) * 6; i += Math.min(hx, 12) * 3; n += Math.max(0, hx - 6) * 10;   // helix quarters
  const sp = s.splashes ?? 0; e += Math.min(sp, 4) * 45; i += sp * 12; n += sp * 8;   // splashes: the best bit of a water ride
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
/** Block brake pieces, where each starts and ends along the track (metres). */
export function blockBrakes(r: Ride): { start: number; end: number }[] {
  const tb = table(r); const out: { start: number; end: number }[] = []; r.pieces.forEach((p, i) => { if (PIECE_BY_KEY[p.type].block) out.push({ start: tb.at[i], end: tb.at[i] + PIECE_BY_KEY[p.type].length }); }); return out;
}
/** Block sections (only on a track with block brakes): the station is one, and each section ahead runs from the end of
 *  the station or of a block brake to the next block brake. Each holds one train; a train waits on its block brake
 *  (or in the station) until the section ahead is clear. Returns which section a position is in (-1 = station). */
function sectionOf(pos: number, stationLen: number, brakes: { end: number }[]): number {
  if (pos < stationLen) return -1; let k = 0; for (let i = 0; i < brakes.length; i++) if (pos >= brakes[i].end) k = i + 1; return k;
}
function runTrains(g: GameState, r: Ride) {
  const total = pieceLen(r); if (total <= 0 || !r.trains.length) return;
  const stationLen = stationLength(r);
  const brakes = blockBrakes(r);
  const occupied = (sec: number, me: Train) => r.trains.some(o => o !== me && o.state !== 'crashed' && (o.state === 'station' ? sec === -1 : sectionOf(o.pos, stationLen, brakes) === sec));
  for (const t of r.trains) {
    if (t.state === 'crashed') continue;
    if (t.state === 'station') {
      t.wait--; const capacity = t.cars * (RIDE_BY_KEY[r.type].coaster?.seats ?? 4);
      // RCT's departure rules: at least the minimum wait, then go once the load asked for is aboard, at the maximum
      // wait whatever the load, or (if set) when another train arrives behind
      const waited = 120 - t.wait; const minW = (r.minWait ?? 3) * 40, maxW = Math.max(minW, (r.maxWait ?? 43) * 40);
      const load = r.departLoad ?? 0; const loaded = load === 0 ? t.riders.length > 0 : t.riders.length >= Math.ceil(capacity * load / 4);
      const behind = !!r.leaveWhenAnother && r.trains.some(o => o !== t && o.state === 'running' && o.pos > pieceLen(r) - 12);
      if ((r.status === 'testing' || (waited >= minW && (loaded || waited >= maxW || behind))) && !(brakes.length && occupied(0, t))) {
        // only one train may leave while another is still in the station block
        t.state = 'running'; t.v = 2; t.V = undefined; t.lapStart = g.tick; if (r.status === 'open') { for (const id of t.riders) { const gu = guestById(g, id); if (gu) gu.state = 'riding'; } }
      }
      continue;
    }
    const before = t.pos;
    const ok = (isRctTrack(r) ? stepTrainRct : stepTrain)(g, r, t);
    if (!ok) { // stalled on a hill: roll back to the station (counts as a failed lap)
      t.v = -1; }
    // on a block brake: hold at its end while the section ahead has a train in it, then roll on
    for (const b of brakes) if (t.pos >= b.start && t.pos < b.end) {
      const ahead = sectionOf(b.end + 0.01, stationLen, brakes) === brakes.length && b.end >= total - 0.01 ? -1 : sectionOf(b.end + 0.01, stationLen, brakes);
      if (occupied(ahead, t)) { t.pos = Math.min(t.pos, b.end - 0.3); t.v = 0; } else if (t.v < 4 && t.pos > b.end - 1) t.v = 4;
    }
    // arrived back at the station?
    if (t.state === 'running' && ((before > stationLen + 2 && (t.pos < stationLen - 1 || t.pos < before - total / 2)) || (t.pos < stationLen - 1 && g.tick - t.lapStart > 200))) {
      // another train in the station? queue behind it
      if (r.trains.some(o => o !== t && o.state === 'station')) { t.pos = Math.max(0, stationLen - 6); t.v = 0; continue; }
      // more laps to go (RCT's circuits; a passing-through launch goes round twice): through the station without stopping
      const laps = Math.max(1, r.circuits ?? 1) * (rideMode(r).mode === 'poweredLaunchPassthrough' ? 2 : 1);
      if ((t.lap ?? 0) + 1 < laps) { t.lap = (t.lap ?? 0) + 1; t.lapStart = g.tick; continue; }
      t.state = 'station'; t.pos = stationLen - 1; t.v = 0; t.V = undefined; t.wait = 120; t.lap = 0;
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
  for (const t of g.tiles) for (const p of t.paths) if (p.rideId === r.id) p.rideId = null;
  for (const gu of g.guests) { if (gu.rideId === r.id) { gu.rideId = null; gu.state = 'walking'; gu.route = null; } if (gu.headingTo === r.id) gu.headingTo = null; }
}
export { earn, Cat, LAND_STEP, UNIT_M };
