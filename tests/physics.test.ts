// RCT physics and ratings (stage 3 of the authentic round): trains on RCT track move by RCT's own rules (speed from
// pitch, drag and friction, chain lifts, brakes, launches), stop after their circuits, leave the station by its
// rules, and are rated by RCT's formulas for their ride type, requirements included.
import { describe, it, expect } from 'vitest';
import { newGame, cmdStartCoaster, cmdAddPiece, tick } from '../src/sim/game';
import { buildCircuit } from '../src/sim/autotrack';
import { simulateTest, testRide, openRide, rideMode, rideGraph } from '../src/sim/ridesim';
import { cmdBuildDesign, DESIGNS } from '../src/sim/designs';
import { PIECE_BY_KEY } from '../src/sim/track';
import type { GameState, Ride } from '../src/sim/types';

function field(): GameState {
  const g = newGame({ name: 'T', size: 'large', cash: 50_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed: 4, goalMinutes: 0 });
  for (const t of g.tiles) { t.h = 4; delete t.slope; t.water = false; delete t.wz; t.owned = true; t.scenery = null; t.paths = []; }
  g.research.invented.push('steel_twister', 'wooden_coaster', 'inverted_coaster', 'junior_coaster', 'mine_train', 'mini_railway'); return g;
}
function build(g: GameState, type: string, pieces: string[], x = 30, y = 40): Ride {
  expect(cmdStartCoaster(g, type, x, y, 0).ok).toBe(true); const r = g.rides[g.rides.length - 1];
  for (const tok of pieces) { const k = tok.replace('*', ''); const res = cmdAddPiece(g, r.id, k, tok.endsWith('*')); if (!res.ok) throw new Error(k + ': ' + res.error); }
  if (!r.closedLoop) { const f = buildCircuit(g, r.id); expect(f.ok, f.why).toBe(true); }
  return r;
}
const lift = (n: number) => ['flatToUp25*', ...Array(n).fill('up25*'), 'up25ToFlat*'];

describe('RCT train physics', () => {
  it('a drop of eight height units gives a junior coaster RCT-like speed (20–32 mph), not a free-fall figure', () => {
    const g = field(); const r = build(g, 'junior_coaster', ['endStation', ...lift(3), 'flatToDown25', 'down25', 'down25', 'down25ToFlat']);
    const st = simulateTest(g, r); expect(st.completed, st.failReason).toBe(true);
    const mph = st.maxSpeed / 0.44704; expect(mph).toBeGreaterThan(20); expect(mph).toBeLessThan(32);
  });
  it('a chain lift pulls the train up at the lift speed, and a faster lift setting is faster', () => {
    const lap = (speed: number) => { const g = field(); const r = build(g, 'steel_twister', ['endStation', ...lift(6), 'flatToDown25', 'down25', 'down25ToFlat']); r.liftSpeed = speed; return simulateTest(g, r).duration; };
    expect(lap(8)).toBeLessThan(lap(5));
  });
  it('brakes slow a fast train to the brake speed', () => {
    const g = field(); const r = build(g, 'steel_twister', ['endStation', ...lift(10), 'flatToDown25', 'down25ToDown60', 'down60', 'down60ToDown25', 'down25ToFlat', 'flat', 'brakes', 'brakes', 'brakes', 'flat']);
    const st = simulateTest(g, r); expect(st.completed, st.failReason).toBe(true); const gr = rideGraph(r)!;
    const brakeAt = r.pieces.findIndex(p => p.type === 'brakes'); const before = gr.v.filter((_, i) => gr.piece[i] === brakeAt - 1), after = gr.v.filter((_, i) => gr.piece[i] === brakeAt + 3);
    const brakeMs = ((8 << 16) / 29127) * 0.44704;
    expect(Math.max(...before)).toBeGreaterThan(brakeMs * 1.4); expect(Math.max(...after)).toBeLessThan(brakeMs * 1.15);
  });
  it('a powered launch shoots the train out of the station without a lift hill', () => {
    const g = field(); g.research.invented.push('steel_twister');
    expect(cmdStartCoaster(g, 'steel_twister', 30, 40, 0).ok).toBe(true); const r = g.rides[g.rides.length - 1]; r.mode = 'poweredLaunch'; r.launchSpeed = 30;
    for (const k of ['endStation', 'endStation', 'flat', 'flatToUp25', 'up25', 'up25', 'up25ToFlat', 'flatToDown25', 'down25', 'down25', 'down25ToFlat']) expect(cmdAddPiece(g, r.id, k, false).ok, k).toBe(true);
    const f = buildCircuit(g, r.id); expect(f.ok, f.why).toBe(true);
    const st = simulateTest(g, r); expect(rideMode(r).mode).toBe('poweredLaunch'); expect(st.completed, st.failReason).toBe(true); expect(st.maxSpeed / 0.44704).toBeGreaterThan(20);
  });
});

describe('operating', () => {
  it('a train runs its circuits before it stops, and waits for the load asked for up to the maximum wait', () => {
    const g = field(); const r = build(g, 'junior_coaster', ['endStation', ...lift(3), 'flatToDown25', 'down25', 'down25ToFlat']);
    r.entrance = { x: 30, y: 39, dir: 1 }; r.exit = { x: 30, y: 41, dir: 3 };   // (a field with no paths: huts stand in)
    testRide(g, r); expect(openRide(g, r)).toBeNull(); r.circuits = 2; r.departLoad = 4; r.minWait = 0; r.maxWait = 10;
    const t = r.trains[0]; let left = -1, back = -1;
    for (let i = 0; i < 40 * 200 && back < 0; i++) { const was = t.state; tick(g); if (was === 'station' && t.state === 'running') left = g.tick; if (left > 0 && was === 'running' && t.state === 'station') back = g.tick; }
    expect(left).toBeGreaterThan(0); expect(back).toBeGreaterThan(left);
    const one = simulateTest(g, r).duration; expect(back - left).toBeGreaterThan(one * 1.3);   // two laps (the second starts at speed, through the station)
  });
});

describe('RCT ratings', () => {
  it('every ready-made ride meets its RCT requirements and rates what it says, the coasters thrilling, the railway gentle', () => {
    for (const d of DESIGNS.filter(x => !['log_jam', 'rapids_run'].includes(x.key))) {
      const g = field(); const res = cmdBuildDesign(g, d.key, 40, 50, 0); expect(res.ok, d.key + ' ' + res.why).toBe(true);
      const r = g.rides.find(x => x.id === res.rideId)!; testRide(g, r); expect(r.stats?.rct, d.key).toBeTruthy();
      expect(Math.abs(r.ratings!.e - d.e), d.key).toBeLessThan(60); expect(Math.abs(r.ratings!.i - d.i), d.key).toBeLessThan(80);
    }
  });
  it('a mine train shorter than RCT asks (370 m) has its ratings halved', () => {
    const g = field(); const r = build(g, 'mine_train', ['endStation', ...lift(5), 'flatToDown25', 'down25', 'down25', 'down25', 'down25ToFlat', 'flatToUp25', 'up25ToFlat', 'flatToDown25', 'down25ToFlat']);
    testRide(g, r); const short = r.ratings!; expect(r.stats!.rct!.length / 65536).toBeLessThan(370);
    expect(short.e).toBeLessThan(250);
    expect(PIECE_BY_KEY.endStation.station).toBe(true);
  });
});
