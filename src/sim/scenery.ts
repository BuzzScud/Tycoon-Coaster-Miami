// Scenery catalogue: things you can place on a tile. Drawing lives in render/sprites.ts.
export interface SceneryDef { key: string; name: string; group: string; cost: number; height: number; excitement: number; directional?: boolean; waterable?: boolean; }

export const SCENERY: SceneryDef[] = [
  { key: 'tree_oak', name: 'Oak tree', group: 'trees', cost: 2500, height: 3, excitement: 1 },
  { key: 'tree_pine', name: 'Pine tree', group: 'trees', cost: 2200, height: 4, excitement: 1 },
  { key: 'tree_palm', name: 'Palm tree', group: 'trees', cost: 2800, height: 4, excitement: 1 },
  { key: 'tree_cherry', name: 'Cherry blossom', group: 'trees', cost: 3000, height: 3, excitement: 1 },
  { key: 'bush', name: 'Bush', group: 'gardens', cost: 800, height: 1, excitement: 1 },
  { key: 'flowers', name: 'Flower bed', group: 'gardens', cost: 1200, height: 0, excitement: 1, waterable: true },
  { key: 'hedge', name: 'Hedge', group: 'gardens', cost: 900, height: 1, excitement: 1 },
  { key: 'fountain', name: 'Fountain', group: 'gardens', cost: 6000, height: 2, excitement: 2 },
  { key: 'statue', name: 'Statue', group: 'gardens', cost: 9000, height: 3, excitement: 2 },
  { key: 'rock', name: 'Boulder', group: 'gardens', cost: 1500, height: 1, excitement: 1 },
  { key: 'lamp_post', name: 'Lamp post', group: 'furniture', cost: 700, height: 2, excitement: 0 },
  { key: 'sign', name: 'Park sign', group: 'furniture', cost: 2000, height: 2, excitement: 1, directional: true },
  { key: 'fence_wood', name: 'Wooden fence', group: 'furniture', cost: 500, height: 1, excitement: 0, directional: true },
  { key: 'umbrella_table', name: 'Picnic table', group: 'furniture', cost: 1800, height: 1, excitement: 1 },
];
export const SCENERY_BY_KEY: Record<string, SceneryDef> = Object.fromEntries(SCENERY.map(s => [s.key, s]));
export const SCENERY_GROUPS = [
  { key: 'trees', name: 'Trees' }, { key: 'gardens', name: 'Gardens' }, { key: 'furniture', name: 'Park furniture' },
];
