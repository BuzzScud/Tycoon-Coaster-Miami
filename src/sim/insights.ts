// What the guests are thinking, park-wide: every recent thought counted, grouped (by ride where the thought names one),
// with where most of them were thought and what would fix it. The Guests window's Thoughts board is drawn from this.
import { key, unkey, type GameState } from './types';

export type FixAct = 'tray:stall' | 'tray:gentle' | 'tray:thrill' | 'tray:ready' | 'hire:handyman' | 'hire:mechanic' | 'hire:security' | 'tool:bench' | 'tool:bin' | 'tool:path' | 'ride:price' | 'ride:open' | 'ride:capacity' | 'park:fee' | 'lens:litter' | 'lens:queues';
export interface Fix { hint: string; act?: FixAct; label?: string }
/** The bad thoughts and what helps: a line for the board and, where there is one, the button that does it. */
export const FIXES: Record<string, Fix> = {
  hungry: { hint: 'Build a food stall near here', act: 'tray:stall', label: 'Build food' },
  thirsty: { hint: 'Build a drinks stall near here', act: 'tray:stall', label: 'Build drinks' },
  toilet: { hint: 'Build toilets near here', act: 'tray:stall', label: 'Build toilets' },
  sick: { hint: 'A First Aid room and benches help sick guests recover', act: 'tray:stall', label: 'Build First Aid' },
  tired: { hint: 'Put benches along the paths', act: 'tool:bench', label: 'Add benches' },
  litter: { hint: 'Hire a handyman and put bins along the paths', act: 'hire:handyman', label: 'Hire handyman' },
  disgusting: { hint: 'Hire a handyman to sweep up', act: 'hire:handyman', label: 'Hire handyman' },
  vandalism: { hint: 'Unhappy guests are breaking benches: a security guard stops them', act: 'hire:security', label: 'Hire security' },
  crowded: { hint: 'Widen the paths here or build more rides to spread guests out', act: 'tool:path', label: 'Lay paths' },
  lost: { hint: 'Sell park maps: build an Information Kiosk', act: 'tray:stall', label: 'Build kiosk' },
  cant_find_exit: { hint: 'Guests cannot find the way out: join the paths back to the gate, sell maps', act: 'tray:stall', label: 'Build kiosk' },
  queue_long: { hint: 'More capacity: more trains or cars, or a second ride like it', act: 'ride:capacity', label: 'Open ride' },
  waiting: { hint: 'The queue moves slowly: more trains or cars, a shorter ride cycle', act: 'ride:capacity', label: 'Open ride' },
  bad_value: { hint: 'Too expensive for what it is: lower the price', act: 'ride:price', label: 'Fair price' },
  cant_afford: { hint: 'Guests cannot afford it: lower the price', act: 'ride:price', label: 'Fair price' },
  spent_money: { hint: 'Guests have spent all their money: prices may be high', act: 'tray:stall' },
  too_intense: { hint: 'Build gentler rides for these guests', act: 'tray:gentle', label: 'Gentle rides' },
  more_thrilling: { hint: 'Guests want thrills: build a thrill ride or a coaster', act: 'tray:ready', label: 'Ready-made coasters' },
  sickening: { hint: 'High nausea puts guests off: gentler rides, or lower its nausea', act: 'tray:gentle', label: 'Gentle rides' },
  closed: { hint: 'Guests want to ride it: open it', act: 'ride:open', label: 'Open it' },
  broken: { hint: 'Hire a mechanic (or one more)', act: 'hire:mechanic', label: 'Hire mechanic' },
  not_safe: { hint: 'A crash scared guests off this ride; it wears off with time' },
  raining: { hint: 'Sell umbrellas (Information Kiosk) and build indoor rides', act: 'tray:stall', label: 'Build kiosk' },
  fee: { hint: 'The entrance fee is more than the rides are worth', act: 'park:fee', label: 'Park fee' },
  go_home: { hint: 'Guests leave when tired, broke or unhappy' },
  cant_find: { hint: 'Guests set off for this ride but lose their way: fewer dead ends and tangles, shorter paths to it, park maps', act: 'tray:stall', label: 'Build kiosk' },
  not_while_raining: { hint: 'Rain keeps guests off open rides: build covered ones and sell umbrellas', act: 'tray:stall', label: 'Build kiosk' },
  get_off: { hint: 'The ride goes on too long: a shorter circuit or fewer laps' },
  get_out: { hint: 'The ride goes on too long: a shorter show' },
};
/** Passing remarks ('I'm not hungry' at a burger stall): not a complaint, left off the board. */
const NEUTRAL = new Set(['not_hungry', 'not_thirsty', 'havent_finished']);
const GOOD = new Set(['great', 'good_value', 'scenery', 'clean', 'fun', 'photo', 'gather', 'picnic', 'theme', 'bought', 'wow', 'fountains']);
export interface ThoughtGroup { t: string; arg?: string; count: number; good: boolean; x: number; y: number; rideId: number | null; fix?: Fix }

/** Every thought guests have had lately, grouped and counted, worst first; the spot is where most of them were. */
export function parkThoughts(g: GameState): { bad: ThoughtGroup[]; good: ThoughtGroup[]; guests: number } {
  const groups = new Map<string, { t: string; arg?: string; count: number; at: Map<number, number> }>(); let guests = 0;
  for (const gu of g.guests) {
    if (gu.state === 'left' || gu.state === 'entering') continue; guests++;
    for (const th of gu.thoughts) {
      if (NEUTRAL.has(th.t)) continue;
      const k = th.t + '|' + (th.arg ?? ''); let e = groups.get(k); if (!e) groups.set(k, e = { t: th.t, arg: th.arg, count: 0, at: new Map() });
      e.count++; const at = th.at ?? key(gu.tx, gu.ty); e.at.set(at, (e.at.get(at) ?? 0) + 1);
    }
  }
  const out: ThoughtGroup[] = [];
  for (const e of groups.values()) {
    let best = 0, bk = 0; for (const [k, n] of e.at) if (n > best) { best = n; bk = k; } const [x, y] = unkey(bk);
    const ride = e.arg ? g.rides.find(r => r.name === e.arg) ?? null : null;
    out.push({ t: e.t, arg: e.arg, count: e.count, good: GOOD.has(e.t), x, y, rideId: ride?.id ?? null, fix: FIXES[e.t] });
  }
  out.sort((a, b) => b.count - a.count);
  return { bad: out.filter(o => !o.good), good: out.filter(o => o.good), guests };
}
