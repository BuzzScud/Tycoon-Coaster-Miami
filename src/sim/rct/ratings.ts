// RCT2's ride ratings for track rides, ported from OpenRCT2 (ride/RideRatings.cpp, the measuring in ride/Vehicle.cpp,
// and each ride type's base ratings and modifiers in ride/rtd/**; GPL-3.0). A test train measures the ride as RCT's
// does (speed, length, G forces with air time, drops, turns by kind and length, inversions, helices, shelter); the
// ratings start from the ride type's base and each of its modifiers adds or divides. All values in RCT's own units:
// ratings and G in hundredths, speed as RCT's velocity, length in its distance units (65536 a metre).
import type { GameState, Ride, Tile } from '../types';
import { RIDE_BY_KEY } from '../rides';
import { PIECE_BY_KEY, pieceSpans, rot } from '../track';
import { tileAt, waterZ, landTop, PATH_CLEAR } from '../map';
import { RCT_RIDES } from './ride-data';

export interface RctStats {
  maxV: number; avgV: number; time: number; length: number;             // time: 32-tick units on the move
  maxPosG: number; maxNegG: number; maxLatG: number; airTime: number;    // hundredths of a g; air time in ticks
  drops: number; highestDrop: number; inversions: number; helices: number;
  turns: [number[], number[], number[]];                                   // level, banked, sloped: turns of 1, 2, 3 and 4+ pieces
  shelteredLength: number; shelteredSections: number; shelterBits: number; splash: boolean;
}
export const blankRctStats = (): RctStats => ({ maxV: 0, avgV: 0, time: 0, length: 0, maxPosG: 100, maxNegG: 100, maxLatG: 0, airTime: 0, drops: 0, highestDrop: 0, inversions: 0, helices: 0, turns: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], shelteredLength: 0, shelteredSections: 0, shelterBits: 0, splash: false });
const TURN_CAP = [31, 7, 7, 31];

/** The test train's running measurements (RCT's testing flags and counters). */
export class RctMeter {
  s = blankRctStats(); private prevV = 100; private prevL = 0; private tick = 0; private avgSum = 0;
  private turnDir = 0; private turnLen = 0; private turnType = 0; private dropDown = false; private dropUp = false; private startDrop = 0; private sheltered = false;
  /** Every tick: speed, length, G forces (averaged with the tick before, as RCT does), shelter. */
  everyTick(V: number, acc: number, vertG: number, latG: number, underCover: boolean, pitched: boolean, banked: boolean) {
    const a = Math.abs(V); if (a > this.s.maxV) this.s.maxV = a;
    if (++this.tick >= 32) { this.tick = 0; if (a > 0) { this.avgSum += a; this.s.time++; } }
    const dist = Math.abs(Math.trunc((V + acc) / 1024) * 42); this.s.length += dist;
    const gv = Math.trunc((vertG + this.prevV) / 2), gl = Math.trunc((latG + this.prevL) / 2); this.prevV = gv; this.prevL = gl;
    if (gv <= 0) this.s.airTime++; this.s.maxPosG = Math.max(this.s.maxPosG, gv); this.s.maxNegG = Math.min(this.s.maxNegG, gv); this.s.maxLatG = Math.max(this.s.maxLatG, Math.abs(gl));
    if (!underCover) { this.sheltered = false; return; }
    if (!this.sheltered) { this.sheltered = true; this.s.shelteredSections = Math.min(31, this.s.shelteredSections + 1); if (pitched) this.s.shelterBits |= 1; if (banked) this.s.shelterBits |= 2; }
    if (V + acc >= 0) this.s.shelteredLength += Math.trunc((V + acc) / 1024) * 42;
  }
  /** On reaching each new piece: inversions, helices, splashes, turns and drops (z: the train's height, units). */
  newPiece(key: string, V: number, z: number) {
    const d = PIECE_BY_KEY[key]; const f = d.flags;
    if (f.includes('normalToInversion')) this.s.inversions = Math.min(255, this.s.inversions + 1);
    if (d.helix) this.s.helices++;
    if (d.splash && V >= 11 * 29127) this.s.splash = true;
    const left = f.includes('turnLeft'), right = f.includes('turnRight');
    if (this.turnDir === -1 && left || this.turnDir === 1 && right) this.turnLen++;
    else if (this.turnDir) { const k = Math.min(this.turnLen, 3); const kind = this.turnType; const slot = kind < 2 && k === 3 ? 2 : k; const arr = this.s.turns[kind]; arr[slot] = Math.min(TURN_CAP[slot], arr[slot] + 1); this.turnDir = 0; }
    else if (left || right) { this.turnDir = left ? -1 : 1; this.turnLen = 0; this.turnType = f.includes('turnBanked') ? 1 : f.includes('turnSloped') ? 2 : 0; }
    const down = f.includes('down'), up = f.includes('up');
    if (this.dropDown) { if (V < 0 || !down) { this.dropDown = false; const cz = z - this.startDrop; if (cz < 0) this.s.highestDrop = Math.max(this.s.highestDrop, -cz); } }
    else if (down && V >= 0) { this.dropUp = false; this.dropDown = true; this.s.drops = Math.min(63, this.s.drops + 1); this.startDrop = z; }
    if (this.dropUp) { if (V > 0 || !up) { this.dropUp = false; const cz = z - this.startDrop; if (cz < 0) this.s.highestDrop = Math.max(this.s.highestDrop, -cz); } }
    else if (up && V <= 0) { this.dropDown = false; this.dropUp = true; this.s.drops = Math.min(63, this.s.drops + 1); this.startDrop = z; }
  }
  finish(): RctStats { this.s.avgV = Math.trunc(this.avgSum / Math.max(1, this.s.time)); return this.s; }
}

// ---------- the score from what is around the track (RCT's proximity scan, the parts this game's map has) ----------
const P = { WATER_OVER: 0, WATER_TOUCH: 1, WATER_LOW: 2, WATER_HIGH: 3, SURFACE_TOUCH: 4, QUEUE_OVER: 5, QUEUE_TOUCH_ABOVE: 6, QUEUE_TOUCH_UNDER: 7, PATH_TOUCH_ABOVE: 8, PATH_TOUCH_UNDER: 9, OWN_TOUCH_ABOVE: 10, OWN_CLOSE_ABOVE: 11, FOREIGN_ABOVE_BELOW: 12, FOREIGN_TOUCH_ABOVE: 13, FOREIGN_CLOSE_ABOVE: 14, SCENERY_SIDE_BELOW: 15, SCENERY_SIDE_ABOVE: 16, OWN_STATION_TOUCH_ABOVE: 17, OWN_STATION_CLOSE_ABOVE: 18, TRACK_THROUGH_LOOP: 19, PATH_THROUGH_LOOP: 20, INTERSECTING_LOOP: 21, THROUGH_LOOP: 22, PATH_SIDE_CLOSE: 23, FOREIGN_SIDE_CLOSE: 24, SURFACE_SIDE_CLOSE: 25 };
const h1 = (x: number, max: number, m: number) => Math.trunc(Math.min(x, max) * m / 65536);
const h2 = (x: number, add: number, max: number, m: number) => { let r = x; if (r) r += add; return Math.trunc(Math.min(r, max) * m / 65536); };
const h3 = (x: number, v: number) => (x === 0 ? 0 : v);
const sceneryTop = (t: Tile) => landTop(t) + 4;
export function proximityScore(g: GameState, r: Ride): number {
  const sc = new Array(26).fill(0); const clear = Math.round((RCT_RIDES[RIDE_BY_KEY[r.type].coaster?.rct ?? '']?.heights[1] as number ?? 24) / 8);
  const others = g.rides.filter(o => o.id !== r.id && o.pieces.length);
  r.pieces.forEach((p, pi) => {
    const def = PIECE_BY_KEY[p.type];
    def.blocks.forEach((b, bi) => {
      const [wx, wy] = rot(b.x, b.y, p.dir); const x = p.x + wx, y = p.y + wy; const t = tileAt(g, x, y); if (!t) return;
      const base = p.z + Math.round(b.lo), top = base + Math.round(b.hi - b.lo) + clear;
      if (t.h === base) sc[P.SURFACE_TOUCH]++;
      const wz = waterZ(t); if (wz !== null && wz <= base) { sc[P.WATER_OVER]++; if (wz === base) sc[P.WATER_TOUCH]++; if (wz + 2 === base) sc[P.WATER_LOW]++; if (wz + 16 <= base) sc[P.WATER_HIGH]++; }
      for (const q of t.paths) {
        const qTop = q.z + PATH_CLEAR;
        if (!q.queue) { if (qTop === base) sc[P.PATH_TOUCH_ABOVE]++; if (q.z === top) sc[P.PATH_TOUCH_UNDER]++; }
        else { if (qTop <= base) sc[P.QUEUE_OVER]++; if (qTop === base) sc[P.QUEUE_TOUCH_ABOVE]++; if (q.z === top) sc[P.QUEUE_TOUCH_UNDER]++; }
      }
      // the ride's own track elsewhere on this tile, and other rides' track
      for (const tr of t.tracks) {
        const own = tr.rideId === r.id; if (own && tr.piece === pi) continue; const ride = own ? r : others.find(o => o.id === tr.rideId); const op = ride?.pieces[tr.piece]; if (!op) continue;
        for (const [ox, oy, olo, ohi] of pieceSpans(op, clear)) {
          if (ox !== x || oy !== y) continue;
          if (!own) { sc[P.FOREIGN_ABOVE_BELOW]++; if (ohi === base || top === olo) sc[P.FOREIGN_TOUCH_ABOVE]++; if ((ohi + 2 <= base && ohi + 10 >= base) || (top + 2 === olo)) sc[P.FOREIGN_CLOSE_ABOVE]++; }
          else { const st = PIECE_BY_KEY[op.type].station; if (ohi === base || top === olo) { sc[P.OWN_TOUCH_ABOVE]++; if (st) sc[P.OWN_STATION_TOUCH_ABOVE]++; } if ((ohi + 2 <= base && ohi + 10 >= base) || (top + 2 <= olo && top + 10 >= olo)) { sc[P.OWN_CLOSE_ABOVE]++; if (st) sc[P.OWN_STATION_CLOSE_ABOVE]++; } }
        }
      }
      // beside the track (the two sides)
      const dir = bi === 0 ? p.dir : p.dir;
      for (const side of [(dir + 1) & 3, (dir + 3) & 3]) {
        const nx = x + [1, 0, -1, 0][side], ny = y + [0, 1, 0, -1][side]; const n = tileAt(g, nx, ny); if (!n) continue;
        if (t.h <= base && top <= n.h) sc[P.SURFACE_SIDE_CLOSE]++;
        for (const q of n.paths) if (Math.abs(q.z - base) <= 2) sc[P.PATH_SIDE_CLOSE]++;
        for (const tr of n.tracks) if (tr.rideId !== r.id) { const op = others.find(o => o.id === tr.rideId)?.pieces[tr.piece]; if (op && Math.abs(op.z - base) <= 2) sc[P.FOREIGN_SIDE_CLOSE]++; }
        if (n.scenery) { const sb = landTop(n), st = sceneryTop(n); if (sb < top) sc[base > st ? P.SCENERY_SIDE_ABOVE : P.SCENERY_SIDE_BELOW]++; }
      }
      if (def.loop) for (const [lx, ly] of [[x, y], [x + [1, 0, -1, 0][p.dir], y + [0, 1, 0, -1][p.dir]]]) {
        const lt = tileAt(g, lx, ly); if (!lt) continue;
        for (const q of lt.paths) { const dz = q.z - base; if (dz >= 0 && dz <= 16) sc[P.PATH_THROUGH_LOOP]++; }
        for (const tr of lt.tracks) { const ride = tr.rideId === r.id ? r : others.find(o => o.id === tr.rideId); const op = ride?.pieces[tr.piece]; if (!op || ((op.dir ^ p.dir) & 1) === 0) continue; const dz = op.z - base; if (dz >= 0 && dz <= 16) { sc[P.TRACK_THROUGH_LOOP]++; if (PIECE_BY_KEY[op.type].loop) sc[P.INTERSECTING_LOOP]++; } }
      }
    });
  });
  let s = 0;
  s += h1(sc[P.WATER_OVER], 60, 0x00AAAA); s += h1(sc[P.WATER_TOUCH], 22, 0x0245D1); s += h1(sc[P.WATER_LOW], 10, 0x020000); s += h1(sc[P.WATER_HIGH], 40, 0x00A000);
  s += h1(sc[P.SURFACE_TOUCH], 70, 0x01B6DB); s += h1(sc[P.QUEUE_OVER] + 8, 12, 0x064000); s += h3(sc[P.QUEUE_TOUCH_ABOVE], 40); s += h3(sc[P.QUEUE_TOUCH_UNDER], 45);
  s += h2(sc[P.PATH_TOUCH_ABOVE], 10, 20, 0x03C000); s += h2(sc[P.PATH_TOUCH_UNDER], 10, 20, 0x044000); s += h2(sc[P.OWN_TOUCH_ABOVE], 10, 15, 0x035555); s += h1(sc[P.OWN_CLOSE_ABOVE], 5, 0x060000);
  s += h2(sc[P.FOREIGN_ABOVE_BELOW], 10, 15, 0x02AAAA); s += h2(sc[P.FOREIGN_TOUCH_ABOVE], 10, 15, 0x04AAAA); s += h1(sc[P.FOREIGN_CLOSE_ABOVE], 5, 0x090000);
  s += h1(sc[P.SCENERY_SIDE_BELOW], 35, 0x016DB6); s += h1(sc[P.SCENERY_SIDE_ABOVE], 35, 0x00DB6D); s += h3(sc[P.OWN_STATION_TOUCH_ABOVE], 55); s += h3(sc[P.OWN_STATION_CLOSE_ABOVE], 25);
  s += h2(sc[P.TRACK_THROUGH_LOOP], 4, 6, 0x140000); s += h2(sc[P.PATH_THROUGH_LOOP], 4, 6, 0x0F0000); s += h3(sc[P.INTERSECTING_LOOP], 100); s += h2(sc[P.THROUGH_LOOP], 4, 6, 0x0A0000);
  s += h2(sc[P.PATH_SIDE_CLOSE], 10, 20, 0x01C000); s += h2(sc[P.FOREIGN_SIDE_CLOSE], 10, 20, 0x024000); s += h2(sc[P.SURFACE_SIDE_CLOSE], 10, 20, 0x028000);
  return s;
}
/** Scenery within 5 tiles of the station start, 5 a piece up to 47 pieces; 40 when the station is underground. */
export function sceneryScore(g: GameState, r: Ride): number {
  const st = r.pieces[0]; if (!st) return 0; const t = tileAt(g, st.x, st.y); if (t && t.h > st.z) return 40;
  let n = 0; const seen = new Set<string>();
  for (let y = st.y - 5; y <= st.y + 5; y++) for (let x = st.x - 5; x <= st.x + 5; x++) { const tt = tileAt(g, x, y); if (!tt?.scenery) continue; const k = tt.scenery.root ? tt.scenery.root.join(',') : `${x},${y}`; if (!seen.has(k)) { seen.add(k); n++; } }
  return Math.min(n, 47) * 5;
}
/** Eighths of the track under something (the land in a tunnel, a path or another track above). */
export function shelteredEighths(g: GameState, r: Ride): number {
  let all = 0, cov = 0;
  for (const p of r.pieces) for (const [x, y, lo, hi] of pieceSpans(p, 3)) { const t = tileAt(g, x, y); if (!t) continue; all++; if (t.h > lo || t.paths.some(q => q.z >= hi) || t.tracks.some(tr => { const o = tr.rideId === r.id ? r : g.rides.find(z => z.id === tr.rideId); const op = o?.pieces[tr.piece]; return !!op && op !== p && op.z >= hi; })) cov++; }
  return all ? Math.min(7, Math.round((cov / all) * 8)) : 0;
}

// ---------- the ratings ----------
type T = { e: number; i: number; n: number };
const add = (r: T, e: number, i: number, n: number) => { r.e = Math.max(0, Math.min(32767, r.e + e)); r.i = Math.max(0, Math.min(32767, r.i + i)); r.n = Math.max(0, Math.min(32767, r.n + n)); };
const sh = (x: number, m: number) => Math.trunc(x * m / 65536);
function gforceRatings(s: RctStats): T {
  const r = { e: 0, i: 0, n: 0 };
  r.e += sh(s.maxPosG, 5242); r.i += sh(s.maxPosG, 52428); r.n += sh(s.maxPosG, 17039);
  const ng = s.maxNegG; r.e += sh(Math.max(-250, Math.min(0, ng)), -15728); r.i += sh(ng - 100, -52428); r.n += sh(ng - 100, -14563);
  r.e += sh(Math.min(150, s.maxLatG), 26214); r.i += s.maxLatG; r.n += sh(s.maxLatG, 21845);
  return r;
}
function turnsRatings(s: RctStats): T {
  const [f, b, sl] = s.turns; const r = { e: 0, i: 0, n: 0 };
  const hx = s.helices; r.e += sh(Math.min(hx, 9), 254862); r.i += sh(Math.min(hx, 11), 148945); r.n += sh(Math.max(0, Math.min(10, hx - 5)), 0x140000);
  r.e += sh(f[2], 0x28000) + sh(f[1], 0x30000) + sh(f[0], 63421); r.i += sh(f[2], 81920) + sh(f[1], 49152) + sh(f[0], 21140); r.n += sh(f[2], 0x50000) + sh(f[1], 0x32000) + sh(f[0], 42281);
  r.e += sh(b[2], 0x3C000) + sh(b[1], 0x3C000) + sh(b[0], 73992); r.i += sh(b[2], 0x14000) + sh(b[1], 49152) + sh(b[0], 21140); r.n += sh(b[2], 0x50000) + sh(b[1], 0x32000) + sh(b[0], 48623);
  r.e += sh(Math.min(sl[3], 4), 0x78000) + sh(Math.min(sl[2], 6), 273066) + sh(Math.min(sl[1], 6), 0x3AAAA) + sh(Math.min(sl[0], 7), 187245); r.n += sh(Math.min(sl[3], 8), 0x78000);
  const inv = s.inversions; r.e += sh(Math.min(inv, 6), 0x1AAAAA); r.i += sh(inv, 0x320000); r.n += sh(inv, 0x15AAAA);
  return r;
}
function dropRatings(s: RctStats): T {
  const r = { e: 0, i: 0, n: 0 }; r.e += sh(Math.min(9, s.drops), 728177); r.i += sh(s.drops, 928426); r.n += sh(s.drops, 655360);
  add(r, sh(s.highestDrop * 2, 16000), sh(s.highestDrop * 2, 32000), sh(s.highestDrop * 2, 10240)); return r;
}
function shelteredRatings(s: RctStats): T {
  const L = s.shelteredLength >> 16; let e = sh(Math.min(L, 1000), 9175), n = sh(Math.min(L, 1000), 0x4000); const i = sh(Math.min(L, 2000), 0x2666);
  if (s.shelterBits & 2) { e += 20; n += 15; } if (s.shelterBits & 1) { e += 20; n += 15; } e += sh(Math.min(s.shelteredSections, 11), 774516); return { e, i, n };
}
function lateralPenalty(s: RctStats): T {
  const r = { e: 0, i: 0, n: 0 };
  if (s.maxLatG > 280) { r.i = 375; r.n = 200; }
  if (s.maxLatG > 310) { let e = sh(s.maxPosG, 5242); e += sh(Math.max(-250, Math.min(0, s.maxNegG)), -15728); e += sh(Math.min(150, s.maxLatG), 26214); r.e = -Math.trunc(e / 2); r.i = 1225; r.n = 600; }
  return r;
}
/** The ratings RCT gives a tested track ride (hundredths). null when this ride type has no RCT rules. */
export function rctRatings(g: GameState, r: Ride, s: RctStats): T | null {
  const c = RIDE_BY_KEY[r.type].coaster; const rd = c?.rct ? RCT_RIDES[c.rct] : undefined; if (!rd?.ratings.base) return null;
  const [be, bi, bn] = rd.ratings.base; const rt = { e: be, i: bi, n: bn };
  const lengthM = s.length >> 16; const cars = r.carsPerTrain || c!.cars;
  for (const m of rd.ratings.modifiers) {
    const [type, thr, me, mi, mn] = m as [string, number, number, number, number];
    const div = () => { rt.e = Math.trunc(rt.e / me); rt.i = Math.trunc(rt.i / mi); rt.n = Math.trunc(rt.n / mn); };
    const sub = (x: T) => add(rt, sh(x.e, me), sh(x.i, mi), sh(x.n, mn));
    switch (type) {
      case 'bonusLength': add(rt, sh(Math.min(lengthM, thr), me), 0, 0); break;
      case 'bonusTrainLength': add(rt, sh(cars - 1, me), 0, 0); break;
      case 'bonusMaxSpeed': { const v = s.maxV >> 16; add(rt, sh(v, me), sh(v, mi), sh(v, mn)); break; }
      case 'bonusAverageSpeed': { const v = s.avgV >> 16; add(rt, sh(v, me), sh(v, mi), 0); break; }
      case 'bonusDuration': add(rt, sh(Math.min(s.time, thr), me), 0, 0); break;
      case 'bonusGForces': sub(gforceRatings(s)); break;
      case 'bonusTurns': sub(turnsRatings(s)); break;
      case 'bonusDrops': sub(dropRatings(s)); break;
      case 'bonusSheltered': sub(shelteredRatings(s)); break;
      case 'bonusProximity': add(rt, sh(proximityScore(g, r), me), 0, 0); break;
      case 'bonusScenery': add(rt, sh(sceneryScore(g, r), me), 0, 0); break;
      case 'bonusNumTrains': if (r.numTrains >= thr) add(rt, me, mi, mn); break;
      case 'requirementLength': if (s.length < thr) div(); break;
      case 'requirementMaxSpeed': if (s.maxV < thr) div(); break;
      case 'requirementLateralGs': if (s.maxLatG < thr) div(); break;
      case 'requirementInversions': if (s.inversions < thr) div(); break;
      case 'requirementUnsheltered': if (shelteredEighths(g, r) >= thr) div(); break;
      case 'requirementSplashdown': if (!s.splash) div(); break;
      case 'penaltyLateralGs': sub(lateralPenalty(s)); break;
    }
    if (s.inversions === 0 || !rd.ratings.relaxIfInversions) {
      if (type === 'requirementDropHeight' && s.highestDrop < thr) div();
      if (type === 'requirementNumDrops' && s.drops < thr) div();
      if (type === 'requirementNegativeGs' && s.maxNegG >= thr) div();
    }
  }
  // excitement falls as intensity climbs; then air time (rides that have it)
  for (const b of [1000, 1100, 1200, 1320, 1450]) if (rt.i >= b) rt.e -= Math.trunc(rt.e / 4);
  if (rd.flags.includes('hasAirTime') || rd.flags.includes('kRtdFlagsCommonCoasterNonAlt')) add(rt, Math.trunc(Math.min(s.airTime, 200) / 8), 0, Math.trunc(s.airTime / 16));
  return rt;
}

// ---------- flat rides and towers (RCT's flatRide ratings, and the tower rides it rates by the length of their tower) ----------
const SET: Record<string, Record<string, [number, number, number]>> = {
  bonusTopSpinMode: { beginners: [200, 480, 574], intense: [300, 575, 664], berserk: [320, 680, 794] },
  bonus3DCinemaMode: { mouseTails3DFilm: [350, 240, 140], stormChasers3DFilm: [400, 265, 155], spaceRaiders3DFilm: [420, 260, 148] },
  bonusMotionSimulatorMode: { filmAvengingAviators: [290, 350, 300], filmThrillRiders: [325, 410, 330] },
};
/** Scenery within 5 tiles of a spot (RCT counts from the ride's start), 5 a piece up to 47. */
function sceneryNear(g: GameState, x0: number, y0: number): number {
  let n = 0; const seen = new Set<string>();
  for (let y = y0 - 5; y <= y0 + 5; y++) for (let x = x0 - 5; x <= x0 + 5; x++) { const t = tileAt(g, x, y); if (!t?.scenery) continue; const k = t.scenery.root ? t.scenery.root.join(',') : `${x},${y}`; if (!seen.has(k)) { seen.add(k); n++; } }
  return Math.min(n, 47) * 5;
}
/** The ratings RCT gives a flat ride or a tower ride (hundredths), from its ride type's rules and the ride's settings:
 *  its operating option (rotations, swings, laps…), mode (film, top spin programme…), number of cars. */
export function rctFlatRatings(g: GameState, r: Ride, opt: { option: number; mode: string; towerM: number; mazeTiles: number }): T | null {
  const def = RIDE_BY_KEY[r.type]; const rd = def.rct ? RCT_RIDES[def.rct] : undefined; if (!rd?.ratings.base) return null;
  const [be, bi, bn] = rd.ratings.base; const rt = { e: be, i: bi, n: bn }; const o = opt.option; const L = opt.towerM;
  for (const m of rd.ratings.modifiers) {
    const [type, thr, me, mi, mn] = m as [string, number, number, number, number];
    switch (type) {
      case 'bonusRotations': add(rt, o * me, o * mi, o * mn); break;
      case 'bonusOperationOption': add(rt, o * me, mi >= 0 ? o * mi : Math.trunc(o / Math.abs(mi)), o * mn); break;
      case 'bonusScenery': add(rt, sh(sceneryNear(g, r.x, r.y), me), 0, 0); break;
      case 'bonusProximity': add(rt, sh(sceneryNear(g, r.x, r.y) * 2, me), 0, 0); break;   // a tower's surroundings, from the scenery about it
      case 'bonusNumTrains': if (r.numTrains >= thr) add(rt, me, mi, mn); break;
      case 'bonusSlideUnlimitedRides': if (opt.mode === 'unlimitedRidesPerAdmission') add(rt, me, mi, mn); break;
      case 'bonusTopSpinMode': case 'bonus3DCinemaMode': case 'bonusMotionSimulatorMode': { const v = SET[type][opt.mode] ?? Object.values(SET[type])[0]; rt.e = v[0]; rt.i = v[1]; rt.n = v[2]; break; }
      case 'bonusMazeSize': { const sz = Math.min(opt.mazeTiles, thr); add(rt, sz * me, Math.trunc(sz / (mi || 1)), sz * mn); break; }
      case 'bonusTowerRide': add(rt, sh(L, me), sh(L, mi), sh(L, mn)); break;
      case 'bonusRotoDrop': { const lf = sh(L, 209715); add(rt, lf, lf * 2, lf * 2); break; }
      case 'bonusDownwardLaunch': if (opt.mode === 'downwardLaunch') add(rt, me, mi, mn); break;
      case 'bonusLaunchedFreefallSpecial': { add(rt, sh(L, 32768), 0, 0); if (opt.mode === 'upwardLaunch') add(rt, sh(o, me), sh(o, mi), sh(o, mn)); else { const lf = sh(L, 209715); add(rt, lf, lf * 2, lf * 2); } break; }
    }
  }
  for (const b of [1000, 1100, 1200, 1320, 1450]) if (rt.i >= b) rt.e -= Math.trunc(rt.e / 4);
  return rt;
}
