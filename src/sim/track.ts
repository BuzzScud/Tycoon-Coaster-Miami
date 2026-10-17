// Coaster track pieces: every RollerCoaster Tycoon 2 piece, built from OpenRCT2's tables (src/sim/rct/track-data.ts,
// GPL-3.0, see the README): the tiles each covers, where the next one starts, how pitch and banking chain from piece to
// piece, and the path a car takes along it. Geometry is in a local frame where the train enters heading +x; x and y in
// tiles, z in height units (1.5 m). The pieces this game had before (src/sim/track-legacy.ts) stay, so old parks load.
import { DX, DY, TILE_M, UNIT_M, type Dir, type TrackPiece } from './types';
import { RCT_PIECES, RCT_PITCH, RCT_ROLL, GROUPS, FLAGS, TRACK_PITCH, TRACK_ROLL, CURVES, SPINS, RCT_NEXT, SPECIAL_ORDER, RIDE_TRACK, ACC_FROM_PITCH, STEP_DISTANCE } from './rct/track-data';
import { LEGACY_PIECES, type LegacyDef } from './track-legacy';

/** A point on a piece's centre line: local tiles (x along, y to the side), z in height units, s in metres from the
 *  piece's start, and the car's up direction (ux, uy along x and y, uz upwards; in true proportions). */
export interface Sample { x: number; y: number; z: number; s: number; ux: number; uy: number; uz: number; pa?: number; }   // pa: RCT's acceleration for a car here (by its pitch)
/** A tile a piece covers and the height it fills there, from the piece's start (height units). */
export interface PieceBlock { x: number; y: number; lo: number; hi: number; q: number }   // q: the quarters of the tile it fills (RCT's 4 bits)
export type Pitch = typeof TRACK_PITCH[number]; export type Roll = typeof TRACK_ROLL[number]; export type Curve = typeof CURVES[number];
export interface PieceDef {
  key: string; name: string;
  group: string;                // RCT track group: a ride type offers the groups it can build ('legacy' = an old piece)
  legacy?: boolean;             // an old piece: still loads and runs, never offered
  tiles: [number, number][];    // covered tiles (local)
  blocks: PieceBlock[];
  end: [number, number];        // tile where the next piece starts (local)
  endDir: Dir;                  // turn over the piece, in quarter turns (local)
  diagIn: boolean; diagOut: boolean;   // starts / ends heading diagonally (45° to the grid)
  dz: number;                   // height change over the piece
  pitchIn: Pitch; pitchOut: Pitch; rollIn: Roll; rollOut: Roll;   // how steep and how banked at each end: a piece follows only one that ends the way it starts
  turn: 0 | 1 | -1;             // 1 right, -1 left
  radius: number;               // turn radius in tiles (0 = straight)
  flags: string[];              // RCT flags (up, down, helix, normalToInversion, allowLiftHill…)
  loop?: boolean; brakes?: boolean; booster?: boolean; photo?: boolean; station?: boolean; chainable?: boolean; bankable?: boolean;
  inversion?: boolean;          // riders go upside down (counted once, where they turn over)
  inverted?: boolean;           // some of the piece is upside down (loops, corkscrews, inverted track)
  banked?: boolean;             // banked somewhere along it
  helix?: boolean; block?: boolean; splash?: boolean;
  costMul: number;              // RCT's price modifier (1 = a flat piece)
  steps: number;                // RCT car positions along it (its 'track progress' runs 0 … steps)
  samples: Sample[]; length: number;   // metres (an RCT piece: RCT's own metres, as its ride lengths read)
  clearance: number;            // height units the piece fills above its start (at its highest)
  mirror?: string; spin?: string; vf?: number | string | null; lf?: number | string | null;
}

// ---------- the RCT pieces ----------
const A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const IDX = new Int16Array(128); for (let i = 0; i < 64; i++) IDX[A64.charCodeAt(i)] = i;
/** Car positions from the packed path (tools/openrct2_port.py enc_path): x, y, z in RCT units, yaw 0–31, pitch and roll indexes. */
function decodePath(s: string): number[][] {
  const out: number[][] = []; let i = 0; let prev: number[] | null = null;
  const num = (k: number) => { if (s[i] === '!') { const v = (IDX[s.charCodeAt(i + 1)] << 6 | IDX[s.charCodeAt(i + 2)]) - 2048; i += 3; return v; } const d = IDX[s.charCodeAt(i)] - 32; i++; return prev![k] + d; };
  while (i < s.length) { const x = num(0), y = num(1), z = num(2); const w = IDX[s.charCodeAt(i++)], p = IDX[s.charCodeAt(i++)], r = IDX[s.charCodeAt(i++)]; prev = [x, y, z, w, p, r]; out.push(prev); }
  return out;
}
const PITCH_DEG: Record<string, number> = { flat: 0, up12: 12, up25: 25, up42: 42, up60: 60, down12: -12, down25: -25, down42: -42, down60: -60, up75: 75, up90: 90, up105: 105, up120: 120, up135: 135, up150: 150, up165: 165, inverted: 180, down75: -75, down90: -90, down105: -105, down120: -120, down135: -135, down150: -150, down165: -165, upHalfHelixLarge: 0, upHalfHelixSmall: 0, downHalfHelixLarge: 0, downHalfHelixSmall: 0, upQuarterHelix: 0, downQuarterHelix: 0, up8: 8, up16: 16, up50: 50, down8: -8, down16: -16, down50: -50, uninvertingDown25: -25, uninvertingDown42: -42, uninvertingDown60: -60, curvedLiftHillUp: 25, curvedLiftHillDown: -25 };
const ROLL_DEG: Record<string, number> = { unbanked: 0, left22: -22.5, left45: -45, right22: 22.5, right45: 45, left67: -67.5, left90: -90, left112: -112.5, left135: -135, left157: -157.5, right67: 67.5, right90: 90, right112: 112.5, right135: 135, right157: 157.5, uninvertingUnbanked: 0, uninvertingLeft22: -22.5, uninvertingLeft45: -45, uninvertingRight22: 22.5, uninvertingRight45: 45 };
type V3 = [number, number, number];
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Turn v about the unit axis k by angle a (radians). */
const turnAbout = (v: V3, k: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), d = dot(k, v) * (1 - c); return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d]; };
/** The way up perpendicular to a direction of travel (world up tipped over), or straight up when level. */
const naturalUp = (t: V3): V3 => { const u: V3 = [-t[2] * t[0], -t[2] * t[1], 1 - t[2] * t[2]]; return Math.hypot(...u) < 1e-6 ? [1, 0, 0] : norm(u); };
const humanName = (key: string) => {
  const w = key.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2').toLowerCase().split(' ');
  const side = w[0] === 'left' || w[0] === 'right' ? w.shift() : null;
  const s = w.join(' ').replace(/\bup (\d+)/g, 'up $1°').replace(/\bdown (\d+)/g, 'down $1°').replace(/\bdiag\b/g, 'diagonal').replace(/\b(\d+) tiles?\b/g, '($1 tiles)').replace(/\btile\b/, '');
  const t = s.charAt(0).toUpperCase() + s.slice(1); return side ? `${t} (${side})` : t;
};
const FLAG = (bits: number) => FLAGS.filter((_, i) => bits & (1 << i)) as string[];

function rctPiece(row: typeof RCT_PIECES[number]): PieceDef {
  const [key, c, , , , price, , flagBits, gi, ps, pe, rs, re, spin, vf, lf, blk, path] = row;
  const [rb, rEnd, zb, ze, cx, cy] = c; const flags = FLAG(flagBits); const group = GROUPS[gi] as string;
  // RCT's world is our tiles mirrored in x (its direction 0 heads -x, ours +x); its units are 32 a tile and 8 a height unit
  const blocks: PieceBlock[] = []; const tiles: [number, number][] = [];
  for (let i = 0; i < blk.length; i += 6) { const bx = -blk[i] / 32, by = blk[i + 1] / 32; blocks.push({ x: bx, y: by, lo: (blk[i + 2] - zb) / 8, hi: (blk[i + 2] + blk[i + 3] - zb) / 8, q: blk[i + 4] || 15 }); if (!tiles.some(t => t[0] === bx && t[1] === by)) tiles.push([bx, by]); }
  const endDir = (rEnd & 3) as Dir, diagOut = !!(rEnd & 4), diagIn = !!(rb & 4);
  const ex = -cx / 32, ey = cy / 32; const end: [number, number] = diagOut ? [ex, ey] : [ex + DX[endDir], ey + DY[endDir]];
  // the car's path, in our frame, with its up direction
  const pts = decodePath(path); const n = pts.length;
  const P: V3[] = pts.map(([x, y, z]) => [(32 - x) / 32, y / 32, (z + blk[2] - zb) / 8]);   // a car's height is measured from the piece's first block
  const W = (p: V3): V3 => [p[0] * TILE_M, p[1] * TILE_M, p[2] * UNIT_M];   // metres
  const tangent = (i: number): V3 => { const a = W(P[Math.max(0, i - 1)]), b = W(P[Math.min(n - 1, i + 1)]); return norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); };
  const corkRun = pts.map(q => RCT_PITCH[q[4]].startsWith('corkscrew'));
  const ups: V3[] = pts.map(([, , , yaw, pi, ri], i) => {
    const pn = RCT_PITCH[pi] as string, rn = RCT_ROLL[ri] as string; const T = tangent(i);
    if (corkRun[i]) {   // a corkscrew: roll steadily through the run of corkscrew frames, from upright to upside down (or back)
      let a = i, b = i; while (a > 0 && corkRun[a - 1]) a--; while (b < n - 1 && corkRun[b + 1]) b++;
      const f = (i - a + 1) / (b - a + 2); const down = pn.includes('Down'), sign = pn.includes('Right') ? -1 : 1;   // turning about the direction of travel by a positive angle rolls to the left
      return turnAbout(naturalUp(T), T, sign * Math.PI * (down ? 1 - f : f));
    }
    const th = (yaw * Math.PI) / 16; const h: V3 = [Math.cos(th), Math.sin(th), 0];   // heading, already mirrored to our frame
    const p = ((PITCH_DEG[pn] ?? 0) * Math.PI) / 180, r = ((ROLL_DEG[rn] ?? 0) * Math.PI) / 180;
    const up0: V3 = [-Math.sin(p) * h[0], -Math.sin(p) * h[1], Math.cos(p)]; const right: V3 = [-h[1], h[0], 0];
    let u: V3 = [up0[0] * Math.cos(r) + right[0] * Math.sin(r), up0[1] * Math.cos(r) + right[1] * Math.sin(r), up0[2] * Math.cos(r)];
    u = norm([u[0] - dot(u, T) * T[0], u[1] - dot(u, T) * T[1], u[2] - dot(u, T) * T[2]]); return u;
  });
  // smooth the up direction (RCT's angles come in steps) and keep it square to the track
  const sm: V3[] = ups.map((_, i) => { let v: V3 = [0, 0, 0]; for (let k = -3; k <= 3; k++) { const q = ups[Math.min(n - 1, Math.max(0, i + k))]; const w = 4 - Math.abs(k); v = [v[0] + q[0] * w, v[1] + q[1] * w, v[2] + q[2] * w]; } const T = tangent(i); return norm([v[0] - dot(v, T) * T[0], v[1] - dot(v, T) * T[1], v[2] - dot(v, T) * T[2]]); });
  sm[0] = ups[0]; sm[n - 1] = ups[n - 1];   // the ends stay exact, so pieces meet
  // distances as RCT measures them (its metres: 65536 units), two car positions a sample: each move is 8716 along x
  // or y, 6554 up or down, more for a mix (kSubpositionTranslationDistances)
  const moved = (a: number[], b: number[]) => { let d = 0; for (let k = 0; k < 2; k++) { const idx = (Math.abs(b[0] - a[0]) > k ? 1 : 0) | (Math.abs(b[1] - a[1]) > k ? 2 : 0) | (Math.abs(b[2] - a[2]) > k ? 4 : 0); d += STEP_DISTANCE[idx]; } return d / 65536; };
  const samples: Sample[] = []; let s = 0;
  for (let i = 0; i < n; i++) { if (i) s += moved(pts[i - 1], pts[i]); samples.push({ x: P[i][0], y: P[i][1], z: P[i][2], s, ux: sm[i][0], uy: sm[i][1], uz: sm[i][2], pa: ACC_FROM_PITCH[pts[i][4]] ?? 0 }); }
  // the next piece's path starts one step on from this one's last point: count that step in the length, so trains
  // move on smoothly (the paths of consecutive pieces meet without any stretching, as in RCT)
  const zEnd = (ze - zb) / 8; if (n > 1) s += moved(pts[n - 2], pts[n - 1]) / 2;
  // how sharply it turns: horizontal length over the change of heading
  const turn = flags.includes('turnLeft') ? -1 : flags.includes('turnRight') ? 1 : 0;
  let horiz = 0; for (let i = 1; i < samples.length; i++) horiz += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  const dh = (((endDir * 2 + (diagOut ? 1 : 0)) - (diagIn ? 1 : 0)) % 8 + 8) % 8; const turnRad = (dh > 4 ? 8 - dh : dh) * Math.PI / 4;
  const station = group === 'stationEnd';
  return {
    key, name: humanName(key), group, tiles, blocks, end, endDir, diagIn, diagOut, dz: zEnd,
    pitchIn: TRACK_PITCH[ps], pitchOut: TRACK_PITCH[pe], rollIn: TRACK_ROLL[rs], rollOut: TRACK_ROLL[re],
    turn: turn as 0 | 1 | -1, radius: turn && turnRad ? horiz / turnRad : 0, flags,
    loop: group === 'verticalLoop', brakes: /[bB]rakes/.test(group) || group === 'brakeForDrop', booster: /booster/i.test(group), photo: group === 'onridePhoto', station,
    chainable: flags.includes('allowLiftHill') || flags.includes('curveAllowsLift'), bankable: false,
    inversion: flags.includes('normalToInversion'), inverted: flags.includes('normalToInversion') || flags.includes('inversionToNormal') || TRACK_ROLL[rs] === 'upsideDown' || TRACK_ROLL[re] === 'upsideDown',
    banked: flags.includes('banked') || flags.includes('turnBanked') || TRACK_ROLL[rs] === 'left' || TRACK_ROLL[rs] === 'right' || TRACK_ROLL[re] === 'left' || TRACK_ROLL[re] === 'right', helix: flags.includes('helix'), block: /[bB]lockBrakes/.test(group), splash: group === 'waterSplash',
    costMul: price / 65536, steps: 2 * n - 1, samples, length: s, clearance: Math.max(...blocks.map(b => b.hi), zEnd, 0),
    spin: SPINS[spin] as string, vf, lf,
  };
}

// ---------- the old pieces ----------
function legacyPiece(d: LegacyDef): PieceDef {
  const n = d.samples.length; const P: V3[] = d.samples.map(q => [q.x * TILE_M, q.y * TILE_M, q.z * UNIT_M]);
  const samples: Sample[] = d.samples.map((q, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; const T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    // as the old drawing did: up from the world's up, then the piece's own roll (+ = right)
    const u = turnAbout(naturalUp(T), T, -(q.roll ?? 0)); return { x: q.x, y: q.y, z: q.z, s: q.s, ux: u[0], uy: u[1], uz: u[2] };
  });
  const pitch: Pitch = d.slope === 'up' ? 'up25' : d.slope === 'down' ? 'down25' : d.slope === 'steepUp' ? 'up60' : d.slope === 'steepDown' ? 'down60' : 'none';
  return { ...d, steps: 32, group: 'legacy', legacy: true, endDir: d.endDir as Dir, diagIn: false, diagOut: false, pitchIn: pitch, pitchOut: pitch, rollIn: 'none', rollOut: 'none', flags: [], samples,
    blocks: d.tiles.map(([x, y]) => ({ x, y, lo: Math.min(d.dz, 0), hi: Math.max(d.dz, 0) + d.clearance, q: 15 })) };
}

export const PIECES: PieceDef[] = RCT_PIECES.map(rctPiece);
export const PIECE_BY_KEY: Record<string, PieceDef> = Object.fromEntries(PIECES.map(p => [p.key, p]));
for (const d of LEGACY_PIECES) if (!PIECE_BY_KEY[d.key]) { const p = legacyPiece(d); PIECE_BY_KEY[p.key] = p; }   // 'flat', 'brakes', 'booster' and 'blockBrakes' are the same shape in both
export const isStation = (type: string) => !!PIECE_BY_KEY[type]?.station;

// ---------- which piece the construction window builds ----------
/** RCT's choice of piece from where the track ends (diagonal?, pitch, roll) and the window's curve, pitch and bank. */
export function nextPiece(curve: Curve, diag: boolean, pitchIn: Pitch, pitchOut: Pitch, rollIn: Roll, rollOut: Roll): string | null {
  for (const [d, ps, rs, cv, pe, re, el] of RCT_NEXT) if (cv === curve && d === diag && ps === pitchIn && pe === pitchOut && rs === rollIn && re === rollOut) return el;
  return null;
}
/** The track groups a ride type's builder offers (RCT's ride type, e.g. 'wooden_rc'); every group when unknown. */
export const rideGroups = (rct: string | undefined): Set<string> | null => (rct && RIDE_TRACK[rct] ? new Set(RIDE_TRACK[rct].groups) : null);
export { SPECIAL_ORDER, RIDE_TRACK, CURVES };

// ---------- placing pieces ----------
/** rotate a local offset (dir = +x) into world space for a piece heading `dir` */
export function rot(lx: number, ly: number, dir: Dir): [number, number] {
  switch (dir) { case 0: return [lx, ly]; case 1: return [-ly, lx]; case 2: return [-lx, -ly]; default: return [ly, -lx]; }
}
export const turnDir = (dir: Dir, endDir: number): Dir => (((dir + endDir) & 3) as Dir);

/** World tiles covered by a placed piece. */
export function pieceTiles(p: TrackPiece): [number, number][] {
  const def = PIECE_BY_KEY[p.type];
  return def.tiles.map(([lx, ly]) => { const [wx, wy] = rot(lx, ly, p.dir); return [p.x + wx, p.y + wy]; });
}
/** Where the next piece starts, and how the track arrives there. */
export function pieceEnd(p: TrackPiece): { x: number; y: number; z: number; dir: Dir; diag: boolean; pitch: Pitch; roll: Roll } {
  const def = PIECE_BY_KEY[p.type]; const [ex, ey] = rot(def.end[0], def.end[1], p.dir);
  return { x: p.x + ex, y: p.y + ey, z: p.z + def.dz, dir: turnDir(p.dir, def.endDir), diag: def.diagOut, pitch: def.pitchOut, roll: def.rollOut };
}
/** A world-space point on the piece at local sample i (tile units for x/y, height units for z). */
export function pieceSample(p: TrackPiece, smp: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const [wx, wy] = rot(smp.x, smp.y, p.dir);
  // local frame origin is the piece's start tile corner
  return { x: p.x + wx + (p.dir === 1 || p.dir === 2 ? 1 : 0), y: p.y + wy + (p.dir === 2 || p.dir === 3 ? 1 : 0), z: p.z + smp.z };
}
/** A sample's up direction in world space: (x, y) on the map, z up. */
export function sampleUp(p: TrackPiece, smp: Sample): [number, number, number] { const [wx, wy] = rot(smp.ux, smp.uy, p.dir); return [wx, wy, smp.uz]; }
/** Interpolated point at distance s (metres) along the piece. */
export function pointAt(p: TrackPiece, s: number): { x: number; y: number; z: number; slope: number; uz: number; pa: number } {
  const def = PIECE_BY_KEY[p.type]; const S = def.samples;
  let i = 1; while (i < S.length - 1 && S[i].s < s) i++;
  const a = S[i - 1], b = S[i]; const f = b.s === a.s ? 0 : Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s)));
  const l = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
  const w = pieceSample(p, l);
  const dx = Math.hypot((b.x - a.x) * TILE_M, (b.y - a.y) * TILE_M), dz = (b.z - a.z) * UNIT_M;
  return { ...w, slope: Math.atan2(dz, dx || 1e-6), uz: a.uz + (b.uz - a.uz) * f, pa: (f < 0.5 ? a.pa : b.pa) ?? 0 };   // uz: how upright the car is (1 level, -1 upside down)
}
export const pieceLength = (p: TrackPiece) => PIECE_BY_KEY[p.type].length;
/** The space a placed piece fills: per tile, its lowest and highest height unit (clear = the train's head room) and
 *  the quarters of the tile it uses (RCT's quarter tiles, turned with the piece: diagonal track shares tiles). */
export function pieceSpans(p: TrackPiece, clear: number): [number, number, number, number, number][] {
  const def = PIECE_BY_KEY[p.type]; const out: [number, number, number, number, number][] = []; if (def.legacy) clear = 0;   // an old piece's height already counts the train
  for (const b of def.blocks) {
    const [wx, wy] = rot(b.x, b.y, p.dir); const x = p.x + wx, y = p.y + wy; const lo = p.z + b.lo, hi = p.z + b.hi + clear;
    const q = ((b.q << p.dir) | (b.q >> (4 - p.dir))) & 15;
    const same = out.find(o => o[0] === x && o[1] === y); if (same) { same[2] = Math.min(same[2], lo); same[3] = Math.max(same[3], hi); same[4] |= q; } else out.push([x, y, lo, hi, q]);
  }
  return out;
}
/** Do two pieces' spans meet? (same tile, overlapping heights, a quarter in common) */
export const spansMeet = (a: [number, number, number, number, number], b: [number, number, number, number, number]) => a[0] === b[0] && a[1] === b[1] && a[2] < b[3] && a[3] > b[2] && (a[4] & b[4]) !== 0;
/** Can a ride built as this RCT ride type use the piece? (the plain diagonal pieces are open to all) */
export function pieceAllowed(rct: string | undefined, key: string): boolean {
  const def = PIECE_BY_KEY[key]; if (!def || def.legacy) return false; const groups = rideGroups(rct);
  if (key.endsWith('Covered')) return false;   // RCT's covered variants of pieces (other ride styles)
  if (!groups) return true; if (def.group !== 'flat') return groups.has(def.group);
  return flatGate(key).every(gr => groups.has(gr));
}
/** RCT files some pieces under a catch-all group and lets its construction window decide: diagonal track comes with
 *  large curves, banked diagonals with banking, vertical track with vertical slopes. */
function flatGate(key: string): string[] {
  if (/90/.test(key)) return ['slopeVertical'];
  if (/Eighth/.test(key)) return key.includes('Bank') ? ['curveLarge', 'flatRollBanking'] : ['curveLarge'];
  if (key === 'diagFlat') return ['curveLarge'];
  if (key.startsWith('diag')) return /Up25|Down25/.test(key) ? ['curveLarge', 'diagSlope', 'slopeRollBanking'] : ['curveLarge', 'flatRollBanking'];
  if (/QuarterTurn3Tiles/.test(key)) return ['slopeCurveBanked'];
  return ['never'];
}
export { DX, DY };
