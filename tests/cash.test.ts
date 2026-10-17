// The cash machine (RCT's): a guest who runs short draws $50 from it and stays on, instead of going home.
import { describe, it, expect } from 'vitest';
import { newGame, cmdPath, cmdPlaceRide, tick } from '../src/sim/game';
import { spawnGuest } from '../src/sim/guests';
import { openRide } from '../src/sim/ridesim';

describe('cash machine', () => {
  it('a guest short of money walks to it and comes away $50 richer', () => {
    const g = newGame({ name: 'T', size: 'small', cash: 5_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed: 3, goalMinutes: 0 });
    const ex = g.entrance.x, ey = g.entrance.y; for (let i = 1; i <= 8; i++) cmdPath(g, ex, ey - i, false, 0);
    g.research.invented.push('cash_machine'); const res = cmdPlaceRide(g, 'cash_machine', ex + 1, ey - 6, 2); expect(res.ok, (res as { error?: string }).error).toBe(true);
    const atm = g.rides[g.rides.length - 1]; expect(openRide(g, atm)).toBeNull();
    const gu = spawnGuest(g, { cash: 300, happiness: 200 }); let best = 0;
    for (let i = 0; i < 40 * 120 && best === 0; i++) { tick(g); if (gu.cash >= 5000) best = gu.cash; }
    expect(best).toBeGreaterThanOrEqual(5000); expect(atm.customers).toBeGreaterThan(0); expect(gu.flags.atm).toBe(1);
  });
});
