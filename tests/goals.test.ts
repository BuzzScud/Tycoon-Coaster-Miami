// Unit tests for the optional goals, the weekly history and the chronicle the park report draws.
import { describe, it, expect } from 'vitest';
import { newGame, tick } from '../src/sim/game';
import { goalRows, HOLD_TICKS, verdict } from '../src/sim/goals';
import { TICKS_PER_SEC, WEEK_TICKS } from '../src/sim/types';
import { serialize, deserialize } from '../src/sim/save';

const park = (goalMinutes = 0, o: Partial<Parameters<typeof newGame>[0]> = {}) => newGame({ name: 'Test', size: 'small', cash: 1000000, loan: 0, maxLoan: 2000000, difficulty: 'normal', sandbox: false, seed: 7, goalMinutes, ...o });

describe('goals', () => {
  it('free play has no goals and a plain report title', () => {
    const g = park(); expect(g.goals).toBeFalsy(); expect(verdict(g).title).toBe('Park report');
  });
  it('targets scale with the term, the map and the difficulty; sandbox drops the cash goal', () => {
    const a = park(60).goals!, b = park(90).goals!, hard = park(60, { difficulty: 'hard' }).goals!, sand = park(60, { sandbox: true }).goals!;
    expect(b.guests).toBeGreaterThan(a.guests); expect(hard.guests).toBeGreaterThan(a.guests); expect(hard.rating).toBeGreaterThan(a.rating);
    expect(a.cash).toBeGreaterThan(0); expect(sand.cash).toBe(0); expect(goalRows(park(60, { sandbox: true }), sand)).toHaveLength(2);
  });
  it('goals must hold for two minutes, and are met then', () => {
    const g = park(60); const o = g.goals!; o.guests = 0; o.rating = 0; o.cash = 1;   // targets the park already meets
    for (let i = 0; i < HOLD_TICKS - TICKS_PER_SEC; i++) tick(g);
    expect(o.state).toBe('running'); expect(o.heldSince).not.toBeNull();
    for (let i = 0; i < 3 * TICKS_PER_SEC; i++) tick(g);
    expect(o.state).toBe('met'); expect(verdict(g).title).toBe('Goals met');
    expect(g.chronicle!.some(c => c.text.startsWith('Goals met'))).toBe(true);
  });
  it('a goal slipping restarts the two-minute hold', () => {
    const g = park(60); const o = g.goals!; o.guests = 0; o.rating = 0; o.cash = 1;
    for (let i = 0; i < HOLD_TICKS / 2; i++) tick(g);
    expect(o.heldSince).not.toBeNull(); o.guests = 1e6;   // now out of reach
    for (let i = 0; i < TICKS_PER_SEC; i++) tick(g);
    expect(o.heldSince).toBeNull(); expect(o.state).toBe('running');
  });
  it('the clock runs out into a verdict', () => {
    const g = park(45); const o = g.goals!; o.startTick = g.tick - 45 * 60 * TICKS_PER_SEC;   // as if 45 minutes had passed
    for (let i = 0; i < TICKS_PER_SEC; i++) tick(g);
    expect(o.state).toBe('timeup'); expect(verdict(g).title).toMatch(/Time is up/);
  });
  it('history samples every week and survives a save', () => {
    const g = park(60); for (let i = 0; i < WEEK_TICKS * 2 + 5; i++) tick(g);
    expect(g.history!.length).toBeGreaterThanOrEqual(3); expect(g.chronicle!.length).toBeGreaterThan(0);
    const back = deserialize(serialize(g)); expect(back.history!.length).toBe(g.history!.length); expect(back.goals!.guests).toBe(g.goals!.guests);
  });
});

describe('free play has everything', () => {
  it('a free-play park starts with every ride and scenery set and no research bill; a goals park still researches', async () => {
    const { RIDE_TYPES } = await import('../src/sim/rides'); const { SCENERY_GROUPS } = await import('../src/sim/scenery');
    const free = park(0); for (const r of RIDE_TYPES) expect(free.research.invented).toContain(r.key); for (const s of SCENERY_GROUPS) expect(free.research.invented).toContain('scenery:' + s.key);
    expect(free.research.stage).toBe('done'); expect(free.finance.researchFunding).toBe(0);
    const goals = park(60); expect(goals.research.invented).not.toContain('steel_twister'); expect(goals.research.queue.length).toBeGreaterThan(0);
  });
  it('a free-play park saved with things still locked gets everything on load', () => {
    const g = park(0); g.research.invented = g.research.invented.filter(k => k !== 'inverted_coaster'); g.research.stage = 'initial'; g.finance.researchFunding = 2;
    const back = deserialize(serialize(g)); expect(back.research.invented).toContain('inverted_coaster'); expect(back.finance.researchFunding).toBe(0);
  });
});

describe('sandbox has everything too', () => {
  it('a sandbox park with goals on still starts with every ride and scenery set, and so does its save', async () => {
    const { RIDE_TYPES } = await import('../src/sim/rides'); const g = park(60, { sandbox: true });
    for (const r of RIDE_TYPES) expect(g.research.invented).toContain(r.key); expect(g.goals).toBeTruthy();
    g.research.invented = g.research.invented.filter(k => k !== 'steel_twister'); expect(deserialize(serialize(g)).research.invented).toContain('steel_twister');
    expect(park(60).research.invented).not.toContain('steel_twister');   // a normal goals park still researches
  });
});
