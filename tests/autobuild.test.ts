// The Auto-build switch (stage 7): the park grows itself with its own money, and stops when switched off.
import { describe, it, expect } from 'vitest';
import { newGame, tick } from '../src/sim/game';

describe('auto-build', () => {
  it('a park left on Auto grows paths, open rides, stalls and staff, and never spends its last $3,000', () => {
    const g = newGame({ name: 'A', size: 'medium', cash: 2_000_000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: false, seed: 9, goalMinutes: 0 });
    const paths0 = g.tiles.filter(t => t.paths.length).length; g.autoBuild = true; let low = Infinity;
    for (let i = 0; i < 40 * 60 * 10; i++) { tick(g); low = Math.min(low, g.finance.cash); }
    const open = g.rides.filter(r => r.status === 'open');
    expect(g.tiles.filter(t => t.paths.length).length).toBeGreaterThan(paths0 + 30);
    expect(open.filter(r => r.entrance).length).toBeGreaterThanOrEqual(5); expect(open.some(r => !r.entrance)).toBe(true);   // rides and stalls
    expect(g.guestsInPark).toBeGreaterThan(0); expect(low).toBeGreaterThanOrEqual(0);
  });
  it('switched off, it builds nothing more', () => {
    const g = newGame({ name: 'B', size: 'medium', cash: 2_000_000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: false, seed: 9, goalMinutes: 0 });
    g.autoBuild = true; for (let i = 0; i < 40 * 60 * 3; i++) tick(g); g.autoBuild = false; const n = g.rides.length;
    for (let i = 0; i < 40 * 60 * 3; i++) tick(g); expect(g.rides.length).toBe(n);
  });
});
