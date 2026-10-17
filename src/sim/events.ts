// Park events: now and then something happens that brings guests or lifts the park. They only ever help (a VIP who
// leaves unimpressed simply goes home); each is a message, a chip in the top bar while it runs, and a line in the
// report. Rolled at the start of an in-game week; Options can turn them off.
import { type GameState, type Guest } from './types';
import { rand, randInt, pick } from './rng';
import { spawnGuest } from './guests';
import { guestById } from './runtime';
import { RIDE_BY_KEY } from './rides';

export interface ParkEvent { type: 'heatwave' | 'holiday' | 'school' | 'review' | 'vip'; weeksLeft: number; arrivals: number; rating: number; guestId?: number; happy?: number; name?: string }
export const EVENT_NAMES: Record<ParkEvent['type'], string> = { heatwave: 'Heatwave', holiday: 'Holiday rush', school: 'School trip', review: 'Glowing review', vip: 'VIP visit' };
const VIPS = ['A famous film star', 'The mayor', 'A travel writer', 'A theme park critic', 'A pop star', 'A TV chef'];
const WEEKLY_CHANCE = 0.15;

/** Multiplier on guest arrivals while an event runs. */
export const eventArrivals = (g: GameState) => g.event?.arrivals ?? 1;
/** Park rating lift while an event runs. */
export const eventRating = (g: GameState) => g.event?.rating ?? 0;

/** Start of an in-game week: count a running event down, or maybe start one. */
export function weeklyEvent(g: GameState, news: (icon: string, text: string, subject?: { kind: 'guest'; id: number }) => void) {
  const e = g.event;
  if (e) { e.weeksLeft--; if (e.weeksLeft <= 0 && e.type !== 'vip') { g.event = null; news('spark', `The ${EVENT_NAMES[e.type].toLowerCase()} is over.`); } return; }
  if (g.eventsOff || !g.parkOpen || g.guestsInPark < 15 || rand(g) >= WEEKLY_CHANCE) return;
  if (!g.rides.some(r => r.status === 'open' && RIDE_BY_KEY[r.type].kind !== 'stall')) return;
  const options: ParkEvent['type'][] = ['heatwave', 'holiday', 'school', 'vip']; if (g.rating >= 600) options.push('review');
  startEvent(g, pick(g, options), news);
}
export function startEvent(g: GameState, type: ParkEvent['type'], news: (icon: string, text: string, subject?: { kind: 'guest'; id: number }) => void) {
  switch (type) {
    case 'heatwave': g.event = { type, weeksLeft: 2, arrivals: 1.3, rating: 0 }; applyEvent(g); news('sun', 'Heatwave! Guests flock in and they are thirsty: drinks and ice cream sell fast.'); break;
    case 'holiday': g.event = { type, weeksLeft: 1, arrivals: 2, rating: 0 }; news('spark', 'Holiday rush: twice as many guests are coming this week.'); break;
    case 'review': g.event = { type, weeksLeft: 2, arrivals: 1.4, rating: 25 }; news('spark', `A newspaper gave ${g.parkName} a glowing review: more guests are on their way.`); break;
    case 'school': {
      const n = 24 + randInt(g, 12); let first = -1;
      for (let i = 0; i < n; i++) { const gu = spawnGuest(g, { name: `Pupil ${i + 1}`, cash: 2500 + randInt(g, 2000), intMax: 4 + randInt(g, 3), happiness: 170 }); if (first < 0) first = gu.id; }
      g.event = { type, weeksLeft: 1, arrivals: 1, rating: 0 }; news('guests', `A school trip of ${n} pupils has arrived.`, { kind: 'guest', id: first }); break;
    }
    case 'vip': {
      const name = pick(g, VIPS); const gu = spawnGuest(g, { name, cash: 30000, intMax: 8, happiness: 150 }); gu.flags.tracked = false;
      g.event = { type, weeksLeft: 4, arrivals: 1, rating: 0, guestId: gu.id, happy: gu.happiness, name }; news('star', `${name} is visiting the park today. If they leave happy, word will spread.`, { kind: 'guest', id: gu.id }); break;
    }
  }
}
/** Called every tick: keeps a heatwave hot and dry, and watches the VIP until they leave. Cheap when nothing runs. */
export function applyEvent(g: GameState, news?: (icon: string, text: string) => void) {
  const e = g.event; if (!e) return;
  if (e.type === 'heatwave') { const w = g.weather; if (w.kind >= 3 || w.kind === 2) w.kind = 0; if (w.temp < 30) w.temp = 30 + (g.tick % 3); }
  if (e.type === 'vip' && (g.tick & 127) === 0) {
    const gu: Guest | undefined = guestById(g, e.guestId);
    if (gu && gu.state !== 'left') { e.happy = gu.happiness; if (e.weeksLeft > 0) return; }
    const name = e.name ?? 'The VIP';
    if ((e.happy ?? 0) >= 150) { g.event = { type: 'review', weeksLeft: 3, arrivals: 1.5, rating: 40 }; news?.('star', `${name} loved ${g.parkName} and told everyone: a glowing review, more guests, a higher rating for three weeks.`); }
    else { g.event = null; news?.('spark', `${name} has gone home.`); }
  }
}
