// RCT track (stage 2 of the authentic round): every RCT2 piece from OpenRCT2's tables, how pieces chain, the
// construction window's choice of piece, ride types' allowed pieces, Finish circuit with them, and old tracks loading.
import { describe, it, expect } from 'vitest';
import { newGame, cmdStartCoaster, cmdAddPiece, coasterCursor } from '../src/sim/game';
import { tileAt } from '../src/sim/map';
import { PIECES, PIECE_BY_KEY, pieceEnd, pieceSample, nextPiece, pieceAllowed } from '../src/sim/track';
import { buildCircuit } from '../src/sim/autotrack';
import { simulateTest } from '../src/sim/ridesim';
import { serialize, deserialize } from '../src/sim/save';
import type { Dir, GameState } from '../src/sim/types';

function park(seed: number): GameState {
  const g = newGame({ name: 'T', size: 'large', cash: 50_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed, goalMinutes: 0 });
  for (const t of g.tiles) { t.h = 6; delete t.slope; t.water = false; delete t.wz; t.owned = true; t.scenery = null; t.paths = []; }
  g.research.invented.push('steel_twister', 'wooden_coaster', 'inverted_coaster', 'junior_coaster', 'mine_train');
  return g;
}

describe('RCT pieces', () => {
  it('all 350 RCT2 pieces load, and the everyday ones flow into the next piece without a gap, every way round', () => {
    expect(PIECES.filter(p => !p.legacy).length).toBe(350);
    const everyday = PIECES.filter(p => ['straight', 'stationEnd', 'slope', 'slopeSteepUp', 'slopeSteepDown', 'curve', 'curveSmall', 'curveVerySmall', 'curveLarge', 'slopeCurve', 'flatRollBanking', 'verticalLoop', 'corkscrew', 'helixUpBankedHalf', 'helixDownBankedHalf', 'brakes', 'blockBrakes', 'sBend', 'flat'].includes(p.group) && !/^(maze|flatTrack|minigolf)/.test(p.key));
    expect(everyday.length).toBeGreaterThan(80);
    for (const A of everyday) for (const dir of [0, 1, 2, 3] as Dir[]) {
      const pa = { type: A.key, x: 30, y: 30, z: 40, dir, chain: false, bank: 0 as const }; const e = pieceEnd(pa);
      const nk = nextPiece('none', e.diag, e.pitch, e.pitch, e.roll, e.roll); if (!nk) continue;
      const a = pieceSample(pa, A.samples[A.samples.length - 1]), b = pieceSample({ type: nk, x: e.x, y: e.y, z: e.z, dir: e.dir, chain: false, bank: 0 }, PIECE_BY_KEY[nk].samples[0]);
      expect(Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) / 4), `${A.key} → ${nk}`).toBeLessThan(0.15);
    }
  });
  it('the construction window builds the transition first: level to up is "flat to up 25°", then "up 25°", then a climbing turn', () => {
    expect(nextPiece('none', false, 'none', 'up25', 'none', 'none')).toBe('flatToUp25');
    expect(nextPiece('none', false, 'up25', 'up25', 'none', 'none')).toBe('up25');
    expect(nextPiece('rightSmall', false, 'up25', 'up25', 'none', 'none')).toBe('rightQuarterTurn3TilesUp25');
    expect(nextPiece('none', false, 'none', 'none', 'none', 'left')).toBe('flatToLeftBank');
    expect(nextPiece('leftLarge', false, 'none', 'none', 'none', 'none')).toBe('leftEighthToDiag');
  });
  it('a piece must start the way the track ends, and a ride type builds only its own pieces', () => {
    const g = park(3); expect(cmdStartCoaster(g, 'steel_twister', 40, 40, 0).ok).toBe(true); const r = g.rides[0];
    expect(cmdAddPiece(g, r.id, 'endStation', false).ok).toBe(true);
    expect(cmdAddPiece(g, r.id, 'leftVerticalLoop', false).ok).toBe(false);   // a loop starts climbing at 25°
    expect(cmdAddPiece(g, r.id, 'flatToUp25', false).ok).toBe(true);
    expect(cmdAddPiece(g, r.id, 'leftVerticalLoop', false).ok).toBe(true);
    expect(pieceAllowed('junior_rc', 'leftVerticalLoop')).toBe(false); expect(pieceAllowed('wooden_rc', 'leftVerticalLoop')).toBe(true);
    expect(pieceAllowed('twister_rc', 'leftCorkscrewUp')).toBe(true); expect(pieceAllowed('mine_train_rc', 'leftCorkscrewUp')).toBe(false);
  });
  it('a lift, a steep drop, a loop and a banked turn, closed by Finish circuit: the train gets round, upside down twice, at sane G', () => {
    const g = park(5); expect(cmdStartCoaster(g, 'steel_twister', 40, 60, 0).ok).toBe(true); const r = g.rides[0];
    const add = (k: string, chain = false) => { const res = cmdAddPiece(g, r.id, k, chain); if (!res.ok) throw new Error(k + ': ' + res.error); };
    add('endStation'); add('endStation'); add('flatToUp25', true); for (let i = 0; i < 14; i++) add('up25', true); add('up25ToFlat', true);
    add('flatToDown25'); add('down25ToDown60'); add('down60'); add('down60'); add('down60ToDown25'); add('down25ToFlat');
    add('rightCorkscrewUp'); add('rightCorkscrewDown'); add('flat'); add('flatToUp25'); add('leftVerticalLoop'); add('down25ToFlat');
    add('flatToLeftBank'); add('bankedLeftQuarterTurn5Tiles'); add('leftBankToFlat');
    const res = buildCircuit(g, r.id); expect(res.ok, res.why).toBe(true); expect(r.closedLoop).toBe(true);
    const st = simulateTest(g, r); expect(st.completed, st.failReason).toBe(true); expect(st.inversions).toBe(2);
    expect(st.maxPosG).toBeLessThan(6); expect(st.maxPosG).toBeGreaterThan(2); expect(st.maxLatG).toBeLessThan(4);
  });
  it('a coaster can go into a tunnel under a hill', () => {
    const g = park(9); for (let y = 30; y <= 34; y++) for (let x = 50; x <= 53; x++) tileAt(g, x, y)!.h = 16;
    expect(cmdStartCoaster(g, 'wooden_coaster', 45, 32, 0).ok).toBe(true); const r = g.rides[0];
    for (const k of ['endStation', 'flat', 'flat', 'flat', 'flat', 'flat', 'flat']) expect(cmdAddPiece(g, r.id, k, false).ok, k).toBe(true);
    const c = coasterCursor(g, r)!; expect(tileAt(g, c.x - 1, c.y)!.h).toBeGreaterThan(c.z);   // the track runs under the hill
  });
});

describe('old tracks', () => {
  it('a coaster built with the old pieces still loads, draws its pieces and runs', () => {
    const g = park(11); expect(cmdStartCoaster(g, 'wooden_coaster', 40, 40, 0).ok).toBe(true); const r = g.rides[0];
    for (const k of ['station', 'up', 'up', 'turnR', 'down', 'flat', 'turnR', 'flat', 'flat', 'flat', 'flat', 'turnR', 'flat', 'flat', 'turnR']) cmdAddPiece(g, r.id, k, k === 'up', 0);
    const back = deserialize(serialize(g)); const r2 = back.rides[0];
    expect(r2.pieces.every(p => PIECE_BY_KEY[p.type])).toBe(true); expect(PIECE_BY_KEY.turnR.legacy).toBe(true);
    if (r2.closedLoop) expect(simulateTest(back, r2).completed).toBe(true);
  });
});
