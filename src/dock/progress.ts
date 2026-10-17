// Scenario progress in this browser: the best stars per scenario, and which tiers are open. Finishing any park in a
// tier opens the next one.
import { SCENARIOS, type Scenario } from '../sim/scenarios';

const KEY = 'rct.scenarios';
export function readStars(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } }
/** Keep the better of the old and the new result. */
export function saveStars(key: string, stars: number) { const all = readStars(); if ((all[key] ?? 0) >= stars) return; all[key] = stars; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private window: progress is not kept */ } }
export function unlocked(s: Scenario, stars = readStars()): boolean { return s.tier === 1 || SCENARIOS.some(o => o.tier === s.tier - 1 && (stars[o.key] ?? 0) > 0); }
export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
