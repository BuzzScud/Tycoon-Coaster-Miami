// Monthly park awards (one random award type is tried each month; an award lasts five months).
import type { GameState } from './types';
import { RIDE_BY_KEY } from './rides';
import { randInt } from './rng';
import { totalRideValueForMoney } from './park';

export const AWARDS = [
  { name: 'Most untidy park', positive: false }, { name: 'Most tidy park', positive: true }, { name: 'Best roller coasters', positive: true },
  { name: 'Best value park', positive: true }, { name: 'Most beautiful park', positive: true }, { name: 'Worst value park', positive: false },
  { name: 'Safest park', positive: true }, { name: 'Best staff', positive: true }, { name: 'Best park food', positive: true },
  { name: 'Worst park food', positive: false }, { name: 'Best park toilets', positive: true }, { name: 'Most disappointing park', positive: false },
  { name: 'Best custom-designed rides', positive: true }, { name: 'Most dazzling ride colours', positive: true }, { name: 'Most confusing park layout', positive: false },
  { name: 'Best gentle rides', positive: true }, { name: 'Best water rides', positive: true },
];

function thoughtCount(g: GameState, kinds: string[]): number {
  let n = 0; for (const gu of g.guests) if (gu.state !== 'left') for (const t of gu.thoughts) if (t.age < 5 && kinds.includes(t.t)) n++; return n;
}
function check(g: GameState, type: number): boolean {
  const guests = g.guestsInPark; const rides = g.rides; const def = (r: { type: string }) => RIDE_BY_KEY[r.type];
  const openOf = (f: (r: typeof rides[number]) => boolean) => rides.filter(r => r.status === 'open' && f(r)).length;
  switch (type) {
    case 0: return thoughtCount(g, ['litter', 'disgusting', 'vandalism']) > guests / 16 && guests > 20;
    case 1: return thoughtCount(g, ['clean']) > guests / 64 && thoughtCount(g, ['litter', 'disgusting', 'vandalism']) <= 5 && guests > 20;
    case 2: return openOf(r => def(r).category === 'coaster' && !r.crashes) >= 6;
    case 3: return !g.noMoney && g.finance.entranceFee > 0 && totalRideValueForMoney(g) >= 1000 && g.finance.entranceFee + 10 < totalRideValueForMoney(g) / 2;
    case 4: return thoughtCount(g, ['scenery']) > guests / 128 && thoughtCount(g, ['litter', 'disgusting', 'vandalism', 'crowded']) <= 15 && guests > 20;
    case 5: return !g.noMoney && g.finance.entranceFee > 0 && g.finance.entranceFee > totalRideValueForMoney(g);
    case 6: return thoughtCount(g, ['vandalism']) <= 2 && !rides.some(r => r.crashes > 0) && guests > 20;
    case 7: { const types = new Set(g.staff.map(s => s.type)); return types.size === 4 && g.staff.length >= 20 && g.staff.length >= guests / 32; }
    case 8: { const food = rides.filter(r => r.status === 'open' && def(r).item && !['balloon', 'hat', 'map'].includes(def(r).item!)); return food.length >= 7 && new Set(food.map(r => r.type)).size >= 4 && food.length >= guests / 128 && thoughtCount(g, ['hungry']) <= 12; }
    case 9: { const food = rides.filter(r => r.status === 'open' && def(r).item && !['balloon', 'hat', 'map'].includes(def(r).item!)); return new Set(food.map(r => r.type)).size <= 2 && food.length <= guests / 256 && thoughtCount(g, ['hungry']) > 15; }
    case 10: { const t = openOf(r => def(r).facility === 'toilet'); return t >= 4 && t >= guests / 128 && thoughtCount(g, ['toilet']) <= 16; }
    case 11: { const rated = rides.filter(r => r.ratings && def(r).kind !== 'stall'); return g.rating <= 650 && rated.length > 0 && rated.filter(r => r.popularity <= 6).length >= rated.length / 2; }
    case 12: return openOf(r => def(r).kind === 'coaster' && !!r.ratings && r.ratings.e >= 550 && !r.crashes) >= 6;
    case 13: { const tracked = rides.filter(r => def(r).kind === 'coaster'); const bright = tracked.filter(r => [4, 2, 5, 8].includes(r.colours[0])).length; return bright >= 5 && bright >= tracked.length - bright; }
    case 14: return g.lostCount >= 10 && g.lostCount >= guests / 64;
    case 15: return openOf(r => def(r).category === 'gentle') >= 10;
    case 16: return openOf(r => def(r).category === 'water') >= 4;
  }
  return false;
}
export function updateAwards(g: GameState) {
  for (const a of g.awards) a.time--; g.awards = g.awards.filter(a => a.time > 0);
  if (!g.parkOpen || g.awards.length >= 4) return;
  let type = randInt(g, AWARDS.length); let tries = 0;
  while (g.awards.some(a => a.type === type) && tries++ < 8) type = randInt(g, AWARDS.length);
  if (g.awards.some(a => a.type === type)) return;
  if (check(g, type)) { g.awards.push({ type, time: 5 }); g.news.unshift({ tick: g.tick, icon: 'award', text: `Your park has received an award for '${AWARDS[type].name}'` }); }
}
