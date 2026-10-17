// Unit tests for the piece system: big pieces, values, the Space theme lift, and guests using scenery.
import { describe, it, expect } from 'vitest';
import { newGame, tick, cmdPath, cmdScenery, cmdRemoveScenery, cmdRotateScenery, cmdRecolourScenery, cmdPlaceRide, undo, pieceAt } from '../src/sim/game';
import { sceneryAround, valueOf } from '../src/sim/scenery';
import { flatRatings } from '../src/sim/ridesim';
import type { Dir, GameState } from '../src/sim/types';

const park = () => { const g = newGame({ name: 'Pieces', size: 'small', cash: 5_000_000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: true, seed: 11 });
  const ex = g.entrance.x, ey = g.entrance.y; for (let y = ey - 20; y <= ey - 2; y++) for (let x = ex - 10; x <= ex + 10; x++) { const t = g.tiles[y * g.w + x]; t.h = 0; delete t.slope; t.water = false; t.scenery = null; }
  return { g, ex, ey }; };
const covered = (g: GameState) => g.tiles.filter(t => t.scenery).length;

describe('big pieces', () => {
  it('a 3×3 launch pad covers nine tiles, all pointing at its corner, and costs once', () => {
    const { g, ex, ey } = park(); const before = covered(g); const r = cmdScenery(g, ex + 3, ey - 12, 'space_launchpad', 0 as Dir);
    expect(r.ok).toBe(true); expect(covered(g) - before).toBe(9);
    const p = pieceAt(g, ex + 5, ey - 10)!; expect(p.root).toEqual([ex + 3, ey - 12]); expect(p.tiles).toHaveLength(9);
  });
  it('needs level ground and every tile free', () => {
    const { g, ex, ey } = park(); g.tiles[(ey - 11) * g.w + ex + 4].h = 2;
    expect(cmdScenery(g, ex + 3, ey - 12, 'space_launchpad', 0 as Dir).ok).toBe(false);
    const { g: g2, ex: x2, ey: y2 } = park(); cmdScenery(g2, x2 + 4, y2 - 11, 'tree_oak', 0 as Dir); expect(cmdScenery(g2, x2 + 3, y2 - 12, 'space_launchpad', 0 as Dir).ok).toBe(false);
  });
  it('comes off whole from any tile it covers, and undo puts it all back', () => {
    const { g, ex, ey } = park(); const base = covered(g); cmdScenery(g, ex + 3, ey - 12, 'space_dome', 0 as Dir);
    expect(cmdRemoveScenery(g, ex + 5, ey - 10).ok).toBe(true); expect(covered(g)).toBe(base);
    undo(); expect(covered(g)).toBe(base + 9); expect(pieceAt(g, ex + 3, ey - 12)!.kind).toBe('space_dome');
  });
  it('a path cannot cut through a big piece, but still clears a tree as before', () => {
    const { g, ex, ey } = park(); cmdScenery(g, ex + 3, ey - 12, 'space_rocket', 0 as Dir); expect(cmdPath(g, ex + 4, ey - 11, false, 0).ok).toBe(false);
    cmdScenery(g, ex - 5, ey - 12, 'tree_pine', 0 as Dir); expect(cmdPath(g, ex - 5, ey - 12, false, 0).ok).toBe(true); expect(g.tiles[(ey - 12) * g.w + ex - 5].scenery).toBeNull();
  });
  it('turning and recolouring change every tile of the piece; single-colour pieces refuse a colour', () => {
    const { g, ex, ey } = park(); cmdScenery(g, ex + 3, ey - 12, 'space_saucer', 0 as Dir);
    cmdRotateScenery(g, ex + 4, ey - 11); cmdRecolourScenery(g, ex + 3, ey - 12, 5);
    expect(pieceAt(g, ex + 3, ey - 12)!.tiles.every(t => t.scenery!.rot === 1 && t.scenery!.colour === 5)).toBe(true);
    cmdScenery(g, ex - 5, ey - 12, 'tree_oak', 0 as Dir); expect(cmdRecolourScenery(g, ex - 5, ey - 12, 3).ok).toBe(false);
  });
});

describe('values and the Space theme', () => {
  it('each piece counts once, at its value', () => {
    const { g, ex, ey } = park(); cmdScenery(g, ex + 3, ey - 12, 'space_launchpad', 0 as Dir); cmdScenery(g, ex - 5, ey - 12, 'statue', 0 as Dir);
    const a = sceneryAround(g, ex - 6, ey - 13, ex + 6, ey - 9, 0); expect(a.pieces).toBe(2); expect(a.value).toBe(valueOf('space_launchpad') + valueOf('statue'));
  });
  it('scenery lifts a flat ride, and 3+ Space pieces lift a Space ride a further 15%', () => {
    const { g, ex, ey } = park(); g.research.invented.push('space_rings'); expect(cmdPlaceRide(g, 'space_rings', ex + 2, ey - 8, 0 as Dir).ok).toBe(true); const r = g.rides[0]; const bare = flatRatings(g, r).e;
    cmdScenery(g, ex + 5, ey - 8, 'tree_oak', 0 as Dir); cmdScenery(g, ex + 6, ey - 8, 'bush', 0 as Dir); const plain = flatRatings(g, r).e; expect(plain).toBeGreaterThan(bare);
    for (const [k, x, y] of [['space_beacon', ex + 4, ey - 6], ['space_lamp', ex, ey - 6], ['space_plant', ex + 4, ey - 10]] as const) cmdScenery(g, x, y, k, 0 as Dir);
    const themed = flatRatings(g, r).e; const sameValueNoTheme = bare + Math.min(47, sceneryAround(g, r.x, r.y, r.x, r.y, 5).value) * 2;
    expect(themed).toBe(Math.round(sameValueNoTheme * 1.15)); expect(r.ratings!.e).toBe(themed);   // placing scenery refreshed the ride's ratings
  });
});

describe('guests use scenery', () => {
  it('guests walking past a statue stop to take photos of it', () => {
    const { g, ex, ey } = park(); for (let i = 3; i <= 14; i++) cmdPath(g, ex, ey - i, false, 0); for (let i = 3; i <= 14; i += 2) cmdScenery(g, ex + 1, ey - i, 'statue', 0 as Dir);
    cmdPlaceRide(g, 'merry_go_round', ex - 4, ey - 14, 0 as Dir);
    let photos = 0, admiring = 0; for (let i = 0; i < 12000; i++) { tick(g); if (i % 200 === 0) admiring = Math.max(admiring, g.guests.filter(x => x.state === 'admiring').length); }
    photos = g.guests.filter(x => x.thoughts.some(t => t.t === 'photo')).length;
    expect(photos).toBeGreaterThan(0); expect(admiring).toBeGreaterThan(0);
  });
});

describe('one undo for a painted stroke', () => {
  it('takes back the whole stroke even when the undo list is already full', async () => {
    const { undoGroup, undoStack } = await import('../src/sim/game'); const { g, ex, ey } = park();
    for (let i = 0; i < 60; i++) cmdScenery(g, ex - 8 + (i % 6), ey - 18 + Math.floor(i / 6), 'bush', 0 as Dir);   // fills the list past 50
    expect(undoStack.length).toBe(50); const before = covered(g);
    undoGroup(() => { for (let i = 0; i < 6; i++) cmdScenery(g, ex + 1 + i, ey - 5, 'hedge', 0 as Dir); }, () => '6 hedges');
    expect(covered(g)).toBe(before + 6); undo(); expect(covered(g)).toBe(before);
  });
});

describe('older saves', () => {
  it('a park saved before the Space set gets it on load', async () => {
    const { serialize, deserialize } = await import('../src/sim/save'); const { g } = park(); g.research.invented = g.research.invented.filter(k => k !== 'scenery:space');
    expect(deserialize(serialize(g)).research.invented).toContain('scenery:space');
  });
});
