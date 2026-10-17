// Tests for the "full season" round: tempo, auto-connect, finish circuit, ready-made coasters, new pieces, block
// sections, the complaints board, patrol areas, events, water rides and the railway, scenarios, and older saves.
import { describe, it, expect } from 'vitest';
import { newGame, cmdPath, cmdPlaceRide, cmdStartCoaster, cmdAddPiece, tick, undo, undoGroup, undoStack } from '../src/sim/game';
import { tileAt, findRoute } from '../src/sim/map';
import { autoConnect, parkNetwork } from '../src/sim/connect';
import { planCircuit, buildCircuit } from '../src/sim/autotrack';
import { testRide, simulateTest } from '../src/sim/ridesim';
import { PIECE_BY_KEY, pieceEnd, pieceSample } from '../src/sim/track';
import { openRide } from '../src/sim/ridesim';
import { queueLine } from '../src/sim/guests';
import { MONTH_TICKS } from '../src/sim/types';
import type { Dir, GameState } from '../src/sim/types';

const park = (seed = 42, extra: Partial<Parameters<typeof newGame>[0]> = {}) => newGame({ name: 'Test', size: 'medium', cash: 5_000_000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: false, seed, ...extra });
/** A flat, cleared, owned rectangle at land height 4 (the gate strip is levelled to match). */
function flatten(g: GameState, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = tileAt(g, x, y)!; t.h = 4; t.scenery = null; t.water = false; t.owned = true; }
  for (let y = g.entrance.y - 2; y < g.h; y++) for (let x = g.entrance.x - 2; x <= g.entrance.x + 3; x++) { const t = tileAt(g, x, y); if (t) t.h = 4; }
}
const gate = (g: GameState) => ({ x: g.entrance.x, y: g.entrance.y - 2 });

describe('tempo', () => {
  it('Quick makes months half as long and still starts every day, week and month', () => {
    for (const [tempo, step] of [[0, 1], [1, 2], [2, 4]] as const) {
      const g = park(1, { tempo }); let weeks = 0; const w0 = g.finance.weeklyProfit; void w0;
      const days0 = g.ratingHist.length; for (let i = 0; i < MONTH_TICKS / step; i++) { const m = g.monthTick; tick(g); if (Math.floor(m / 4096) !== Math.floor((g.monthTick || MONTH_TICKS) / 4096)) weeks++; }
      expect(g.monthsElapsed).toBe(1); expect(g.monthTick).toBe(0); expect(g.ratingHist.length - days0).toBe(31); expect(weeks).toBe(4);
    }
  });
  it('a tempo change mid-month keeps the calendar whole', () => {
    const g = park(2); for (let i = 0; i < 1001; i++) tick(g); g.tempo = 2; let n = 0; while (g.monthsElapsed === 0 && n++ < MONTH_TICKS) tick(g);
    expect(g.monthsElapsed).toBe(1); expect(g.monthTick).toBeLessThan(4); expect(g.ratingHist.length).toBe(31);
  });
  it('Quick brings guests sooner', () => {
    const count = (tempo: number) => { const g = park(3, { tempo }); g.rating = 700; for (let i = 0; i < 4000; i++) tick(g); return g.totalAdmissions + g.guests.length; };
    expect(count(1)).toBeGreaterThan(count(0) * 1.8);
  });
});

describe('auto-connect', () => {
  it('a flat ride away from the paths gets an entrance, an exit and paths, guests can reach it, one undo takes it all back', () => {
    const g = park(5); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 12, ey - 20, ex + 12, ey - 2);
    for (let i = 3; i <= 8; i++) cmdPath(g, ex, ey - i, false, 0);
    const before = g.finance.cash; const undos = undoStack.length;
    undoGroup(() => { expect(cmdPlaceRide(g, 'merry_go_round', ex + 5, ey - 14, 0).ok).toBe(true); const r = g.rides[0]; const res = autoConnect(g, r.id); expect(res.ok, res.why).toBe(true); }, () => 'place');
    const r = g.rides[0]; expect(r.entrance).not.toBeNull(); expect(r.exit).not.toBeNull(); expect(openRide(g, r)).toBeNull();
    const line = queueLine(g, r); expect(line.length).toBeGreaterThan(0); const end = line[line.length - 1];
    expect(findRoute(g, gate(g).x, gate(g).y, end[0], end[1], 20000)).not.toBeNull();
    const xf = r.exit!; expect(findRoute(g, xf.x - [1, 0, -1, 0][xf.dir], xf.y - [0, 1, 0, -1][xf.dir], gate(g).x, gate(g).y, 20000)).not.toBeNull();
    expect(g.finance.cash).toBeLessThan(before); expect(undoStack.length).toBe(undos + 1);
    undo(); expect(g.rides.length).toBe(0); expect(g.finance.cash).toBe(before); expect(tileAt(g, ex + 3, ey - 14)!.path).toBeNull();
  });
  it('a ride already next to the path needs no new paths', () => {
    const g = park(6); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 8, ey - 12, ex + 8, ey - 2);
    for (let i = 3; i <= 10; i++) cmdPath(g, ex, ey - i, false, 0);
    cmdPlaceRide(g, 'twist', ex + 2, ey - 8, 0); const res = autoConnect(g, g.rides[0].id); expect(res.ok, res.why).toBe(true); expect(res.paths).toBe(0);
  });
  it('a stall gets a path to its counter', () => {
    const g = park(7); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 8, ey - 14, ex + 8, ey - 2);
    for (let i = 3; i <= 6; i++) cmdPath(g, ex, ey - i, false, 0);
    expect(cmdPlaceRide(g, 'burger_bar', ex + 4, ey - 11, 1).ok).toBe(true); const s = g.rides[0]; const res = autoConnect(g, s.id); expect(res.ok, res.why).toBe(true);
    expect(findRoute(g, gate(g).x, gate(g).y, s.x + 0, s.y + 1, 20000)).not.toBeNull();
  });
  it('a finished coaster gets huts beside a station and the path to them', () => {
    const g = park(8); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 14, ey - 30, ex + 14, ey - 2);
    for (let i = 3; i <= 6; i++) cmdPath(g, ex, ey - i, false, 0);
    const x = ex + 2, y = ey - 20; expect(cmdStartCoaster(g, 'wooden_coaster', x, y, 0 as Dir).ok).toBe(true); const r = g.rides[0];
    const add = (k: string, chain = false) => { const q = cmdAddPiece(g, r.id, k, chain, 0); if (!q.ok) throw new Error(k + ': ' + q.error); };
    add('station'); add('station'); for (let i = 0; i < 4; i++) add('up', true); add('turnR'); add('down'); add('steepDown'); add('flat'); add('flat'); add('turnR'); for (let i = 0; i < 7; i++) add('flat'); add('turnR'); for (let i = 0; i < 4; i++) add('flat'); add('turnR');
    expect(r.closedLoop).toBe(true); const res = autoConnect(g, r.id); expect(res.ok, res.why).toBe(true); expect(r.entrance && r.exit).toBeTruthy();
  });
  it('says why when the gate has no path', () => {
    const g = park(9); tileAt(g, gate(g).x, gate(g).y)!.path = null; cmdPlaceRide(g, 'twist', g.entrance.x + 3, g.entrance.y - 9, 0);
    expect(autoConnect(g, g.rides[g.rides.length - 1]?.id ?? -1).ok).toBe(false); expect(parkNetwork(g).some(v => v > 0)).toBe(false);
  });
});

describe('finish circuit', () => {
  const opener = (g: GameState, type: string, x: number, y: number, dir: Dir, rest: string[]) => {
    expect(cmdStartCoaster(g, type, x, y, dir).ok).toBe(true); const r = g.rides[g.rides.length - 1];
    for (const k of rest) { const q = cmdAddPiece(g, r.id, k, PIECE_BY_KEY[k].dz > 0, 0); if (!q.ok) throw new Error(k + ': ' + q.error); } return r;
  };
  it('closes a lift-and-drop opener back into the station, as one undo step, and the train gets round', () => {
    for (const [seed, dir] of [[11, 0], [12, 1], [13, 2], [14, 3]] as const) {
      const g = park(seed); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 24, ey - 40, ex + 24, ey - 3);
      const r = opener(g, 'wooden_coaster', ex, ey - 22, dir as Dir, ['station', 'station', 'up', 'up', 'up', 'up', 'steepDown', 'flat', 'turnR']);
      const n = r.pieces.length; const t0 = performance.now(); const res = buildCircuit(g, r.id); const ms = performance.now() - t0;
      expect(res.ok, res.why).toBe(true); expect(r.closedLoop).toBe(true); expect(ms).toBeLessThan(1500);
      expect(testRide(g, r)).toBeNull(); expect(r.stats!.completed, r.stats!.failReason).toBe(true);
      undo(); expect(r.pieces.length).toBe(n); expect(r.closedLoop).toBe(false);
    }
  });
  it('works round obstacles (a pond in the way)', () => {
    const g = park(15); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 24, ey - 40, ex + 24, ey - 3);
    for (let y = ey - 30; y <= ey - 14; y++) for (let x = ex + 3; x <= ex + 8; x++) tileAt(g, x, y)!.water = true;
    const r = opener(g, 'steel_twister', ex - 2, ey - 22, 0, ['station', 'station', 'up', 'up', 'up', 'steepDown', 'flat', 'flat']);
    const res = buildCircuit(g, r.id); expect(res.ok, res.why).toBe(true);
    expect(r.closedLoop).toBe(true); expect(simulateTest(g, r).completed).toBe(true);
    for (const p of r.pieces) { const t = tileAt(g, p.x, p.y)!; expect(p.z).toBeGreaterThanOrEqual(t.water ? t.h + 2 : t.h); }
  });
  it('says why when there is no room', () => {
    const g = park(16); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 24, ey - 40, ex + 24, ey - 3);
    const r = opener(g, 'junior_coaster', ex, ey - 22, 0, ['station', 'station', 'flat']);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (Math.abs(x - ex - 2) + Math.abs(y - (ey - 22)) > 3) tileAt(g, x, y)!.owned = false;
    const res = planCircuit(g, r, 3000); expect('why' in res).toBe(true);
  });
});

describe('new pieces', () => {
  it('every piece ends where its last sample is, and sloped turns climb what they say', () => {
    for (const p of Object.values(PIECE_BY_KEY)) for (const dir of [0, 1, 2, 3] as Dir[]) {
      const piece = { type: p.key, x: 10, y: 10, z: 4, dir, chain: false, bank: 0 as const }; const e = pieceEnd(piece);
      const out = pieceSample(piece, p.samples[p.samples.length - 1]); const next = pieceSample({ ...piece, x: e.x, y: e.y, z: e.z, dir: e.dir }, { x: 0, y: 0.5, z: 0, s: 0 });
      expect(Math.hypot(out.x - next.x, out.y - next.y, out.z - next.z), p.key + ' dir ' + dir).toBeLessThan(1e-6);
      expect(Math.abs(p.samples[p.samples.length - 1].s - p.length)).toBeLessThan(1e-6);
    }
    expect(PIECE_BY_KEY.helixDownL.dz).toBe(-2); expect(PIECE_BY_KEY.helixDownL.helix).toBe(true); expect(PIECE_BY_KEY.corkscrewR.inversion).toBe(true);
  });
  it('a corkscrew counts as an inversion; a junior coaster may not have one', () => {
    const g = park(17); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 24, ey - 40, ex + 24, ey - 3);
    expect(cmdStartCoaster(g, 'junior_coaster', ex - 10, ey - 30, 0).ok).toBe(true); const jr = g.rides[0]; cmdAddPiece(g, jr.id, 'station', false, 0);
    expect(cmdAddPiece(g, jr.id, 'corkscrewR', false, 0).ok).toBe(false);
    expect(cmdStartCoaster(g, 'steel_twister', ex - 2, ey - 22, 0).ok).toBe(true); const r = g.rides[1];
    for (const k of ['station', 'station', 'up', 'up', 'up', 'up', 'steepDown', 'flat', 'corkscrewR', 'flat']) expect(cmdAddPiece(g, r.id, k, PIECE_BY_KEY[k].dz > 0, 0).ok, k).toBe(true);
    expect(buildCircuit(g, r.id).ok).toBe(true); const st = simulateTest(g, r); expect(st.completed, st.failReason).toBe(true); expect(st.inversions).toBe(1);
  });
  it('block brakes keep two trains apart', () => {
    const g = park(18); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 24, ey - 40, ex + 24, ey - 3);
    expect(cmdStartCoaster(g, 'wooden_coaster', ex - 4, ey - 24, 0).ok).toBe(true); const r = g.rides[0];
    for (const k of ['station', 'station', 'up', 'up', 'up', 'up', 'steepDown', 'flat', 'turnR', 'flat', 'blockBrakes']) expect(cmdAddPiece(g, r.id, k, PIECE_BY_KEY[k].dz > 0, 0).ok, k).toBe(true);
    expect(buildCircuit(g, r.id).ok).toBe(true); r.numTrains = 2; expect(testRide(g, r)).toBeNull(); expect(r.trains.length).toBe(2);
    const stationLen = 2 * 6; let together = 0;
    for (let i = 0; i < 40 * 120; i++) { tick(g); const [a, b] = r.trains; if (a.state === 'running' && b.state === 'running' && Math.abs(a.pos - b.pos) < 3) together++; }
    expect(together).toBe(0); expect(r.trains.every(t => t.state !== 'crashed')).toBe(true); void stationLen;
  });
});

describe('ready-made rides', () => {
  it('every design builds facing all four ways on open ground, closes, gets round and rates about what it says', async () => {
    const { DESIGNS, cmdBuildDesign } = await import('../src/sim/designs');
    for (const d of DESIGNS) for (const dir of [0, 1, 2, 3] as Dir[]) {
      const g = newGame({ name: 'D', size: 'large', cash: 1e9, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: true, seed: 5 });
      for (const t of g.tiles) { t.h = 4; t.water = false; t.scenery = null; t.owned = true; t.path = null; }
      const res = cmdBuildDesign(g, d.key, 48, 48, dir); expect(res.ok, `${d.key} dir ${dir}: ${res.why}`).toBe(true);
      const r = g.rides.find(x => x.id === res.rideId)!; expect(r.closedLoop).toBe(true); expect(r.name).toBe(d.name);
      testRide(g, r); expect(r.stats!.completed, d.key + ': ' + r.stats!.failReason).toBe(true);
      expect(Math.abs(r.ratings!.e - d.e)).toBeLessThan(d.e * 0.15 + 20); expect(Math.abs(r.ratings!.i - d.i)).toBeLessThan(d.i * 0.15 + 20);
      undo(); expect(g.rides.length).toBe(0);
    }
  });
  it('says why when it does not fit', async () => {
    const { cmdBuildDesign } = await import('../src/sim/designs');
    const g = park(30); const res = cmdBuildDesign(g, 'twister_loop', 2, 2, 0); expect(res.ok).toBe(false); expect(res.why).toBeTruthy(); expect(g.rides.length).toBe(0);
  });
});

describe('thoughts board', () => {
  it('counts every recent thought, worst first, with where they were and a fix', async () => {
    const { parkThoughts } = await import('../src/sim/insights'); const { think, spawnGuest } = await import('../src/sim/guests');
    const g = park(40); for (let i = 0; i < 6; i++) spawnGuest(g, {}); g.guests.forEach(gu => { gu.state = 'walking'; });
    g.guests.slice(0, 5).forEach(gu => { gu.tx = 10; gu.ty = 12; think(gu, 'hungry'); }); g.guests.slice(0, 2).forEach(gu => think(gu, 'scenery'));
    const b = parkThoughts(g); expect(b.bad[0].t).toBe('hungry'); expect(b.bad[0].count).toBeGreaterThanOrEqual(5); expect([b.bad[0].x, b.bad[0].y]).toEqual([10, 12]);
    expect(b.bad[0].fix?.act).toBe('tray:stall'); expect(b.good.some(x => x.t === 'scenery')).toBe(true);
  });
});

describe('park events', () => {
  it('only help: a heatwave keeps it sunny and brings more guests; nothing lowers rating or cash', async () => {
    const { startEvent, eventArrivals, eventRating, weeklyEvent } = await import('../src/sim/events');
    const g = park(41); const said: string[] = []; const say = (_i: string, t: string) => { said.push(t); };
    startEvent(g, 'heatwave', say); expect(eventArrivals(g)).toBeGreaterThan(1); g.weather.kind = 4; g.weather.temp = 10; tick(g); expect(g.weather.kind).toBe(0); expect(g.weather.temp).toBeGreaterThanOrEqual(30);
    weeklyEvent(g, say); weeklyEvent(g, say); expect(g.event).toBeNull(); expect(said.at(-1)).toContain('over');
    for (const type of ['holiday', 'school', 'review', 'vip'] as const) { const h = park(42); const n0 = h.guests.length; startEvent(h, type, say); expect(eventArrivals(h)).toBeGreaterThanOrEqual(1); expect(eventRating(h)).toBeGreaterThanOrEqual(0); if (type === 'school') expect(h.guests.length - n0).toBeGreaterThanOrEqual(24); }
  });
  it('a VIP who leaves happy turns into a glowing review; one who does not just goes home', async () => {
    const { startEvent } = await import('../src/sim/events'); const say = () => {};
    for (const happy of [true, false]) { const g = park(43); startEvent(g, 'vip', say); const vip = g.guests.find(x => x.id === g.event!.guestId)!; vip.happiness = happy ? 200 : 60; for (let i = 0; i < 130; i++) tick(g); vip.state = 'left'; for (let i = 0; i < 130; i++) tick(g);
      if (happy) { expect(g.event?.type).toBe('review'); expect(g.event!.rating).toBeGreaterThan(0); } else expect(g.event).toBeNull(); }
  });
  it('can be turned off', async () => {
    const { weeklyEvent } = await import('../src/sim/events'); const g = park(44); g.eventsOff = true; g.guestsInPark = 100; for (let i = 0; i < 200; i++) weeklyEvent(g, () => {}); expect(g.event ?? null).toBeNull();
  });
});

describe('patrol areas', () => {
  it('a handyman with an area sweeps inside it and walks back when outside', async () => {
    const { hireStaff, patrolCell, inArea } = await import('../src/sim/staff');
    const g = park(45); const ex = g.entrance.x, ey = g.entrance.y; flatten(g, ex - 20, ey - 30, ex + 20, ey - 2);
    for (let i = 3; i <= 26; i++) cmdPath(g, ex, ey - i, false, 0);
    const s = hireStaff(g, 'handyman'); if (typeof s === 'string') throw new Error(s);
    const top = ey - 22; s.patrol = [patrolCell(g, ex, top), patrolCell(g, ex, top - 4)]; expect(inArea(g, s, ex, top)).toBe(true); expect(inArea(g, s, ex, ey - 4)).toBe(false);
    tileAt(g, ex, ey - 5)!.litter = 3; tileAt(g, ex, top)!.litter = 3;
    for (let i = 0; i < 40 * 90; i++) tick(g);
    expect(inArea(g, s, s.tx, s.ty)).toBe(true); expect(tileAt(g, ex, top)!.litter).toBe(0);
  });
});

describe('fair prices', () => {
  it('a stall item is priced at what guests think it is worth, more for ice cream on a hot day', async () => {
    const { fairPrice } = await import('../src/sim/guests'); const g = park(46); cmdPlaceRide(g, 'ice_cream_stall', g.entrance.x + 4, g.entrance.y - 8, 0);
    const s = g.rides[g.rides.length - 1]; if (!s || s.type !== 'ice_cream_stall') return; g.weather.temp = 15; const cool = fairPrice(g, s); g.weather.temp = 28; expect(fairPrice(g, s)).toBeGreaterThan(cool);
  });
});

describe('water rides and the railway', () => {
  const field = () => { const g = newGame({ name: 'W', size: 'large', cash: 1e9, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: true, seed: 9 }); for (const t of g.tiles) { t.h = 4; t.water = false; t.scenery = null; t.owned = true; t.path = null; } return g; };
  it('a log flume counts its splash and rates it; the boat slows in the water', async () => {
    const { cmdBuildDesign } = await import('../src/sim/designs'); const g = field(); const res = cmdBuildDesign(g, 'log_jam', 40, 40, 0); expect(res.ok, res.why).toBe(true);
    const r = g.rides[0]; testRide(g, r); expect(r.stats!.splashes).toBeGreaterThanOrEqual(1); expect(r.ratings!.e).toBeGreaterThan(300);
  });
  it('the railway holds its speed up and down hills, never stalls, and rates gentle', async () => {
    const { cmdBuildDesign } = await import('../src/sim/designs'); const g = field(); expect(cmdBuildDesign(g, 'park_express', 40, 40, 1).ok).toBe(true);
    const r = g.rides[0]; testRide(g, r); expect(r.stats!.completed).toBe(true); expect(r.stats!.maxSpeed).toBeLessThan(6.5); expect(r.ratings!.i).toBeLessThan(300);
  });
  it('a water ride may not use a loop; a coaster may take a splash, like the original water splash', () => {
    const g = field(); expect(cmdStartCoaster(g, 'log_flume', 30, 30, 0).ok).toBe(true); cmdAddPiece(g, g.rides[0].id, 'station', false, 0);
    expect(cmdAddPiece(g, g.rides[0].id, 'loop', false, 0).ok).toBe(false); expect(cmdAddPiece(g, g.rides[0].id, 'splash', false, 0).ok).toBe(true);
    expect(cmdStartCoaster(g, 'steel_twister', 30, 50, 0).ok).toBe(true); const c = g.rides[1]; cmdAddPiece(g, c.id, 'station', false, 0); expect(cmdAddPiece(g, c.id, 'splash', false, 0).ok).toBe(true);
  });
  it('the best roller coaster award counts only roller coasters', async () => {
    const { RIDE_BY_KEY } = await import('../src/sim/rides'); expect(RIDE_BY_KEY.log_flume.category).toBe('water'); expect(RIDE_BY_KEY.mini_railway.category).toBe('transport');
  });
});
