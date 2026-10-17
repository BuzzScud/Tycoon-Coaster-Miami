// Coaster track pieces: geometry in a local frame where the train enters at (0, 0.5) heading +x.
// Each piece knows the tiles it covers, where the next piece starts, and a sampled centre line for
// drawing and for the train physics. Heights are in height units (8 px, 1.5 m).
import { DX, DY, TILE_M, UNIT_M, type Dir, type TrackPiece } from './types';

export interface Sample { x: number; y: number; z: number; s: number; roll?: number; }   // local tile units, z units, s = arc length (tiles-equivalent in metres below); roll = radians about the travel direction (+ = right)
export interface PieceDef {
  key: string; name: string; group: 'straight' | 'slope' | 'turn' | 'special' | 'station';
  tiles: [number, number][];    // covered tiles (local, dir = +x)
  end: [number, number];        // tile where the next piece starts (local)
  endDir: 0 | 1 | 3;            // direction change (local): 0 straight, 1 right, 3 left
  dz: number;                   // height change over the piece
  slope: 'flat' | 'up' | 'down' | 'steepUp' | 'steepDown';
  turn: 0 | 1 | -1;             // 1 right, -1 left (per quarter)
  radius: number;               // turn radius in tiles (0 = straight)
  loop?: boolean; brakes?: boolean; booster?: boolean; photo?: boolean; station?: boolean; chainable?: boolean; bankable?: boolean;
  inversion?: boolean;          // riders go upside down (loops, corkscrews)
  helix?: boolean;              // a sloped large turn: chained, they make a helix
  block?: boolean;              // block brakes: a train waits here while the next section is occupied
  splash?: boolean;             // a water splash: the boat ploughs through and slows right down (water rides)
  costMul: number;
  samples: Sample[];            // centre line, s in metres
  length: number;               // metres
  clearance: number;            // height units the piece needs above its start
}

function straight(key: string, name: string, dz: number, slope: PieceDef['slope'], extra: Partial<PieceDef> = {}): PieceDef {
  const n = 6; const samples: Sample[] = [];
  const len = Math.hypot(TILE_M, dz * UNIT_M);
  for (let i = 0; i <= n; i++) samples.push({ x: i / n, y: 0.5, z: dz * i / n, s: len * i / n });
  return { key, name, group: dz ? 'slope' : 'straight', tiles: [[0, 0]], end: [1, 0], endDir: 0, dz, slope, turn: 0, radius: 0, costMul: 1, samples, length: len, clearance: Math.max(2, dz) + 2, chainable: dz > 0, ...extra };
}
function turn(key: string, name: string, right: boolean, large: boolean, dz = 0): PieceDef {
  // small: quarter circle of radius 0.5 inside one tile; large: radius 1.5 over a 2x2 block; dz climbs or falls evenly along it
  const r = large ? 1.5 : 0.5; const n = large ? 10 : 6; const samples: Sample[] = [];
  const sign = right ? 1 : -1; const arc = (Math.PI / 2) * r * TILE_M; const len = Math.hypot(arc, dz * UNIT_M);
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * i / n;
    // centre of the arc is at (0, 0.5 + sign*r): start heading +x, end heading +y (right) or -y (left)
    samples.push({ x: r * Math.sin(a), y: 0.5 + sign * r - sign * r * Math.cos(a), z: dz * i / n, s: len * i / n });
  }
  const tiles: [number, number][] = large ? (right ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [1, 0], [1, -1], [0, -1]]) : [[0, 0]];
  const end: [number, number] = large ? (right ? [1, 2] : [1, -2]) : (right ? [0, 1] : [0, -1]);
  return { key, name, group: 'turn', tiles, end, endDir: right ? 1 : 3, dz, slope: dz > 0 ? 'up' : dz < 0 ? 'down' : 'flat', turn: right ? 1 : -1, radius: r, costMul: (large ? 2 : 1) * (dz ? 1.4 : 1), samples, length: len, clearance: Math.max(2, dz) + 2, bankable: true, chainable: dz > 0, helix: large && dz !== 0 };
}
/** A corkscrew: the train rolls a full turn round a line at the riders' hearts, three tiles long; the track itself
 *  swings out to the side and over the top while the riders' heads stay on the line. */
function corkscrew(right: boolean): PieceDef {
  const n = 24; const R = 2.25; const rl = R / TILE_M, rv = R / UNIT_M; const samples: Sample[] = []; let len = 0; const sign = right ? 1 : -1;
  for (let i = 0; i <= n; i++) {
    const th = (2 * Math.PI * i) / n; const x = 3 * i / n, y = 0.5 - sign * rl * Math.sin(th), z = rv * (1 - Math.cos(th));
    if (i) { const p = samples[i - 1]; len += Math.hypot((x - p.x) * TILE_M, (y - p.y) * TILE_M, (z - p.z) * UNIT_M); }
    samples.push({ x, y, z, s: len, roll: sign * th });
  }
  return { key: right ? 'corkscrewR' : 'corkscrewL', name: right ? 'Corkscrew right' : 'Corkscrew left', group: 'special', tiles: [[0, 0], [1, 0], [2, 0]], end: [3, 0], endDir: 0, dz: 0, slope: 'flat', turn: 0, radius: 0, inversion: true, costMul: 5, samples, length: len, clearance: Math.ceil(2 * rv) + 3 };
}
function sbend(key: string, name: string, right: boolean): PieceDef {
  const n = 10; const samples: Sample[] = []; const sign = right ? 1 : -1; let len = 0;
  for (let i = 0; i <= n; i++) { const t = i / n; const x = 2 * t; const y = 0.5 + sign * (0.5 - 0.5 * Math.cos(Math.PI * t)); if (i) len += Math.hypot(x - samples[i - 1].x, y - samples[i - 1].y) * TILE_M; samples.push({ x, y, z: 0, s: len }); }
  return { key, name, group: 'turn', tiles: right ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [0, -1], [1, -1]], end: [2, right ? 1 : -1], endDir: 0, dz: 0, slope: 'flat', turn: 0, radius: 1.2, costMul: 2, samples, length: len, clearance: 4 };
}
function loop(): PieceDef {
  // vertical loop over two tiles: up, over the top (upside down), back down, out the far side
  const n = 24; const samples: Sample[] = []; const R = 4; // radius in height units (6 m)
  let len = 0;
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI) * i / n;                              // 0 at the bottom entry
    const x = (2 * i) / n + (R * UNIT_M / TILE_M) * Math.sin(a);  // forward position in tiles: drifts 0 → 2 through the loop, so it ends where the next piece starts
    const z = R - R * Math.cos(a);
    if (i) len += Math.hypot((x - samples[i - 1].x) * TILE_M, (z - samples[i - 1].z) * UNIT_M);
    samples.push({ x, y: 0.5, z, s: len });
  }
  return { key: 'loop', name: 'Vertical loop', group: 'special', tiles: [[0, 0], [1, 0]], end: [2, 0], endDir: 0, dz: 0, slope: 'flat', turn: 0, radius: 0, loop: true, inversion: true, costMul: 6, samples, length: len, clearance: 2 * 4 + 3 };
}

export const PIECES: PieceDef[] = [
  straight('station', 'Station platform', 0, 'flat', { group: 'station', station: true, costMul: 2, chainable: false }),
  straight('flat', 'Straight', 0, 'flat'),
  straight('up', 'Slope up', 2, 'up'),
  straight('down', 'Slope down', -2, 'down'),
  straight('steepUp', 'Steep slope up', 6, 'steepUp', { costMul: 1.5 }),
  straight('steepDown', 'Steep slope down', -6, 'steepDown', { costMul: 1.5 }),
  turn('turnL', 'Small turn left', false, false), turn('turnR', 'Small turn right', true, false),
  turn('turnL2', 'Large turn left', false, true), turn('turnR2', 'Large turn right', true, true),
  sbend('sbendL', 'S-bend left', false), sbend('sbendR', 'S-bend right', true),
  loop(),
  straight('brakes', 'Brakes', 0, 'flat', { brakes: true, costMul: 1.5, chainable: false }),
  straight('booster', 'Booster', 0, 'flat', { booster: true, costMul: 2, chainable: false }),
  straight('photo', 'On-ride photo', 0, 'flat', { photo: true, costMul: 3, chainable: false }),
  turn('turnUpL', 'Small turn left, up', false, false, 2), turn('turnUpR', 'Small turn right, up', true, false, 2),
  turn('turnDownL', 'Small turn left, down', false, false, -2), turn('turnDownR', 'Small turn right, down', true, false, -2),
  turn('helixUpL', 'Helix left, up', false, true, 2), turn('helixUpR', 'Helix right, up', true, true, 2),
  turn('helixDownL', 'Helix left, down', false, true, -2), turn('helixDownR', 'Helix right, down', true, true, -2),
  corkscrew(false), corkscrew(true),
  straight('blockBrakes', 'Block brakes', 0, 'flat', { brakes: true, block: true, costMul: 2, chainable: false }),
  straight('splash', 'Splash', 0, 'flat', { splash: true, costMul: 2, chainable: false }),
];
export const PIECE_BY_KEY: Record<string, PieceDef> = Object.fromEntries(PIECES.map(p => [p.key, p]));

/** rotate a local offset (dir = +x) into world space for a piece heading `dir` */
export function rot(lx: number, ly: number, dir: Dir): [number, number] {
  switch (dir) { case 0: return [lx, ly]; case 1: return [-ly, lx]; case 2: return [-lx, -ly]; default: return [ly, -lx]; }
}
export const turnDir = (dir: Dir, endDir: 0 | 1 | 3): Dir => (((dir + endDir) & 3) as Dir);

/** World tiles covered by a placed piece. */
export function pieceTiles(p: TrackPiece): [number, number][] {
  const def = PIECE_BY_KEY[p.type];
  return def.tiles.map(([lx, ly]) => { const [wx, wy] = rot(lx, ly, p.dir); return [p.x + wx, p.y + wy]; });
}
/** Where the next piece starts. */
export function pieceEnd(p: TrackPiece): { x: number; y: number; z: number; dir: Dir } {
  const def = PIECE_BY_KEY[p.type]; const [ex, ey] = rot(def.end[0], def.end[1], p.dir);
  return { x: p.x + ex, y: p.y + ey, z: p.z + def.dz, dir: turnDir(p.dir, def.endDir) };
}
/** A world-space point on the piece at local sample index i (tile units for x/y, height units for z). */
export function pieceSample(p: TrackPiece, smp: Sample): { x: number; y: number; z: number } {
  const [wx, wy] = rot(smp.x, smp.y, p.dir);
  // local frame origin is the piece's start tile corner; (0, 0.5) is the entry point on the tile's edge
  return { x: p.x + wx + (p.dir === 1 || p.dir === 2 ? 1 : 0), y: p.y + wy + (p.dir === 2 || p.dir === 3 ? 1 : 0), z: p.z + smp.z };
}
/** Interpolated point at distance s (metres) along the piece. */
export function pointAt(p: TrackPiece, s: number): { x: number; y: number; z: number; slope: number } {
  const def = PIECE_BY_KEY[p.type]; const S = def.samples;
  let i = 1; while (i < S.length - 1 && S[i].s < s) i++;
  const a = S[i - 1], b = S[i]; const f = b.s === a.s ? 0 : Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s)));
  const l = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, s };
  const w = pieceSample(p, l);
  const dx = Math.hypot((b.x - a.x) * TILE_M, (b.y - a.y) * TILE_M), dz = (b.z - a.z) * UNIT_M;
  return { ...w, slope: Math.atan2(dz, dx || 1e-6) };
}
export const pieceLength = (p: TrackPiece) => PIECE_BY_KEY[p.type].length;
export { DX, DY };
