// Unit tests for the game rules (no DOM).
import { describe, it, expect } from 'vitest';
import { newGame, cmdPath, cmdLand, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece, tick, undo } from '../src/sim/game';
import { tileAt, findRoute } from '../src/sim/map';
import { updateParkRating } from '../src/sim/park';
import { testRide, openRide, computeRideValue, flatSettings } from '../src/sim/ridesim';
import { serialize, deserialize } from '../src/sim/save';
import { ratingWord } from '../src/sim/rides';
import type { Dir } from '../src/sim/types';

const park = (seed = 42) => newGame({ name: 'Test', size: 'small', cash: 1000000, loan: 1000000, maxLoan: 2000000, difficulty: 'normal', sandbox: false, seed });

describe('world', () => {
  it('generates a terraced map with an entrance path', () => {
    const g = park(); expect(g.tiles.length).toBe(48 * 48);
    for (let y = 0; y < g.h; y++) for (let x = 1; x < g.w; x++) expect(Math.abs(g.tiles[y * g.w + x].h - g.tiles[y * g.w + x - 1].h)).toBeLessThanOrEqual(2);
    expect(tileAt(g, g.entrance.x, g.entrance.y - 2)!.paths.length).toBe(1);
    expect(tileAt(g, g.spawn.x, g.spawn.y)!.paths.length).toBe(1);
    expect(findRoute(g, g.spawn.x, g.spawn.y, g.entrance.x, g.entrance.y - 2)).not.toBeNull();
  });
  it('builds paths, charges for them and undoes', () => {
    const g = park(); const cash = g.finance.cash; const x = g.entrance.x, y = g.entrance.y - 3;
    expect(cmdPath(g, x, y, false, 0).ok).toBe(true); expect(g.finance.cash).toBe(cash - 1000);
    expect(cmdPath(g, x, y, false, 0).ok).toBe(false);          // already there
    expect(undo()).toBe('path'); expect(tileAt(g, x, y)!.paths.length).toBe(0); expect(g.finance.cash).toBe(cash);
  });
  it('raising a tile slopes the land beside it (RCT), and a path laid there follows the slope', () => {
    const g = park(); const x = g.entrance.x, y = g.entrance.y - 4;
    for (let yy = y - 6; yy <= y + 1; yy++) for (let xx = x - 3; xx <= x + 3; xx++) { const t = tileAt(g, xx, yy)!; t.h = 0; delete t.slope; t.scenery = null; t.water = false; for (const p of t.paths) p.z = 0; }
    expect(cmdLand(g, x, y - 2, 1, 1).ok).toBe(true);
    const mid = tileAt(g, x, y - 1)!; expect(mid.h).toBe(0); expect(mid.slope).toBe(6);   // its two north corners raised: a ramp
    expect(cmdLand(g, x + 3, y - 6, 1, 1, { cliffs: true }).ok).toBe(true); expect(tileAt(g, x + 3, y - 5)!.slope ?? 0).toBe(0);   // cliffs: the neighbour stays
    cmdPath(g, x, y, false, 0); cmdPath(g, x, y - 2, false, 0); expect(cmdPath(g, x, y - 1, false, 0).ok).toBe(true);
    expect(tileAt(g, x, y - 1)!.paths[0].slope).toBe(3);
    expect(findRoute(g, x, y, x, y - 2)).not.toBeNull();
  });
});

describe('rides', () => {
  it('places a flat ride with entrance and exit and opens it', () => {
    const g = park(); const x = g.entrance.x + 3, y = g.entrance.y - 8;
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) { const t = tileAt(g, xx, yy)!; t.h = 4; delete t.slope; t.scenery = null; t.water = false; }
    for (const [xx, yy] of [[x, y + 2], [x + 2, y]]) { const t = tileAt(g, xx, yy)!; t.h = 4; delete t.slope; t.scenery = null; t.water = false; }
    const r = cmdPlaceRide(g, 'merry_go_round', x, y, 0); expect(r.ok).toBe(true);
    const ride = g.rides[0]; expect(openRide(g, ride)).toContain('entrance');
    expect(cmdPlaceEntrance(g, ride.id, x, y + 2, false).ok).toBe(true); expect(cmdPlaceEntrance(g, ride.id, x + 2, y, true).ok).toBe(true);
    expect(openRide(g, ride)).toBeNull(); expect(ride.status).toBe('open');
    const st = flatSettings(ride); expect(ride.ratings!.e).toBeGreaterThanOrEqual(60 + 5 * st.option); expect(ride.ratings!.n).toBe(30 + 5 * st.option);   // RCT: base 0.60 / 0.15 / 0.30, +0.05 each a rotation
    expect(ratingWord(ride.ratings!.e)).toBe('Low');
    expect(computeRideValue(g, ride)).toBeGreaterThan(0);
  });
  it('builds a small wooden coaster loop that tests successfully', () => {
    const g = park(7); const x = g.entrance.x + 4, y = g.entrance.y - 12;
    for (let yy = y - 6; yy <= y + 8; yy++) for (let xx = x - 6; xx <= x + 8; xx++) { const t = tileAt(g, xx, yy)!; t.h = 4; delete t.slope; t.scenery = null; t.water = false; t.paths = []; }
    expect(cmdStartCoaster(g, 'wooden_coaster', x, y, 0 as Dir).ok).toBe(true); const ride = g.rides[0];
    const add = (k: string, chain = false) => { const r = cmdAddPiece(g, ride.id, k, chain, 0); if (!r.ok) throw new Error(k + ': ' + r.error); };
    add('station'); add('station');
    for (let i = 0; i < 4; i++) add('up', true);
    add('turnR'); add('down'); add('steepDown'); add('flat'); add('flat');
    add('turnR'); for (let i = 0; i < 7; i++) add('flat');
    add('turnR'); for (let i = 0; i < 4; i++) add('flat');
    add('turnR');
    expect(ride.closedLoop).toBe(true);
    expect(testRide(g, ride)).toBeNull();
    expect(ride.stats!.completed).toBe(true); expect(ride.stats!.maxSpeed).toBeGreaterThan(5); expect(ride.stats!.drops).toBeGreaterThanOrEqual(1);
    expect(ride.ratings!.e).toBeGreaterThan(20);
  });
});

describe('park', () => {
  it('rates an empty park below a busy happy one', () => {
    const g = park(); updateParkRating(g); const empty = g.rating;
    for (let i = 0; i < 100; i++) g.guests.push({ ...JSON.parse(JSON.stringify(blankGuest())), id: i + 1, happiness: 200, state: 'walking' } as any);
    updateParkRating(g); expect(g.rating).toBeGreaterThan(empty);
  });
  it('runs a month of ticks, pays interest and keeps the save round-trippable', () => {
    const g = park(); const cash = g.finance.cash;
    for (let i = 0; i < 16400; i++) tick(g);
    expect(g.monthsElapsed).toBe(1); expect(g.finance.cash).toBeLessThan(cash);
    const g2 = deserialize(serialize(g)); expect(g2.tick).toBe(g.tick); expect(g2.tiles.length).toBe(g.tiles.length);
  });
});
function blankGuest() { return { id: 0, name: '', x: 1, y: 1, z: 0, dir: 0, tx: 1, ty: 1, state: 'walking', happiness: 128, happinessTarget: 128, energy: 128, energyTarget: 128, hunger: 200, thirst: 200, toilet: 0, nausea: 0, nauseaTarget: 0, nauseaTol: 2, intMin: 3, intMax: 7, cash: 5000, spent: 0, items: { balloon: null, umbrella: false, map: false, hat: false, food: null, drink: null, photo: false, souvenir: false }, eatTimer: 0, thoughts: [], entered: 0, ridesTaken: 0, prevRide: null, favourite: null, headingTo: null, dest: null, route: null, lostTimer: 0, queueTime: 0, rideId: null, sitTimer: 0, watchTimer: 0, shirt: 0, trousers: 0, hair: 0, litterTimer: 0, angry: 0, vouchers: 0, flags: { leaving: false, paidEntry: false, tracked: false, sick: false, lost: false, crowded: false }, walkPhase: 0 }; }
