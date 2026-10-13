// Scenery catalogue: things you can place on the land. Every piece has a value (how much it lifts nearby rides and
// guests), a footprint (1×1, 2×2 or 3×3), and some have a use (guests sit, take photos or gather) or a theme.
import type { GameState } from './types';
import { tileAt } from './map';

export type SceneryUse = 'sit' | 'photo' | 'gather';
export interface SceneryDef {
  key: string; name: string; group: string; cost: number; height: number; excitement: number; directional?: boolean; waterable?: boolean;
  size?: 1 | 2 | 3;          // footprint in tiles (default 1)
  value?: number;            // lift to nearby rides and guests (default: excitement)
  theme?: 'space';           // a themed piece: enough of them round a ride of the same theme lift it further
  use?: SceneryUse;          // what guests do here
  recolour?: boolean;        // the player can pick its accent colour
  moves?: string;            // what animates, for the picker
}

export const SCENERY: SceneryDef[] = [
  { key: 'tree_oak', name: 'Oak tree', group: 'trees', cost: 2500, height: 3, excitement: 1, moves: 'sways in the wind' },
  { key: 'tree_pine', name: 'Pine tree', group: 'trees', cost: 2200, height: 4, excitement: 1 },
  { key: 'tree_palm', name: 'Palm tree', group: 'trees', cost: 2800, height: 4, excitement: 1 },
  { key: 'tree_cherry', name: 'Cherry blossom', group: 'trees', cost: 3000, height: 3, excitement: 1 },
  { key: 'bush', name: 'Bush', group: 'gardens', cost: 800, height: 1, excitement: 1 },
  { key: 'flowers', name: 'Flower bed', group: 'gardens', cost: 1200, height: 0, excitement: 1, waterable: true },
  { key: 'hedge', name: 'Hedge', group: 'gardens', cost: 900, height: 1, excitement: 1 },
  { key: 'fountain', name: 'Fountain', group: 'gardens', cost: 6000, height: 2, excitement: 2, use: 'gather' },
  { key: 'statue', name: 'Statue', group: 'gardens', cost: 9000, height: 3, excitement: 2, use: 'photo' },
  { key: 'rock', name: 'Boulder', group: 'gardens', cost: 1500, height: 1, excitement: 1 },
  { key: 'lamp_post', name: 'Lamp post', group: 'furniture', cost: 700, height: 2, excitement: 0 },
  { key: 'sign', name: 'Park sign', group: 'furniture', cost: 2000, height: 2, excitement: 1, directional: true, recolour: true },
  { key: 'fence_wood', name: 'Wooden fence', group: 'furniture', cost: 500, height: 1, excitement: 0, directional: true },
  { key: 'umbrella_table', name: 'Picnic table', group: 'furniture', cost: 1800, height: 1, excitement: 1, use: 'sit', recolour: true },
  // the Space set (retro 1950s space age), built at a realistic size next to the guests
  { key: 'space_launchpad', name: 'Launch pad', group: 'space', theme: 'space', cost: 60000, height: 28, excitement: 3, size: 3, value: 8, use: 'photo', recolour: true, moves: 'steam rolls off the pad' },
  { key: 'space_dome', name: 'Moon dome', group: 'space', theme: 'space', cost: 45000, height: 8, excitement: 3, size: 3, value: 7, use: 'gather', recolour: true, moves: 'its beacon blinks' },
  { key: 'space_rocket', name: 'Rocket', group: 'space', theme: 'space', cost: 25000, height: 21, excitement: 2, size: 2, value: 5, use: 'photo', recolour: true, moves: 'exhaust flickers' },
  { key: 'space_radar', name: 'Radar dish', group: 'space', theme: 'space', cost: 18000, height: 12, excitement: 2, size: 2, value: 4, recolour: true, moves: 'turns slowly' },
  { key: 'space_satellite', name: 'Satellite', group: 'space', theme: 'space', cost: 15000, height: 12, excitement: 2, size: 2, value: 4, recolour: true, moves: 'turns and bobs' },
  { key: 'space_saucer', name: 'Flying saucer', group: 'space', theme: 'space', cost: 22000, height: 11, excitement: 2, size: 2, value: 5, use: 'gather', recolour: true, moves: 'hovers and spins' },
  { key: 'space_beacon', name: 'Starburst beacon', group: 'space', theme: 'space', cost: 6000, height: 12, excitement: 2, value: 2, recolour: true, moves: 'spins' },
  { key: 'space_plant', name: 'Alien plant', group: 'space', theme: 'space', cost: 3000, height: 6, excitement: 1, value: 2, recolour: true, moves: 'sways' },
  { key: 'space_lamp', name: 'Atomic lamp', group: 'space', theme: 'space', cost: 4000, height: 9, excitement: 1, value: 2, recolour: true, moves: 'electrons orbit' },
  { key: 'space_astronaut', name: 'Astronaut statue', group: 'space', theme: 'space', cost: 12000, height: 11, excitement: 2, value: 3, use: 'photo', recolour: true, moves: 'flag waves' },
  { key: 'space_rocks', name: 'Moon rocks', group: 'space', theme: 'space', cost: 2000, height: 3, excitement: 1, value: 1 },
];
export const SCENERY_BY_KEY: Record<string, SceneryDef> = Object.fromEntries(SCENERY.map(s => [s.key, s]));
export const SCENERY_GROUPS = [
  { key: 'trees', name: 'Trees' }, { key: 'gardens', name: 'Gardens' }, { key: 'furniture', name: 'Park furniture' }, { key: 'space', name: 'Space' },
];
export const sizeOf = (kind: string) => SCENERY_BY_KEY[kind]?.size ?? 1;
export const valueOf = (kind: string) => { const d = SCENERY_BY_KEY[kind]; return d ? d.value ?? d.excitement : 0; };
/** The rides a theme belongs with: enough pieces of the theme near one of these lifts its excitement. */
export const THEME_RIDES: Record<string, string[]> = { space: ['space_rings', 'launched_freefall', 'motion_simulator', 'observation_tower'] };
export const THEME_MIN = 3, THEME_RADIUS = 6, THEME_LIFT = 0.15;

/** Every piece (counted once, by its corner tile) whose footprint comes within r tiles of the box x0..x1, y0..y1. */
export function sceneryAround(g: GameState, x0: number, y0: number, x1: number, y1: number, r: number, theme?: string): { value: number; themed: number; pieces: number } {
  const seen = new Set<number>(); let value = 0, themed = 0;
  for (let y = y0 - r; y <= y1 + r; y++) for (let x = x0 - r; x <= x1 + r; x++) {
    const t = tileAt(g, x, y); if (!t?.scenery) continue; const [rx, ry] = t.scenery.root ?? [x, y]; const k = ry * g.w + rx; if (seen.has(k)) continue; seen.add(k);
    value += valueOf(t.scenery.kind); if (theme && SCENERY_BY_KEY[t.scenery.kind]?.theme === theme) themed++;
  }
  return { value, themed, pieces: seen.size };
}
