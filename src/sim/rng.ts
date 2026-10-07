// Small deterministic random generator (mulberry32). The state lives in GameState so saves replay the same.
import type { GameState } from './types';

export function rand(g: { rng: number }): number {
  let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (g: GameState, n: number) => Math.floor(rand(g) * n);
export const chance = (g: GameState, p: number) => rand(g) < p;
export const pick = <T>(g: GameState, arr: T[]): T => arr[Math.floor(rand(g) * arr.length)];
