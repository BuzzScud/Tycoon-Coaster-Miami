// Advertising campaigns: cost per week, extra guest arrivals while they run.
import type { GameState } from './types';
import { spend, Cat } from './finance';

export const CAMPAIGNS = [
  { key: 0, name: 'Vouchers for free entry to the park', cost: 5000, prob: 400 },
  { key: 1, name: 'Vouchers for free rides on a particular ride', cost: 5000, prob: 300 },
  { key: 2, name: 'Vouchers for half-price entry to the park', cost: 5000, prob: 200 },
  { key: 3, name: 'Vouchers for free food or drink', cost: 5000, prob: 200 },
  { key: 4, name: 'Advertising campaign for the park', cost: 35000, prob: 250 },
  { key: 5, name: 'Advertising campaign for a particular ride', cost: 20000, prob: 200 },
];
export function startCampaign(g: GameState, type: number, weeks: number, rideId: number | null): string | null {
  const c = CAMPAIGNS[type]; if (!c) return 'Unknown campaign';
  if ((type === 1 || type === 5) && rideId === null) return 'Pick a ride';
  if ((type === 0 || type === 2) && g.finance.entranceFee === 0) return 'The park is free to enter already';
  const total = c.cost * weeks; if (!g.noMoney && g.finance.cash < total) return 'Not enough cash';
  g.campaigns = g.campaigns.filter(x => x.type !== type);
  g.campaigns.push({ type, weeksLeft: weeks, rideId, item: null });
  spend(g, total, Cat.Marketing);
  return null;
}
export function updateMarketing(g: GameState) {
  for (const c of g.campaigns) c.weeksLeft--;
  for (const c of g.campaigns) if (c.weeksLeft <= 0) g.news.unshift({ tick: g.tick, icon: 'marketing', text: `${CAMPAIGNS[c.type].name} has finished.` });
  g.campaigns = g.campaigns.filter(c => c.weeksLeft > 0);
}
/** Extra spawn probability (out of 65536 per tick) from running campaigns. */
export function campaignSpawnBonus(g: GameState): number {
  let p = 0;
  for (const c of g.campaigns) {
    let v = CAMPAIGNS[c.type].prob;
    if (c.type === 0 && g.finance.entranceFee < 400) v >>= 3;
    if (c.type === 2 && g.finance.entranceFee < 600) v >>= 3;
    if (c.type === 1) { const r = g.rides.find(x => x.id === c.rideId); if (!r || r.price < 30) v >>= 3; }
    p += v;
  }
  return p;
}
