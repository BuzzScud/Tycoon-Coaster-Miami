import { DAYS_IN_MONTH, MONTHS, MONTH_TICKS, type GameState } from './types';

/** How fast the park's life runs. Quick and Rapid make months shorter and bring guests and research sooner; the goal
 *  clock (minutes of play) is not touched, so a quicker park simply gets further in the same time. */
export const TEMPOS = [
  { key: 'normal', name: 'Normal', month: 1, arrivals: 1, research: 1, hint: 'Like the original: a month is about 7 minutes at normal speed.' },
  { key: 'quick', name: 'Quick', month: 2, arrivals: 3, research: 3, hint: 'Months twice as short; guests arrive three times as often; research three times as fast.' },
  { key: 'rapid', name: 'Rapid', month: 4, arrivals: 6, research: 6, hint: 'Months four times as short; guests arrive six times as often; research six times as fast.' },
] as const;
export const tempoOf = (g: { tempo?: number }) => TEMPOS[g.tempo ?? 0] ?? TEMPOS[0];
export const monthIndex = (g: GameState) => g.monthsElapsed % 8;
export const year = (g: GameState) => Math.floor(g.monthsElapsed / 8) + 1;
export const dayOfMonth = (g: GameState) => Math.min(DAYS_IN_MONTH[monthIndex(g)], Math.floor((g.monthTick * DAYS_IN_MONTH[monthIndex(g)]) / MONTH_TICKS) + 1);
export const dateString = (g: GameState) => `${MONTHS[monthIndex(g)]}, Year ${year(g)}`;
export const longDateString = (g: GameState) => `${dayOfMonth(g)} ${MONTHS[monthIndex(g)]}, Year ${year(g)}`;
export const isDayStart = (g: GameState) => {
  const d = DAYS_IN_MONTH[monthIndex(g)];
  return Math.floor((g.monthTick * d) / MONTH_TICKS) !== Math.floor(((g.monthTick - 1) * d) / MONTH_TICKS);
};
/** 0..1 position in the month, used for the slow day/night tint. */
export const monthFraction = (g: GameState) => g.monthTick / MONTH_TICKS;
export const ticksToClock = (ticks: number) => {
  const s = Math.round(ticks / 40); const m = Math.floor(s / 60);
  return m ? `${m}min ${String(s % 60).padStart(2, '0')}secs` : `${s}secs`;
};
