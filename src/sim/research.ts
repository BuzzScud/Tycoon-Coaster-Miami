// Research: three stages per item, progress per 32 ticks depends on funding. Items are ride types and scenery groups.
import type { GameState } from './types';
import { RIDE_TYPES, RIDE_BY_KEY } from './rides';
import { SCENERY_GROUPS } from './scenery';
import { rand } from './rng';

const RATE = [0, 160, 250, 400];
export const RESEARCH_NAMES = { none: 'No funding', min: 'Minimum funding', normal: 'Normal funding', max: 'Maximum funding' };

export function researchQueue(g: GameState): string[] {
  const all = [...RIDE_TYPES.map(r => r.key), ...SCENERY_GROUPS.map(s => 'scenery:' + s.key)];
  const left = all.filter(k => !g.research.invented.includes(k));
  // shuffle a little so each park differs, but keep cheap things early
  const score = (k: string) => { const d = RIDE_BY_KEY[k]; const base = d ? d.cost / 1000 : 10; return base + rand(g) * 40; };
  return left.map(k => [k, score(k)] as [string, number]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
export function itemCategory(k: string): string { if (k.startsWith('scenery:')) return 'scenery'; return RIDE_BY_KEY[k]?.research ?? 'gentle'; }
export function itemName(k: string): string { if (k.startsWith('scenery:')) return (SCENERY_GROUPS.find(s => s.key === k.slice(8))?.name ?? k) + ' (scenery)'; return RIDE_BY_KEY[k]?.name ?? k; }

export function updateResearch(g: GameState) {
  if (g.tick % 32 !== 0) return; const r = g.research;
  let rate = RATE[g.finance.researchFunding]; if (g.noMoney && rate === 0) rate = 250;
  if (rate === 0 || r.stage === 'done') return;
  if (r.stage === 'initial' && !r.current) {
    const pri = g.finance.researchPriorities;
    const next = r.queue.find(k => pri[itemCategory(k)]) ?? r.queue[0];
    if (!next) { r.stage = 'done'; return; }
    r.current = next; r.queue = r.queue.filter(k => k !== next);
    const stagesLeft = 3; r.expectedMonth = g.monthsElapsed + Math.ceil((stagesLeft * 65535 / rate * 32) / 16384);
  }
  r.progress += rate;
  if (r.progress >= 65535) {
    r.progress = 0;
    if (r.stage === 'initial') r.stage = 'designing';
    else if (r.stage === 'designing') r.stage = 'completing';
    else { // finished
      const k = r.current!; r.invented.push(k); r.lastInvented = k; r.current = null; r.stage = r.queue.length ? 'initial' : 'done';
      g.news.unshift({ tick: g.tick, icon: 'research', text: `New ${k.startsWith('scenery:') ? 'scenery' : 'ride'} researched: ${itemName(k)}` });
    }
  }
}
