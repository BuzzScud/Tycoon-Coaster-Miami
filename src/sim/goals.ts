// Optional goals (a clock and three targets, chosen when the park is founded) and the long history the park report
// draws: guests, cash and rating every in-game week, and every message as a dated chronicle line. Free play is the
// default: a park without goals simply never ends.
import { TICKS_PER_SEC, WEEK_TICKS, type GameState } from './types';

export interface Goals {
  minutes: number;            // the clock, in minutes of play at normal speed
  guests: number;             // guests in the park at once
  rating: number;             // park rating, 0..999
  cash: number;               // cents on hand (0 = no cash goal, e.g. sandbox)
  startTick: number;
  heldSince: number | null;   // tick when every goal first held (they must hold for HOLD_TICKS)
  state: 'running' | 'met' | 'timeup';
  endedTick: number | null;
}
export interface HistPoint { t: number; guests: number; cash: number; rating: number }
export const HOLD_TICKS = TICKS_PER_SEC * 120;   // every goal held for two minutes of play
export const GOAL_LENGTHS = [45, 60, 90];
export const playMinutes = (ticks: number) => ticks / (TICKS_PER_SEC * 60);
/** m:ss of play at normal speed, the report's clock. */
export const clock = (ticks: number) => { const s = Math.floor(ticks / TICKS_PER_SEC); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Targets scale with the map and the difficulty. */
export function makeGoals(g: GameState, minutes: number, size: 'small' | 'medium' | 'large', difficulty: 'easy' | 'normal' | 'hard'): Goals {
  const k = (difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.25 : 1) * (minutes / 60);
  const guests = Math.round(({ small: 300, medium: 500, large: 800 }[size] * k) / 25) * 25;
  return { minutes, guests, rating: difficulty === 'hard' ? 650 : 600, cash: g.noMoney ? 0 : Math.round((difficulty === 'easy' ? 15000 : difficulty === 'hard' ? 40000 : 25000) * Math.max(0.75, k)) * 100, startTick: g.tick, heldSince: null, state: 'running', endedTick: null };
}
/** Each goal: what it asks, where the park is, and whether it holds right now. */
export function goalRows(g: GameState, o: Goals) {
  const rows = [
    { key: 'guests', label: 'Guests in the park', now: g.guestsInPark, target: o.guests, ok: g.guestsInPark >= o.guests },
    { key: 'rating', label: 'Park rating', now: g.rating, target: o.rating, ok: g.rating >= o.rating },
  ];
  if (o.cash > 0) rows.push({ key: 'cash', label: 'Cash on hand', now: g.finance.cash, target: o.cash, ok: g.finance.cash >= o.cash });
  return rows;
}
export const minutesLeft = (g: GameState, o: Goals) => Math.max(0, o.minutes - playMinutes((o.endedTick ?? g.tick) - o.startTick));

/** Called every tick: the weekly history sample, and the goal clock. */
export function updateGoals(g: GameState, chronicle: (text: string) => void) {
  if (g.tick % WEEK_TICKS === 0 || !g.history?.length) sampleHistory(g);
  const o = g.goals; if (!o || o.state !== 'running' || g.tick % TICKS_PER_SEC !== 0) return;
  const allOk = goalRows(g, o).every(r => r.ok);
  if (allOk) { o.heldSince ??= g.tick; if (g.tick - o.heldSince >= HOLD_TICKS) { o.state = 'met'; o.endedTick = g.tick; sampleHistory(g); chronicle(`Goals met: every goal held for two minutes, with ${minutesLeft(g, o).toFixed(0)} minutes to spare.`); return; } }
  else if (o.heldSince !== null) o.heldSince = null;
  if (playMinutes(g.tick - o.startTick) >= o.minutes) { o.state = 'timeup'; o.endedTick = g.tick; sampleHistory(g); const met = goalRows(g, o).filter(r => r.ok).length; chronicle(`Time is up: ${met} of ${goalRows(g, o).length} goals met.`); }
}
export function sampleHistory(g: GameState) {
  const h = (g.history ??= []); h.push({ t: g.tick, guests: g.guestsInPark, cash: g.finance.cash, rating: g.rating });
  if (h.length > 720) g.history = h.filter((_, i) => i % 2 === 0 || i === h.length - 1);   // thin, keep the latest
}
/** Every message, kept for the report (news itself keeps only the latest 60). */
export function addChronicle(g: GameState, text: string) { const c = (g.chronicle ??= []); c.push({ tick: g.tick, text }); if (c.length > 500) c.splice(0, c.length - 500); }
/** How the run went, in a word, for the report's title. */
export function verdict(g: GameState): { title: string; line: string } {
  const o = g.goals;
  if (!o) return { title: 'Park report', line: `Free play, ${clock(g.tick)} of play so far.` };
  const rows = goalRows(g, o), met = rows.filter(r => r.ok).length;
  if (o.state === 'met') return { title: 'Goals met', line: `Every goal held for two minutes, with ${minutesLeft(g, o).toFixed(0)} of ${o.minutes} minutes to spare.` };
  if (o.state === 'timeup') return { title: met === rows.length ? 'Time is up: goals met' : 'Time is up', line: `${met} of ${rows.length} goals met when the ${o.minutes} minutes ran out.` };
  return { title: 'Park report', line: `${met} of ${rows.length} goals holding, ${minutesLeft(g, o).toFixed(0)} of ${o.minutes} minutes left.` };
}
