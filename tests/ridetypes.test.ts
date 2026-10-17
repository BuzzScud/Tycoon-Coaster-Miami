// All of RCT's ride types (stage 4 of the authentic round): every one is in the game with RCT's prices, upkeep and
// ratings, its own look in both styles, and a ride that builds, tests and opens.
import { describe, it, expect } from 'vitest';
import { RIDE_TYPES, RIDE_BY_KEY } from '../src/sim/rides';
import { RCT_RIDES } from '../src/sim/rct/ride-data';
import { newGame, cmdPlaceRide, cmdStartCoaster, cmdAddPiece } from '../src/sim/game';
import { buildCircuit } from '../src/sim/autotrack';
import { testRide, trackDone, isShuttle, rideGraph } from '../src/sim/ridesim';
import { rctFlatModel } from '../src/ink/rct-models';
import { vehicleSketch } from '../src/ink/rct-tracks';
import * as THREE from 'three';

const field = () => { const g = newGame({ name: 'T', size: 'large', cash: 1e9, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed: 4, goalMinutes: 0 });
  for (const t of g.tiles) { t.h = 4; delete t.slope; t.water = false; delete t.wz; t.owned = true; t.scenery = null; t.paths = []; } g.research.invented.push(...RIDE_TYPES.map(r => r.key)); return g; };
const SHUTTLE_TRACK: Record<string, string[]> = {
  reverse_freefall_coaster: ['flat', 'flat', 'flat', 'flat', 'reverseFreefallSlope', 'reverseFreefallVertical', 'reverseFreefallVertical', 'reverseFreefallVertical'],
  reverse_freefall_rc: ['flat', 'flat', 'flat', 'flat', 'reverseFreefallSlope', 'reverseFreefallVertical', 'reverseFreefallVertical', 'reverseFreefallVertical'],
  inverted_impulse_rc: ['flat', 'flat', 'flat', 'flatToUp25', 'up25ToUp60', 'up60', 'up60', 'up60'],
  heartline_twister_rc: ['flat', 'leftHeartLineRoll', 'flat', 'rightHeartLineRoll', 'flat', 'flatToUp25*', 'up25ToUp60*', 'up60*', 'up60*'],
};
const rctOf = (k: string) => RIDE_BY_KEY[k].rct ?? RIDE_BY_KEY[k].coaster?.rct;

describe('RCT ride types', () => {
  it('all 91 are in the game, each with a price, upkeep and a description', () => {
    const have = new Set(RIDE_TYPES.map(r => rctOf(r.key)).filter(Boolean)); expect(Object.keys(RCT_RIDES).filter(k => !have.has(k))).toEqual([]);
    for (const r of RIDE_TYPES) { expect(r.cost, r.key).toBeGreaterThan(0); expect(r.description.length, r.key).toBeGreaterThan(10); }
  });
  it('every flat ride places and is rated by RCT\'s formula; the new ones have their own model', () => {
    const g = field(); let x = 10;
    for (const d of RIDE_TYPES.filter(r => r.kind === 'flat')) {
      const res = cmdPlaceRide(g, d.key, x, 20, 0); expect(res.ok, d.key).toBe(true); x += d.size + 1; const r = g.rides[g.rides.length - 1];
      expect(r.ratings?.e ?? 0, d.key).toBeGreaterThan(0);
      if (d.rct && !['merry_go_round', 'ferris_wheel', 'twist', 'swinging_ship', 'launched_freefall', 'top_spin', 'space_rings', 'motion_simulator', 'observation_tower', 'circus', 'haunted_house', 'spiral_slide', 'dodgems'].includes(d.key))
        expect(rctFlatModel(r, () => new THREE.Group(), [1, 2, 3]), d.key).not.toBeNull();
    }
  });
  it('every track ride starts on the ground, closes into a circuit, tests and is rated', () => {
    for (const d of RIDE_TYPES.filter(r => r.kind === 'coaster' && !SHUTTLE_TRACK[r.key])) {
      const g = field(), x = 40, y = 40;   // a field each: the planner's circuits need room
      expect(cmdStartCoaster(g, d.key, x, y, 0).ok, d.key).toBe(true); const r = g.rides[g.rides.length - 1]; expect(r.pieces[0].z, d.key).toBe(4);
      for (const k of ['endStation', 'flat']) cmdAddPiece(g, r.id, d.coaster!.rct ? k : k === 'endStation' ? 'station' : 'flat', false);
      const f = buildCircuit(g, r.id); expect(f.ok, d.key + ' ' + f.why).toBe(true);
      testRide(g, r); expect(r.stats?.completed, d.key + ' ' + r.stats?.failReason).toBe(true); expect(r.ratings?.e ?? 0, d.key).toBeGreaterThan(0);
    }
  });
  it('the shuttle coasters need no circuit: the track ends in a steep climb, the train goes out, rolls back and stops in the station', () => {
    for (const [key, track] of Object.entries(SHUTTLE_TRACK)) {
      if (!RIDE_BY_KEY[key]) continue; const g = field(); expect(cmdStartCoaster(g, key, 40, 40, 0).ok, key).toBe(true); const r = g.rides[g.rides.length - 1];
      expect(trackDone(r)).toBe(false);
      for (const tok of ['endStation', ...track]) { const k = tok.replace('*', ''); const q = cmdAddPiece(g, r.id, k, tok.endsWith('*')); expect(q.ok, key + ' ' + k).toBe(true); }
      expect(r.closedLoop).toBe(false); expect(trackDone(r), key).toBe(true); expect(isShuttle(r)).toBe(true);
      expect(testRide(g, r)).toBeNull(); expect(r.stats?.completed, key + ' ' + r.stats?.failReason).toBe(true); expect(r.stats!.maxSpeed / 0.44704, key).toBeGreaterThan(25);
      const gr = rideGraph(r)!; expect(Math.min(...gr.v), key + ' rolls back').toBeLessThan(-3);
    }
  });
  it('the new styles have their own cars', () => {
    for (const d of RIDE_TYPES.filter(r => r.kind === 'coaster' && ['standup', 'flying', 'laydown', 'suspended', 'bobsleigh', 'singlerail', 'monorail', 'cable', 'road', 'ghost', 'golf'].includes(r.coaster!.style)))
      expect(vehicleSketch(d.key, d.coaster!.style, 0, 0xff0000, [], () => new THREE.Group()), d.key).not.toBeNull();
  });
});
