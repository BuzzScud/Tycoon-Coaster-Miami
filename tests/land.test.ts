// RCT land (stage 1 of the authentic round): sloped land, water levels, paths at any height (bridges and tunnels), and
// parks saved before all that still loading.
import { describe, it, expect } from 'vitest';
import { newGame, cmdLand, cmdWater, cmdPath, cmdRemovePath, undo } from '../src/sim/game';
import { tileAt, corners, slopeOf, landTop, waterZ, findRoute, pathAt, nz } from '../src/sim/map';
import { serialize, deserialize } from '../src/sim/save';
import { LAND_STEP, type GameState } from '../src/sim/types';

const S = LAND_STEP;
function park(): GameState {
  const g = newGame({ name: 'T', size: 'medium', cash: 10_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed: 11, goalMinutes: 0 });
  for (let y = 4; y < 40; y++) for (let x = 4; x < 40; x++) { const t = tileAt(g, x, y)!; t.h = 6; delete t.slope; t.water = false; delete t.wz; t.owned = true; t.scenery = null; t.paths = []; t.rideId = null; t.entrance = null; t.tracks = []; }
  return g;
}

describe('land', () => {
  it('a new map has smooth hills: every tile a slope RCT allows, and the gate paths on the land', () => {
    const g = newGame({ name: 'T', size: 'large', cash: 1_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed: 5, goalMinutes: 0 });
    let sloped = 0;
    for (const t of g.tiles) { expect(slopeOf(corners(t))).not.toBeNull(); if (t.slope) sloped++; for (const p of t.paths) expect(p.z).toBeGreaterThanOrEqual(t.h); }
    expect(sloped).toBeGreaterThan(50);
  });
  it('raising one corner tilts that tile and the tiles sharing the corner, and undo puts it back', () => {
    const g = park(); expect(cmdLand(g, 10, 10, 1, 1, { corner: 2 }).ok).toBe(true);
    expect(corners(tileAt(g, 10, 10)!)).toEqual([6, 6, 6 + S, 6]); expect(corners(tileAt(g, 11, 11)!)).toEqual([6 + S, 6, 6, 6]);
    undo(); expect(tileAt(g, 10, 10)!.slope ?? 0).toBe(0); expect(tileAt(g, 11, 11)!.slope ?? 0).toBe(0);
  });
  it('a hill raised four times slopes down one step a tile all round; with Cliffs it stands alone', () => {
    const g = park(); for (let i = 0; i < 4; i++) expect(cmdLand(g, 20, 20, 1, 3).ok).toBe(true);
    expect(landTop(tileAt(g, 21, 21)!)).toBe(6 + 4 * S);
    for (let k = 1; k <= 4; k++) expect(Math.max(...corners(tileAt(g, 22 + k, 21)!))).toBe(6 + (5 - k) * S);
    for (const t of g.tiles) expect(slopeOf(corners(t))).not.toBeNull();
    const g2 = park(); for (let i = 0; i < 3; i++) expect(cmdLand(g2, 20, 20, 1, 1, { cliffs: true }).ok).toBe(true);
    expect(tileAt(g2, 20, 20)!.h).toBe(6 + 3 * S); expect(tileAt(g2, 21, 20)!.h).toBe(6); expect(tileAt(g2, 21, 20)!.slope ?? 0).toBe(0);
  });
  it('water rises a step at a time over an area and drains away when lowered to the land', () => {
    const g = park(); expect(cmdWater(g, 10, 10, 1, 2).ok).toBe(true);
    expect(waterZ(tileAt(g, 11, 11)!)).toBe(6 + S); expect(cmdWater(g, 10, 10, 1, 2).ok).toBe(true); expect(waterZ(tileAt(g, 10, 10)!)).toBe(6 + 2 * S);
    expect(cmdWater(g, 10, 10, -1, 2).ok).toBe(true); expect(cmdWater(g, 10, 10, -1, 2).ok).toBe(true); expect(tileAt(g, 10, 10)!.water).toBe(false);
    expect(cmdWater(g, 10, 10, -1, 2).ok).toBe(false);
  });
});

describe('paths at height', () => {
  it('a path cannot be laid on water, but a bridge can cross it, and guests can walk over', () => {
    const g = park(); cmdWater(g, 12, 10, 1, 3);
    expect(cmdPath(g, 13, 11, false).ok).toBe(false);
    for (let x = 10; x <= 16; x++) expect(cmdPath(g, x, 11, false, 0, { z: 6 + 2 * S, slope: -1 }).ok).toBe(true);
    expect(cmdPath(g, 9, 11, false, 0, { z: 6 + S, slope: 0 }).ok).toBe(true); expect(cmdPath(g, 8, 11, false, 0, { z: 6, slope: 0 }).ok).toBe(true); expect(cmdPath(g, 7, 11, false).ok).toBe(true);
    expect(findRoute(g, 7, 11, 16, 11)).not.toBeNull();
  });
  it('a tunnel through a hill: hidden in the land, joined at both ends, and the shallow ends cut a wall into the hill', () => {
    const g = park(); for (let i = 0; i < 4; i++) cmdLand(g, 20, 18, 1, 3);
    for (let x = 12; x <= 30; x++) expect(cmdPath(g, x, 19, false, 0, { z: 6, slope: -1 }).ok).toBe(true);
    const mid = tileAt(g, 21, 19)!; expect(mid.h).toBeGreaterThanOrEqual(6 + 4);   // the path is deep under the hill there
    for (let x = 12; x <= 30; x++) { const t = tileAt(g, x, 19)!; expect(t.h >= 6 + 4 || landTop(t) <= 6).toBe(true); }   // no tile half buries it
    expect(findRoute(g, 12, 19, 30, 19)).not.toBeNull();
  });
  it('two paths can share a tile at different heights, and only the right one joins its neighbours', () => {
    const g = park(); for (let x = 10; x <= 14; x++) cmdPath(g, x, 10, false);
    expect(cmdPath(g, 12, 10, false, 0, { z: 6 + 2 * S, slope: -1 }).ok).toBe(true); expect(tileAt(g, 12, 10)!.paths.length).toBe(2);
    expect(cmdPath(g, 12, 10, false, 0, { z: 6 + 1, slope: -1 }).ok).toBe(false);   // no head room between them
    const r = findRoute(g, 10, 10, 14, 10, 4000, false, 6, 6)!; expect(r.every(k => nz(k) === 6)).toBe(true);
    expect(cmdRemovePath(g, 12, 10).ok).toBe(true); expect(pathAt(tileAt(g, 12, 10)!, 6)).not.toBeNull(); expect(tileAt(g, 12, 10)!.paths.length).toBe(1);   // the bulldozer takes the top one
  });
  it('a path laid on the land follows a slope along one side as a ramp', () => {
    const g = park(); cmdLand(g, 20, 10, 1, 1);
    expect(cmdPath(g, 19, 10, false).ok).toBe(true); const p = tileAt(g, 19, 10)!.paths[0]; expect(p.slope).toBe(0); expect(p.z).toBe(6);
  });
});

describe('old saves', () => {
  it('a park saved with one path a tile and water without a level loads with paths on the land and water a step up', () => {
    const g = park(); for (let x = 10; x <= 14; x++) cmdPath(g, x, 10, false); cmdWater(g, 20, 20, 1, 1);
    const o = JSON.parse(serialize(g));
    for (const t of o.g.tiles) { t.path = t.paths[0] ? { ...t.paths[0], z: undefined } : null; delete t.paths; delete t.wz; delete t.slope; }
    const back = deserialize(JSON.stringify(o));
    expect(tileAt(back, 12, 10)!.paths).toHaveLength(1); expect(tileAt(back, 12, 10)!.paths[0].z).toBe(6);
    expect(waterZ(tileAt(back, 20, 20)!)).toBe(6 + S); expect(findRoute(back, 10, 10, 14, 10)).not.toBeNull();
  });
});
