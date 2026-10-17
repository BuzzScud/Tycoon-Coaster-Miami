// Ready-made rides: whole track layouts placed in one click, then connected, tested and opened like a hand-built one.
// Each is a list of pieces from the first station piece, heading east; placing it facing another way turns the whole
// layout with it. They are built from RCT's track pieces (the water rides still use the game's older pieces); their openers were
// drawn by hand and closed by the Finish circuit planner, then frozen here; the
// ratings are what a test gives on open, flat ground with no scenery (scenery round the station lifts them).
import type { Dir, GameState, TrackPiece } from './types';
import { tileAt, landTop } from './map';
import { PIECE_BY_KEY, pieceEnd } from './track';
import { cmdStartCoaster, cmdAddPiece, trial } from './game';
import { RIDE_BY_KEY } from './rides';

export interface Design { key: string; name: string; type: string; blurb: string; pieces: string; e: number; i: number; n: number; size: [number, number] }
export const DESIGNS: Design[] = [
  { key: 'little_dipper', name: 'Little Dipper', type: 'junior_coaster', blurb: 'A first coaster for small parks: one dip, a sweeping bend, gentle enough for nearly everyone.', e: 446, i: 775, n: 386, size: [17, 8],
    pieces: 'endStation endStation flatToUp25* up25* up25* up25* up25ToFlat* flatToDown25 down25 down25 down25ToFlat flat rightQuarterTurn5Tiles flat flatToDown25 down25ToFlat rightQuarterTurn3Tiles rightQuarterTurn5Tiles leftQuarterTurn3Tiles flat flat flat flat flat flat flat flat flat rightQuarterTurn3Tiles rightQuarterTurn3Tiles' },
  { key: 'switchback', name: 'Switchback', type: 'mine_train', blurb: 'A twisting mine train that zig-zags down the hillside. Very mild; fits in a corner.', e: 529, i: 759, n: 443, size: [13, 7],
    pieces: 'endStation endStation flatToUp25* up25* up25* up25* up25* up25ToFlat* rightQuarterTurn3Tiles rightQuarterTurn3Tiles flatToDown25 down25ToFlat leftQuarterTurn3Tiles leftQuarterTurn3Tiles flatToDown25 down25ToFlat flat leftQuarterTurn3Tiles flat leftQuarterTurn5Tiles flatToDown25 down25 down25 down25ToFlat leftQuarterTurn3Tiles rightQuarterTurn3Tiles rightQuarterTurn5Tiles rightQuarterTurn3Tiles' },
  { key: 'gold_rush', name: 'Gold Rush', type: 'mine_train', blurb: 'Climbs out of the station and spirals down a full helix into the mine.', e: 546, i: 779, n: 445, size: [22, 8],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25ToFlat leftQuarterTurn5Tiles flatToRightBank rightHalfBankedHelixDownLarge rightHalfBankedHelixDownLarge rightBankToFlat flat leftQuarterTurn3Tiles leftQuarterTurn5Tiles flat rightQuarterTurn5Tiles flatToDown25 down25 down25 down25ToFlat rightQuarterTurn3Tiles leftQuarterTurn3Tiles leftQuarterTurn5Tiles leftQuarterTurn3Tiles' },
  { key: 'timber_rattler', name: 'Timber Rattler', type: 'wooden_coaster', blurb: 'A tall wooden out-and-back: a big first drop, then camelback hills full of air time.', e: 496, i: 1063, n: 528, size: [35, 6],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25ToDown60 down60 down60ToDown25 down25ToFlat flat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flatToUp25 up25ToFlat flatToDown25 down25ToFlat flatToLeftBank bankedLeftQuarterTurn5Tiles leftBankToFlat leftQuarterTurn3Tiles leftQuarterTurn5Tiles rightQuarterTurn3Tiles flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat flat rightQuarterTurn3Tiles leftQuarterTurn3Tiles leftQuarterTurn5Tiles leftQuarterTurn3Tiles' },
  { key: 'twister_loop', name: 'Twister Loop', type: 'steel_twister', blurb: 'Drop, vertical loop, corkscrew, then a second lift into a helix. The crowd-pleaser.', e: 440, i: 1185, n: 476, size: [28, 11],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25ToDown60 down60 down60 down60ToDown25 down25ToFlat rightCorkscrewUp rightCorkscrewDown flat flatToUp25 leftVerticalLoop down25ToFlat flatToLeftBank bankedLeftQuarterTurn5Tiles leftBankToFlat flat rightQuarterTurn3Tiles rightQuarterTurn5Tiles leftQuarterTurn5Tiles flat flat flat flat flat flat flatToDown25 down25ToFlat rightQuarterTurn5Tiles flat rightQuarterTurn3Tiles' },
  { key: 'hangman', name: 'The Hangman', type: 'inverted_coaster', blurb: 'Feet dangling: a plunge into a corkscrew under the track and a banked sweep home. For thrill-seekers.', e: 300, i: 1228, n: 684, size: [24, 11],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25ToDown60 down60 down60ToDown25 down25ToFlat leftCorkscrewUp leftCorkscrewDown flat flatToRightBank bankedRightQuarterTurn5Tiles rightBankToFlat flat brakes leftQuarterTurn3Tiles leftQuarterTurn5Tiles rightQuarterTurn5Tiles flat flat flat flat flat flat flatToDown25 down25 down25ToFlat leftQuarterTurn3Tiles flat flat leftQuarterTurn3Tiles' },
  { key: 'log_jam', name: 'Log Jam', type: 'log_flume', blurb: 'Up the conveyor, round the bend, and down into a big splash. Busiest on hot days.', e: 378, i: 576, n: 257, size: [10, 6],
    pieces: 'station station flat up* up* up* flat turnR2> flat down flat turnDownR> flat down down splash flat turnR2> up* turnL< turnR2> turnR>' },
  { key: 'rapids_run', name: 'Rapids Run', type: 'river_rapids', blurb: 'Rafts for eight spin down a rocky river through two splashes.', e: 497, i: 567, n: 318, size: [10, 13],
    pieces: 'station station flat up* up* up* flat turnL2< down flat turnDownL< flat helixDownR> splash flat down flat splash flat turnL< turnL2< up* turnR2> turnL2< flat flat flat flat flat turnR> turnL< turnL<' },
  { key: 'park_express', name: 'Park Express', type: 'mini_railway', blurb: 'A little steam train on a loop of track. For everyone, and a rest for tired legs.', e: 289, i: 299, n: 132, size: [10, 13],
    pieces: 'endStation endStation endStation flat flat rightQuarterTurn5Tiles flat flat flat flatToUp25 up25ToFlat flatToDown25 down25ToFlat flat rightQuarterTurn3Tiles rightQuarterTurn5Tiles flat flat flat leftQuarterTurn5Tiles rightQuarterTurn5Tiles rightQuarterTurn3Tiles' },
];
export const DESIGN_BY_KEY: Record<string, Design> = Object.fromEntries(DESIGNS.map(d => [d.key, d]));

/** The design's pieces as build steps (key, chain lift, bank). */
export function designSteps(d: Design): { type: string; chain: boolean; bank: -1 | 0 | 1 }[] {
  return d.pieces.split(/\s+/).filter(Boolean).map(tok => { const m = tok.match(/^(\w+)(\*?)([<>]?)$/)!; return { type: m[1], chain: !!m[2], bank: (m[3] === '<' ? -1 : m[3] === '>' ? 1 : 0) as -1 | 0 | 1 }; });
}
/** Build a whole design with its first station piece at (x, y) heading `dir`, as one undo step. */
export function cmdBuildDesign(g: GameState, key: string, x: number, y: number, dir: Dir): { ok: boolean; why?: string; rideId?: number; cost: number } {
  const d = DESIGN_BY_KEY[key]; if (!d) return { ok: false, why: 'Unknown design', cost: 0 };
  if (!g.research.invented.includes(d.type)) return { ok: false, why: `${RIDE_BY_KEY[d.type].name} not yet researched`, cost: 0 };
  const cash = g.finance.cash; let why = ''; let rideId: number | undefined;
  const ok = trial(() => {
    const st = cmdStartCoaster(g, d.type, x, y, dir); if (!st.ok) { why = st.error; return false; }
    const ride = g.rides[g.rides.length - 1]; rideId = ride.id; const steps = designSteps(d);
    for (let i = 1; i < steps.length; i++) { const s = steps[i]; const r = cmdAddPiece(g, ride.id, s.type, s.chain, s.bank); if (!r.ok) { why = `${r.error} (piece ${i + 1} of ${steps.length})`; return false; } }
    if (!ride.closedLoop) { why = 'The layout did not close here'; return false; }
    ride.name = uniqueName(g, d.name); return true;
  }, 'build ' + d.name);
  return ok ? { ok, rideId, cost: cash - g.finance.cash } : { ok, why, cost: 0 };
}
/** The layout's pieces where they would stand, without building anything (for the preview). */
export function designPieces(g: GameState, key: string, x: number, y: number, dir: Dir): TrackPiece[] {
  const d = DESIGN_BY_KEY[key]; const t = tileAt(g, x, y); if (!d || !t) return []; let at = { x, y, z: landTop(t) + 2, dir }; const out: TrackPiece[] = [];
  for (const s of designSteps(d)) { const p: TrackPiece = { type: s.type, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: s.chain, bank: s.bank }; out.push(p); at = pieceEnd(p); }
  return out;
}
/** What the design costs to build (the station, then every piece at this type's piece price). */
export function designCost(d: Design): number { const def = RIDE_BY_KEY[d.type]; const per = def.coaster?.pieceCost ?? 3000; return def.cost + designSteps(d).reduce((a, s) => a + Math.round(per * PIECE_BY_KEY[s.type].costMul), 0); }
function uniqueName(g: GameState, base: string): string { if (!g.rides.some(r => r.name === base)) return base; let n = 2; while (g.rides.some(r => r.name === `${base} ${n}`)) n++; return `${base} ${n}`; }
