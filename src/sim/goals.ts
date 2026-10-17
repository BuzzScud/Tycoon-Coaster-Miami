// Optional goals (a clock and three targets, chosen when the park is founded) and the long history the park report
// draws: guests, cash and rating every in-game week, and every message as a dated chronicle line. Free play is the
// default: a park without goals simply never ends.
import { TICKS_PER_SEC, WEEK_TICKS, MONTH_TICKS, MONTHS, money, type GameState } from './types';
import { RIDE_BY_KEY, fmtRating } from './rides';
import { Cat } from './finance';

export interface Goals {
  minutes: number;            // how long the goals were set for, in minutes of play at normal tempo (sets the deadline)
  fromMonth?: number;         // RCT-style dated goals: the month the goals were set (months since the park opened) …
  byMonth?: number;           // … and the deadline: the goals must be met by the start of this month (the end of the one before)
  guests: number;             // guests in the park at once
  rating: number;             // park rating, 0..999
  cash: number;               // cents on hand (0 = no cash goal, e.g. sandbox)
  startTick: number;
  heldSince: number | null;   // tick when every goal first held (they must hold for HOLD_TICKS)
  state: 'running' | 'met' | 'timeup';
  endedTick: number | null;
  targets?: Objective[];      // a scenario's own goals (replace guests / rating / cash above)
  scenario?: string;          // the scenario this park plays
  stars?: number;             // 1–3 when met: more time to spare, more stars
  endedMonths?: number;       // the date (in months) when they were met or time ran out
}
/** What a scenario can ask for. Counts of rides are of open rides; ratings are in hundredths. */
export type ObjKind = 'guests' | 'rating' | 'cash' | 'value' | 'rideIncome' | 'coasters' | 'bestCoaster' | 'water' | 'noLoan' | 'admissions';
export interface Objective { kind: ObjKind; target: number; extra?: number }
export interface GoalRow { key: string; label: string; now: number; target: number; ok: boolean; fmt: 'n' | 'money' | 'rating' }
export const fmtGoal = (v: number, f: GoalRow['fmt']) => f === 'money' ? money(v) : f === 'rating' ? fmtRating(v) : Math.round(v).toLocaleString('en-US');
const openOf = (g: GameState, cat: string, minE = 0) => g.rides.filter(r => r.status === 'open' && RIDE_BY_KEY[r.type].category === cat && (!minE || (r.ratings?.e ?? 0) >= minE));
function objectiveRow(g: GameState, t: Objective): GoalRow {
  const exp = g.finance.expenditure;
  switch (t.kind) {
    case 'guests': return { key: 'guests', label: 'Guests in the park', now: g.guestsInPark, target: t.target, ok: g.guestsInPark >= t.target, fmt: 'n' };
    case 'rating': return { key: 'rating', label: 'Park rating', now: g.rating, target: t.target, ok: g.rating >= t.target, fmt: 'n' };
    case 'cash': return { key: 'cash', label: 'Cash on hand', now: g.finance.cash, target: t.target, ok: g.finance.cash >= t.target, fmt: 'money' };
    case 'value': return { key: 'value', label: 'Park value', now: g.finance.value, target: t.target, ok: g.finance.value >= t.target, fmt: 'money' };
    case 'rideIncome': { const now = Math.max(exp[0]?.[Cat.RideTickets] ?? 0, exp[1]?.[Cat.RideTickets] ?? 0); return { key: 'rideIncome', label: 'Ride tickets in a month', now, target: t.target, ok: now >= t.target, fmt: 'money' }; }
    case 'coasters': { const now = openOf(g, 'coaster', t.extra).length; return { key: 'coasters', label: `Roller coasters open${t.extra ? ` with excitement ${fmtRating(t.extra)}+` : ''}`, now, target: t.target, ok: now >= t.target, fmt: 'n' }; }
    case 'bestCoaster': { const now = Math.max(0, ...openOf(g, 'coaster').map(r => r.ratings?.e ?? 0)); return { key: 'bestCoaster', label: 'Most exciting roller coaster', now, target: t.target, ok: now >= t.target, fmt: 'rating' }; }
    case 'water': { const now = openOf(g, 'water').length; return { key: 'water', label: 'Water rides open', now, target: t.target, ok: now >= t.target, fmt: 'n' }; }
    case 'noLoan': return { key: 'noLoan', label: 'Loan paid off (left to pay)', now: g.finance.loan, target: 0, ok: g.finance.loan <= 0, fmt: 'money' };
    case 'admissions': return { key: 'admissions', label: 'Guests through the gate', now: g.totalAdmissions, target: t.target, ok: g.totalAdmissions >= t.target, fmt: 'n' };
  }
}
/** One goal in words, for the scenario list (no park needed). */
export function objectiveText(t: Objective): string {
  switch (t.kind) {
    case 'guests': return `${t.target.toLocaleString('en-US')} guests in the park`; case 'rating': return `a park rating of ${t.target}`; case 'cash': return `${money(t.target)} on hand`;
    case 'value': return `a park value of ${money(t.target)}`; case 'rideIncome': return `${money(t.target)} of ride tickets in a month`; case 'water': return `${t.target} water ride${t.target === 1 ? '' : 's'} open`;
    case 'coasters': return `${t.target} roller coasters${t.extra ? ` with excitement ${fmtRating(t.extra)}+` : ''}`; case 'bestCoaster': return `a coaster with excitement ${fmtRating(t.target)}+`;
    case 'noLoan': return 'the loan paid off'; case 'admissions': return `${t.target.toLocaleString('en-US')} guests through the gate`;
  }
}
/** A goal's target for the report's charts (guests, cash, rating), whichever way the goals were set. */
export function goalTarget(o: Goals | null | undefined, kind: 'guests' | 'cash' | 'rating'): number | undefined {
  if (!o) return undefined; if (o.targets) return o.targets.find(t => t.kind === kind)?.target; return (kind === 'cash' ? o.cash || undefined : o[kind]);
}
/** Stars for meeting the goals: three with half the time to spare, two with a quarter, otherwise one. */
export function starsFor(g: GameState, o: Goals): number { const d = deadline(g, o); const left = monthsLeft(g, o) / Math.max(1, d.by - d.from); return left >= 0.5 ? 3 : left >= 0.25 ? 2 : 1; }
/** Months of play at normal tempo for a goal length in minutes (a month is about 6.8 minutes): 45 → 7, 60 → 9, 90 → 13. */
export const monthsFor = (minutes: number) => Math.max(2, Math.round((minutes * 60 * TICKS_PER_SEC) / MONTH_TICKS));
/** The deadline in months; parks saved before dated goals get one from their minutes. */
export function deadline(g: GameState, o: Goals): { from: number; by: number } {
  if (o.byMonth === undefined) { const done = Math.floor((g.tick - o.startTick) / MONTH_TICKS); o.fromMonth = Math.max(0, g.monthsElapsed - done); o.byMonth = o.fromMonth + monthsFor(o.minutes); }
  return { from: o.fromMonth ?? 0, by: o.byMonth };
}
/** "Sep, Y1": the deadline, short. */
export const deadlineShort = (by: number) => `${MONTHS[Math.max(0, by - 1) % 8].slice(0, 3)}, Y${Math.floor(Math.max(0, by - 1) / 8) + 1}`;
/** "the end of September, Year 1": the month before the deadline month. */
export const deadlineText = (by: number) => `the end of ${MONTHS[Math.max(0, by - 1) % 8]}, Year ${Math.floor(Math.max(0, by - 1) / 8) + 1}`;
/** Months (with the fraction of this one) until the deadline; frozen once the goals are met or time is up. */
export function monthsLeft(g: GameState, o: Goals): number {
  const d = deadline(g, o); const now = o.endedMonths ?? (g.monthsElapsed + g.monthTick / MONTH_TICKS); return Math.max(0, d.by - now);
}
export interface HistPoint { t: number; guests: number; cash: number; rating: number }
export const HOLD_TICKS = TICKS_PER_SEC * 120;   // every goal held for two minutes of play
export const GOAL_LENGTHS = [45, 60, 90];
export const playMinutes = (ticks: number) => ticks / (TICKS_PER_SEC * 60);
/** m:ss of play at normal speed, the report's clock. */
export const clock = (ticks: number) => { const s = Math.floor(ticks / TICKS_PER_SEC); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Targets scale with the map and the difficulty. */
export function makeGoals(g: GameState, minutes: number, size: 'small' | 'medium' | 'large' | 'huge', difficulty: 'easy' | 'normal' | 'hard'): Goals {
  const k = (difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.25 : 1) * (minutes / 60);
  const guests = Math.round(({ small: 300, medium: 500, large: 800, huge: 1100 }[size] * k) / 25) * 25;
  return { minutes, fromMonth: g.monthsElapsed ?? 0, byMonth: (g.monthsElapsed ?? 0) + monthsFor(minutes), guests, rating: difficulty === 'hard' ? 650 : 600, cash: g.noMoney ? 0 : Math.round((difficulty === 'easy' ? 15000 : difficulty === 'hard' ? 40000 : 25000) * Math.max(0.75, k)) * 100, startTick: g.tick, heldSince: null, state: 'running', endedTick: null };
}
/** Each goal: what it asks, where the park is, and whether it holds right now. */
export function goalRows(g: GameState, o: Goals): GoalRow[] {
  if (o.targets?.length) return o.targets.map(t => objectiveRow(g, t));
  const rows: GoalRow[] = [
    { key: 'guests', label: 'Guests in the park', now: g.guestsInPark, target: o.guests, ok: g.guestsInPark >= o.guests, fmt: 'n' },
    { key: 'rating', label: 'Park rating', now: g.rating, target: o.rating, ok: g.rating >= o.rating, fmt: 'n' },
  ];
  if (o.cash > 0) rows.push({ key: 'cash', label: 'Cash on hand', now: g.finance.cash, target: o.cash, ok: g.finance.cash >= o.cash, fmt: 'money' });
  return rows;
}
const nowMonths = (g: GameState) => g.monthsElapsed + g.monthTick / MONTH_TICKS;
const spare = (g: GameState, o: Goals) => { const m = monthsLeft(g, o); return m >= 1 ? `${Math.floor(m)} month${Math.floor(m) === 1 ? '' : 's'}` : `${Math.max(1, Math.round(m * 4))} week${Math.round(m * 4) === 1 ? '' : 's'}`; };

/** Called every tick: the weekly history sample, and the goal clock. */
export function updateGoals(g: GameState, chronicle: (text: string) => void) {
  if (g.tick % WEEK_TICKS === 0 || !g.history?.length) sampleHistory(g);
  const o = g.goals; if (!o || o.state !== 'running' || g.tick % TICKS_PER_SEC !== 0) return;
  const allOk = goalRows(g, o).every(r => r.ok);
  if (allOk) { o.heldSince ??= g.tick; if (g.tick - o.heldSince >= HOLD_TICKS) { o.state = 'met'; o.endedTick = g.tick; o.endedMonths = nowMonths(g); o.stars = starsFor(g, o); sampleHistory(g); chronicle(`Goals met: every goal held for two minutes, with ${spare(g, o)} to spare before ${deadlineText(deadline(g, o).by)}.`); } }
  else if (o.heldSince !== null) o.heldSince = null;
  if (nowMonths(g) >= deadline(g, o).by) { o.state = 'timeup'; o.endedTick = g.tick; o.endedMonths = nowMonths(g); sampleHistory(g); const met = goalRows(g, o).filter(r => r.ok).length; chronicle(`Time is up at ${deadlineText(deadline(g, o).by)}: ${met} of ${goalRows(g, o).length} goals met.`); }
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
  const star = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
  if (o.state === 'met') return { title: o.scenario ? `Scenario complete ${star(o.stars ?? 1)}` : 'Goals met', line: `Every goal held for two minutes, with ${spare(g, o)} to spare before ${deadlineText(deadline(g, o).by)}.${o.scenario ? ' Three stars: half the time to spare; two: a quarter.' : ''}` };
  if (o.state === 'timeup') return { title: met === rows.length ? 'Time is up: goals met' : 'Time is up', line: `${met} of ${rows.length} goals met at ${deadlineText(deadline(g, o).by)}.` };
  return { title: 'Park report', line: `${met} of ${rows.length} goals holding; ${spare(g, o)} left until ${deadlineText(deadline(g, o).by)}.` };
}
