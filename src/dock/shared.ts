// Small pieces the 3D app shares across its files: the active tool, the coaster builder's choice, guest thought text.
import type { Dir, Ride } from '../sim/types';
import { PIECE_BY_KEY } from '../sim/track';
import { RIDE_BY_KEY } from '../sim/rides';

export type Tool =
  | { kind: 'inspect' } | { kind: 'land'; mode: 'raise' | 'lower' | 'water' | 'buy' | 'surface'; brush: number; surf: number }
  | { kind: 'path'; queue: boolean; style: number; remove: boolean } | { kind: 'pathAdd'; what: 'bench' | 'lamp' | 'bin' }
  | { kind: 'scenery'; item: string; rot: Dir; remove: boolean; colour?: number } | { kind: 'ride'; type: string; rot: Dir }
  | { kind: 'coasterStart'; type: string; rot: Dir } | { kind: 'entrance'; rideId: number; exit: boolean }
  | { kind: 'coaster'; rideId: number } | { kind: 'demolish' } | { kind: 'design'; key: string; rot: Dir }
  | { kind: 'patrol'; staffId: number; add: boolean | null };

export interface BuildSel { dir: 'left2' | 'left' | 'straight' | 'right' | 'right2'; slope: 'steepDown' | 'down' | 'level' | 'up' | 'steepUp'; bank: -1 | 0 | 1; chain: boolean; special: string | null; }

export function thoughtText(t: { t: string; arg?: string }): string {
  const a = t.arg ?? ''; const map: Record<string, string> = { hungry: "I'm hungry", thirsty: "I'm thirsty", toilet: 'I need to go to the toilet', sick: "I feel sick", very_sick: "I feel very sick", great: `${a} was great!`, good_value: `${a} is really good value`, bad_value: `I'm not paying that much to go on ${a}`, too_intense: `${a} looks too intense for me`, more_thrilling: `I want to go on something more thrilling than ${a}`, sickening: `${a} looks too sickening for me`, tired: "I'm tired", lost: "I'm lost!", cant_find_exit: "I can't find the park exit", go_home: 'I want to go home', litter: 'The litter here is really bad', disgusting: 'This path is disgusting', crowded: "It's too crowded here", scenery: 'The scenery here is wonderful', clean: 'This park is very clean and tidy', queue_long: `The queue for ${a} is too long`, spent_money: "I've spent all my money", cant_afford: `I can't afford ${a}`, not_safe: `I'm not going on ${a}, it isn't safe`, wow: 'Wow!', vandalism: 'The vandalism here is really bad', broken: `${a} has broken down`, raining: "I'm getting wet", fun: "I'm having a great time!", help: 'Help! I feel ill', bought: `I'm so glad I got a ${a}`, closed: `${a} is closed`, waiting: `I've been waiting ages for ${a}`, closed_park: 'The park is closed', fee: 'The entrance fee is too high', exciting: `${a} looks exciting`, photo: `What a great photo of the ${a}!`, gather: `Look at that ${a}!`, picnic: 'What a lovely spot for a picnic', theme: `${a} is out of this world!` };
  return map[t.t] ?? t.t;
}

export const rideLength = (r: Ride) => r.pieces.reduce((a, p) => a + PIECE_BY_KEY[p.type].length, 0);

/** The special pieces a ride's builder offers: inversions only where the type can go upside down, and only pieces the type may use. */
export function specials(r: Ride): [string, string][] {
  const c = RIDE_BY_KEY[r.type].coaster; const all: [string, string][] = [['station', 'Station'], ['loop', 'Vertical loop'], ['corkscrewL', 'Corkscrew left'], ['corkscrewR', 'Corkscrew right'], ['sbendL', 'S-bend left'], ['sbendR', 'S-bend right'], ['brakes', 'Brakes'], ['blockBrakes', 'Block brakes: a train waits here while the section ahead is busy (run 2–4 trains)'], ['booster', 'Booster'], ['photo', 'On-ride photo'], ['splash', 'Splash: the boat ploughs into the water and slows right down']];
  return all.filter(([k]) => (!PIECE_BY_KEY[k].inversion || c?.loops) && (!c?.pieces || c.pieces.includes(k)));
}
