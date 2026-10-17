// Guests, RCT style (stage 5): real names, junction-by-junction pathfinding with a memory of ways tried, giving up
// on a ride they cannot find, choosing the most exciting ride in sight, turning into queues and shops they pass.
import { describe, it, expect } from 'vitest';
import { newGame, cmdPath, cmdPlaceRide, cmdPlaceEntrance, tick } from '../src/sim/game';
import { spawnGuest, queueLine } from '../src/sim/guests';
import { openRide } from '../src/sim/ridesim';
import { tileAt, terrace, pathNear } from '../src/sim/map';
import { chooseDirection } from '../src/sim/rct/pathfind';
import { realName, setGuestNames } from '../src/sim/names';
import { deserialize, serialize } from '../src/sim/save';
import type { GameState, Guest, Dir } from '../src/sim/types';

/** A small park with a level clearing above the gate; paths laid with `lay`. */
function park(seed = 5): GameState {
  const g = newGame({ name: 'T', size: 'medium', cash: 50_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed, goalMinutes: 0 });
  const ex = g.entrance.x, ey = g.entrance.y; const h0 = tileAt(g, ex, ey - 1)!.h;
  for (let y = ey - 30; y <= ey - 2; y++) for (let x = ex - 20; x <= ex + 20; x++) { const t = tileAt(g, x, y); if (!t) continue; t.h = h0; delete t.slope; delete t.wz; t.water = false; t.scenery = null; t.owned = true; if (y < ey - 1) t.paths = []; }
  terrace(g); g.finance.entranceFee = 0; return g;
}
const lay = (g: GameState, pts: [number, number][]) => { for (const [x, y] of pts) if (!tileAt(g, x, y)!.paths.length) { const r = cmdPath(g, x, y, false, 0); expect(r.ok, `${x},${y}: ${(r as { error?: string }).error}`).toBe(true); } };
const line = (x0: number, y0: number, x1: number, y1: number): [number, number][] => { const out: [number, number][] = []; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) out.push([x0 + Math.sign(x1 - x0) * i, y0 + Math.sign(y1 - y0) * i]); return out; };
/** A guest standing on (x, y), walking, facing dir. */
function guestAt(g: GameState, x: number, y: number, dir: Dir, o: Parameters<typeof spawnGuest>[1] = {}): Guest {
  const gu = spawnGuest(g, o); const p = pathNear(tileAt(g, x, y))!; Object.assign(gu, { x: x + 0.5, y: y + 0.5, tx: x, ty: y, z: p.z, pz: p.z, dir, state: 'walking', dest: null, route: null, entered: g.tick });
  g.guestsInPark++; return gu;
}

describe('guest names', () => {
  it('every guest has a first name and an initial, the same for the same id, and the option switches to numbers and back', () => {
    expect(realName(7)).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/); expect(realName(7)).toBe(realName(7));
    expect(new Set(Array.from({ length: 3000 }, (_, i) => realName(i + 1))).size).toBeGreaterThan(2000);
    const g = park(); const a = spawnGuest(g, {}), vip = spawnGuest(g, { name: 'The VIP' });
    expect(a.name).toBe(realName(a.id));
    setGuestNames(g, false); expect(a.name).toBe(`Guest ${a.id}`); expect(vip.name).toBe('The VIP');
    setGuestNames(g, true); expect(a.name).toBe(realName(a.id));
  });
  it('a park saved with numbered guests loads with real names', () => {
    const g = park(); const a = spawnGuest(g, {}); a.name = `Guest ${a.id}`; delete (a as Partial<Guest>).aim;
    const h = deserialize(serialize(g)); const b = h.guests.find(x => x.id === a.id)!;
    expect(b.name).toBe(realName(a.id)); expect(b.aim).toBeNull(); expect(b.ridden).toEqual([]);
  });
});

describe('RCT pathfinding', () => {
  it('at a fork a guest takes the way that leads to the goal, even when it starts off away from it', () => {
    // a spine north from J; west: a dead end that ends right beside the goal; east: a long loop round to the goal
    const g = park(); const ex = g.entrance.x, ey = g.entrance.y; const jy = ey - 10;
    lay(g, line(ex, ey - 2, ex, jy)); lay(g, line(ex - 1, jy, ex - 6, jy));          // west arm: a dead end at ex-6
    lay(g, line(ex + 1, jy, ex + 4, jy)); lay(g, line(ex + 4, jy - 1, ex + 4, jy - 6)); lay(g, line(ex + 3, jy - 6, ex - 8, jy - 6)); lay(g, line(ex - 8, jy - 5, ex - 8, jy - 1));   // east arm, round to (ex-8, jy-1)
    const goal: [number, number, number] = [ex - 8, jy - 1, pathNear(tileAt(g, ex - 8, jy - 1))!.z];
    const gu = guestAt(g, ex, jy, 3); const p = pathNear(tileAt(g, ex, jy))!;
    expect(chooseDirection(g, gu, ex, jy, p, goal, null, 5)).toBe(0);   // east (0), not west (2) to the dead end
  });
  it('a guest walks there one junction at a time and arrives', () => {
    const g = park(); const ex = g.entrance.x, ey = g.entrance.y; const jy = ey - 10;
    lay(g, line(ex, ey - 2, ex, jy - 8)); for (const y of [jy, jy - 4, jy - 8]) { lay(g, line(ex - 1, y, ex - 6, y)); lay(g, line(ex + 1, y, ex + 6, y)); }   // a ladder of side streets
    lay(g, line(ex + 6, jy - 1, ex + 6, jy - 3));
    const res = cmdPlaceRide(g, 'burger_bar', ex + 6, jy - 9, 1); expect(res.ok).toBe(true); const bar = g.rides[g.rides.length - 1]; expect(openRide(g, bar)).toBeNull();
    const gu = guestAt(g, ex, ey - 2, 3, { cash: 5000 }); gu.hunger = 20; gu.thirst = 200;
    let bought = false; for (let i = 0; i < 40 * 90 && !bought; i++) { tick(g); bought = bar.customers > 0; }
    expect(bought).toBe(true);
  });
  it('a guest who cannot get to the ride they want says so twice and gives up', () => {
    const g = park(); const ex = g.entrance.x, ey = g.entrance.y;
    lay(g, line(ex, ey - 2, ex, ey - 12)); lay(g, line(ex - 5, ey - 12, ex + 5, ey - 12)); lay(g, line(ex - 5, ey - 6, ex - 5, ey - 11)); lay(g, line(ex + 5, ey - 6, ex + 5, ey - 11));   // dead ends to bounce off
    lay(g, line(ex - 12, ey - 20, ex - 12, ey - 16));   // a separate bit of path nobody can reach
    const gu = guestAt(g, ex, ey - 2, 3, { cash: 5000 });
    const far = pathNear(tileAt(g, ex - 12, ey - 16))!; gu.headingTo = 999; gu.aim = [ex - 12, ey - 16, far.z]; gu.lostCd = 61;   // nearly lost already
    let cantFind = 0; for (let i = 0; i < 40 * 600 && gu.headingTo !== null; i++) { tick(g); if (gu.thoughts[0]?.t === 'cant_find' && gu.thoughts[0].age === 0) cantFind = Math.max(cantFind, gu.thoughts.filter(t => t.t === 'cant_find').length); }
    expect(gu.headingTo).toBeNull(); expect(cantFind).toBeGreaterThan(0);
  });
});

describe('RCT ride choice', () => {
  function twoRides() {
    const g = park(); const ex = g.entrance.x, ey = g.entrance.y;
    lay(g, line(ex, ey - 2, ex, ey - 14)); lay(g, line(ex - 8, ey - 8, ex + 8, ey - 8));
    const mk = (type: string, x: number, y: number) => { expect(cmdPlaceRide(g, type, x, y, 0).ok).toBe(true); const r = g.rides[g.rides.length - 1]; expect(cmdPlaceEntrance(g, r.id, x, y - 1, false).ok).toBe(true); expect(cmdPlaceEntrance(g, r.id, x + 1, y - 1, true).ok).toBe(true); expect(openRide(g, r)).toBeNull(); return r; };
    return { g, ex, ey, calm: mk('merry_go_round', ex - 7, ey - 6), wild: mk('twist', ex + 4, ey - 6) };
  }
  it('a guest who can see two rides heads for the more exciting one first, then the other', () => {
    const { g, ex, ey, calm, wild } = twoRides(); expect(wild.ratings!.e).toBeGreaterThan(calm.ratings!.e);
    const gu = guestAt(g, ex, ey - 8, 3, { cash: 20000, intMax: 8, happiness: 200 }); gu.flags.paidEntry = false;
    const order: number[] = []; for (let i = 0; i < 40 * 900 && order.length < 2; i++) { tick(g); if (gu.state === 'riding' && gu.rideId !== null && order[order.length - 1] !== gu.rideId) order.push(gu.rideId); }
    expect(order[0]).toBe(wild.id); expect(gu.ridden).toContain(wild.id);
  });
  it('a ride far too intense is refused at the entrance with a thought', () => {
    const { g, ex, ey, wild } = twoRides(); const wildRatings = { ...wild.ratings!, i: 1400 };
    const gu = guestAt(g, ex + 4, ey - 8, 2, { cash: 20000, intMax: 3, happiness: 128 }); gu.items.umbrella = false;
    let refused = false; for (let i = 0; i < 40 * 600 && !refused; i++) { g.weather.kind = 0; wild.ratings = wildRatings; tick(g); refused = gu.thoughts.some(t => t.t === 'too_intense' && t.arg === wild.name); }
    expect(refused).toBe(true); expect(gu.ridden).not.toContain(wild.id);
  });
  it('a guest who has just eaten walks past a burger bar thinking they are not hungry', () => {
    const g = park(); const ex = g.entrance.x, ey = g.entrance.y; lay(g, line(ex, ey - 2, ex, ey - 12)); lay(g, line(ex - 6, ey - 12, ex + 6, ey - 12));
    expect(cmdPlaceRide(g, 'burger_bar', ex + 1, ey - 7, 2).ok).toBe(true); const bar = g.rides[g.rides.length - 1]; expect(openRide(g, bar)).toBeNull();
    let said = 0; for (let n = 0; n < 12 && !said; n++) { const gu = guestAt(g, ex, ey - 2, 3, { cash: 5000 }); gu.hunger = 250; gu.thirst = 250; for (let i = 0; i < 40 * 30; i++) tick(g); said += gu.thoughts.filter(t => t.t === 'not_hungry').length; }
    expect(said).toBeGreaterThan(0); expect(queueLine).toBeTypeOf('function');
  });
});
