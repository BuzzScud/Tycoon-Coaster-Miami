// Ready-made rides: whole track layouts placed in one click, then connected, tested and opened like a hand-built one.
// Each is a list of pieces from the first station piece, heading east; placing it facing another way turns the whole
// layout with it. They are built from RCT's track pieces (the water rides still use the game's older pieces); their openers were
// drawn by hand and closed by the Finish circuit planner, then frozen here; the
// ratings are what a test gives on open, flat ground with no scenery (scenery round the station lifts them).
import type { Dir, GameState, TrackPiece } from './types';
import { tileAt } from './map';
import { PIECE_BY_KEY, pieceEnd, pieceSpans } from './track';
import { cmdStartCoaster, cmdAddPiece, trial, startZ } from './game';
import { RIDE_BY_KEY } from './rides';

export interface Design { key: string; name: string; type: string; blurb: string; pieces: string; e: number; i: number; n: number; size: [number, number] }
export const DESIGNS: Design[] = [
  { key: 'little_dipper', name: 'Little Dipper', type: 'junior_coaster', blurb: 'A first coaster for small parks: a lift, a dip and two banked helices. Gentle enough for nearly everyone.', e: 391, i: 501, n: 320, size: [20, 6],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25 down25 down25 down25ToFlat flatToRightBank rightHalfBankedHelixDownLarge rightBankToFlat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flatToRightBank rightHalfBankedHelixDownLarge rightBankToFlat flat flat flat rightQuarterTurn3Tiles rightQuarterTurn3Tiles flat flat flatToUp25* up25* up25ToFlat* flat flat flat flat flatToDown25 down25ToFlat rightQuarterTurn3Tiles rightQuarterTurn3Tiles' },
  { key: 'switchback', name: 'Switchback', type: 'mine_train', blurb: 'A long mine train that winds through dips and two banked helices. Mild, and long enough to please.', e: 511, i: 578, n: 380, size: [20, 14],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25 down25 down25 down25ToFlat leftQuarterTurn5Tiles flatToLeftBank leftHalfBankedHelixDownLarge leftBankToFlat flat flat rightQuarterTurn5Tiles flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flatToLeftBank leftHalfBankedHelixDownLarge leftBankToFlat leftQuarterTurn3Tiles rightQuarterTurn5Tiles flat flat flat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat leftQuarterTurn3Tiles leftQuarterTurn3Tiles flat flat flat flatToDown25 down25ToFlat flatToUp25* up25* up25ToFlat* rightEighthToDiag diagFlat diagFlat leftEighthToOrthogonal leftQuarterTurn5Tiles leftQuarterTurn3Tiles' },
  { key: 'gold_rush', name: 'Gold Rush', type: 'mine_train', blurb: 'Climbs out of the station, drops into the mine and spirals round two banked helices.', e: 454, i: 587, n: 362, size: [25, 17],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25 down25 down25 down25 down25ToFlat rightQuarterTurn3Tiles flat flat flat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flat flat flat rightQuarterTurn5Tiles flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flatToRightBank rightHalfBankedHelixDownLarge rightBankToFlat leftQuarterTurn5Tiles flatToLeftBank bankedLeftQuarterTurn5Tiles leftBankToFlat flat flat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flat flat flat flatToRightBank rightHalfBankedHelixDownLarge rightBankToFlat flat flatToUp25* up25ToFlat*' },
  { key: 'timber_rattler', name: 'Timber Rattler', type: 'wooden_coaster', blurb: 'A wooden coaster: an 11 m first drop, camelback hills full of air time, and a banked helix.', e: 529, i: 679, n: 393, size: [27, 15],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25 down25 down25 down25 down25 down25 down25ToFlat flatToLeftBank bankedLeftQuarterTurn5Tiles leftBankToFlat flatToUp25 up25 up25 up25ToFlat flatToDown25 down25 down25 down25ToFlat leftQuarterTurn5Tiles leftQuarterTurn5Tiles rightQuarterTurn5Tiles flat flat flat flatToUp25 up25 up25 up25ToFlat flatToDown25 down25 down25 down25ToFlat leftQuarterTurn5Tiles flatToRightBank rightHalfBankedHelixDownLarge rightBankToFlat flat flat flat rightQuarterTurn3Tiles rightQuarterTurn3Tiles flatToDown25 down25ToFlat flatToDown25 down25ToFlat rightQuarterTurn3Tiles leftQuarterTurn3Tiles flatToLeftBank leftBankToLeftQuarterTurn3TilesUp25 up25ToFlat*' },
  { key: 'twister_loop', name: 'Twister Loop', type: 'steel_twister', blurb: 'A steep drop, a corkscrew, a vertical loop and a banked helix. The crowd-pleaser.', e: 535, i: 804, n: 449, size: [28, 19],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25ToDown60 down60 down60 down60ToDown25 down25ToFlat rightCorkscrewUp rightCorkscrewDown flat flatToUp25 leftVerticalLoop down25ToFlat flatToLeftBank bankedLeftQuarterTurn5Tiles leftBankToFlat flat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat flatToRightBank rightHalfBankedHelixDownLarge rightBankToFlat leftQuarterTurn5Tiles rightQuarterTurn5Tiles leftQuarterTurn5Tiles rightQuarterTurn3Tiles flat leftQuarterTurn3Tiles rightQuarterTurn3Tiles rightQuarterTurn3Tiles' },
  { key: 'hangman', name: 'The Hangman', type: 'inverted_coaster', blurb: 'Feet dangling: a long plunge into two corkscrews under the track. For thrill-seekers.', e: 568, i: 720, n: 586, size: [30, 15],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25* up25* up25* up25* up25ToFlat* flatToDown25 down25 down25 down25 down25 down25 down25 down25ToFlat rightCorkscrewUp rightCorkscrewDown flatToRightBank bankedRightQuarterTurn5Tiles rightBankToFlat flatToRightBank bankedRightQuarterTurn5Tiles rightBankToFlat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat rightCorkscrewUp rightCorkscrewDown leftQuarterTurn3Tiles flat flat flatToUp25 up25 up25ToFlat flatToDown25 down25 down25ToFlat rightQuarterTurn3Tiles rightQuarterTurn5Tiles leftQuarterTurn5Tiles rightQuarterTurn5Tiles leftQuarterTurn5Tiles flatToDown25 down25ToFlat leftEighthToDiag rightEighthToOrthogonal leftEighthToDiag rightEighthToOrthogonal rightQuarterTurn5Tiles rightQuarterTurn3Tiles' },
  { key: 'log_jam', name: 'Log Jam', type: 'log_flume', blurb: 'Up the lift, through the bends and S-bends, and down with a splash. Busiest on hot days.', e: 312, i: 184, n: 89, size: [17, 9],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25ToFlat* sBendRight flat flat rightQuarterTurn3Tiles rightQuarterTurn3Tiles flat sBendLeft flat rightQuarterTurn3Tiles leftQuarterTurn3Tiles flat flat flat leftQuarterTurn3Tiles sBendLeft rightQuarterTurn3Tiles rightQuarterTurn3Tiles flatToDown25 down25 down25 down25 down25ToFlat rightQuarterTurn3Tiles' },
  { key: 'rapids_run', name: 'Rapids Run', type: 'river_rapids', blurb: 'Round rafts spin down a long river, under waterfalls and through whirlpools.', e: 273, i: 127, n: 90, size: [18, 12],
    pieces: 'endStation endStation endStation flatToUp25* up25* up25* up25* up25ToFlat* leftQuarterTurn1Tile leftQuarterTurn1Tile flat rightQuarterTurn1Tile waterfall leftQuarterTurn1Tile flat flat waterfall rightQuarterTurn1Tile flatToDown25 down25ToFlat rightQuarterTurn1Tile flatToDown25 down25 down25ToFlat whirlpool flatToDown25 down25ToFlat flat flat leftQuarterTurn1Tile flat rightQuarterTurn1Tile leftQuarterTurn1Tile flat rightQuarterTurn1Tile whirlpool flat flat rightQuarterTurn1Tile flat flat flat flat flat flat flat flat flat rightQuarterTurn1Tile flat flat flat flat flat flat flat flat flat flat leftQuarterTurn1Tile rightQuarterTurn1Tile flat flat flat flat flat rightQuarterTurn1Tile rightQuarterTurn1Tile' },
  { key: 'park_express', name: 'Park Express', type: 'mini_railway', blurb: 'A little steam train on a loop of track. For everyone, and a rest for tired legs.', e: 303, i: 28, n: 3, size: [11, 9],
    pieces: 'endStation endStation endStation leftQuarterTurn5Tiles flat flat flat leftQuarterTurn3Tiles flat flat flat leftQuarterTurn5Tiles rightQuarterTurn3Tiles rightQuarterTurn3Tiles flat flat rightQuarterTurn3Tiles flat flatToUp25* up25* up25ToFlat* rightQuarterTurn3Tiles flatToDown25 down25ToFlat rightQuarterTurn3Tiles flatToDown25 down25ToFlat leftQuarterTurn3Tiles leftQuarterTurn3Tiles flat' },
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
    const z0 = designPieces(g, key, x, y, dir)[0]?.z; const st = cmdStartCoaster(g, d.type, x, y, dir, z0); if (!st.ok) { why = st.error; return false; }
    const ride = g.rides[g.rides.length - 1]; rideId = ride.id; const steps = designSteps(d);
    for (let i = 1; i < steps.length; i++) { const s = steps[i]; const r = cmdAddPiece(g, ride.id, s.type, s.chain, s.bank); if (!r.ok) { why = `${r.error} (piece ${i + 1} of ${steps.length})`; return false; } }
    if (!ride.closedLoop) { why = 'The layout did not close here'; return false; }
    ride.name = uniqueName(g, d.name); return true;
  }, 'build ' + d.name);
  return ok ? { ok, rideId, cost: cash - g.finance.cash } : { ok, why, cost: 0 };
}
/** The layout's pieces where they would stand, without building anything (for the preview). */
export function designPieces(g: GameState, key: string, x: number, y: number, dir: Dir): TrackPiece[] {
  const d = DESIGN_BY_KEY[key]; const t = tileAt(g, x, y); if (!d || !t) return [];
  const lay = (z: number) => { let at = { x, y, z, dir }; const out: TrackPiece[] = []; for (const s of designSteps(d)) { const p: TrackPiece = { type: s.type, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: s.chain, bank: s.bank }; out.push(p); at = pieceEnd(p); } return out; };
  const z = startZ(g, d.type, x, y); const low = Math.min(...lay(z).flatMap(p => pieceSpans(p, 0).map(sp => sp[2])));
  return lay(z + Math.max(0, z - low));   // raised so the lowest dip stays above the ground
}
/** What the design costs to build (the station, then every piece at this type's piece price). */
export function designCost(d: Design): number { const def = RIDE_BY_KEY[d.type]; const per = def.coaster?.pieceCost ?? 3000; return def.cost + designSteps(d).reduce((a, s) => a + Math.round(per * PIECE_BY_KEY[s.type].costMul), 0); }
function uniqueName(g: GameState, base: string): string { if (!g.rides.some(r => r.name === base)) return base; let n = 2; while (g.rides.some(r => r.name === `${base} ${n}`)) n++; return `${base} ${n}`; }
