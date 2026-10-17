// Scenario parks: hand-made starts with their own land, money, rides to begin with and goals against a clock. Meet
// every goal and hold it for two minutes to complete one; the more time to spare, the more stars (1–3). Stars are
// kept by the title screen; finishing parks in one tier opens the next.
import type { GameState } from './types';
import { newGame, cmdPath, cmdPlaceRide, undoStack, news } from './game';
import { type MapShape, terrace } from './map';
import { type Objective, goalRows, fmtGoal } from './goals';
import { researchQueue } from './research';
import { autoConnect } from './connect';
import { openRide } from './ridesim';

export interface Scenario {
  key: string; name: string; tier: 1 | 2 | 3; blurb: string;
  size: 'small' | 'medium' | 'large'; seed: number; difficulty: 'easy' | 'normal' | 'hard'; shape: MapShape; terrain: { hills: number; water: number; trees: number };
  cash: number; loan: number; maxLoan: number; minutes: number; climate?: number;
  objectives: Objective[]; invented: string[]; prebuild?: (g: GameState) => void;
}
export const TIERS = ['', 'Beginner', 'Challenging', 'Expert'];
const BASICS = ['burger_bar', 'drink_stall', 'balloon_stall', 'toilets', 'info_kiosk', 'scenery:trees', 'scenery:gardens', 'scenery:space'];

/** A few paths up from the gate and rides already standing (the park is not charged for them). */
function starter(rides: [string, number, number][]): (g: GameState) => void {
  return g => {
    const cash = g.finance.cash; g.finance.cash = 1e9; const ex = g.entrance.x, ey = g.entrance.y; const h0 = g.tiles[(ey - 2) * g.w + ex].h;
    for (let y = ey - 15; y <= ey - 3; y++) for (let x = ex - 7; x <= ex + 7; x++) { const t = g.tiles[y * g.w + x]; if (!t) continue; t.h = h0; t.water = false; t.scenery = null; t.owned = true; }   // a level clearing round the start
    terrace(g);
    for (let i = 3; i <= 12; i++) cmdPath(g, ex, ey - i, false, 0); for (let i = 1; i <= 5; i++) { cmdPath(g, ex - i, ey - 12, false, 0); cmdPath(g, ex + i, ey - 12, false, 0); }
    for (const [type, dx, dy] of rides) { const r = cmdPlaceRide(g, type, ex + dx, ey + dy, dx < 0 ? 0 : 2); if (!r.ok) continue; const ride = g.rides[g.rides.length - 1]; if (autoConnect(g, ride.id).ok && ride.type !== 'burger_bar' && ride.type !== 'toilets') openRide(g, ride); }
    g.finance.cash = cash; g.finance.expenditure = [g.finance.expenditure[0].map(() => 0)]; undoStack.length = 0;
  };
}

export const SCENARIOS: Scenario[] = [
  { key: 'forest_glade', name: 'Forest Glade', tier: 1, blurb: 'A clearing in the woods with a carousel already turning. Bring in the families.',
    size: 'small', seed: 1101, difficulty: 'easy', shape: 'forest', terrain: { hills: 0.4, water: 0.3, trees: 1.2 }, cash: 1000000, loan: 0, maxLoan: 1500000, minutes: 45,
    objectives: [{ kind: 'guests', target: 250 }, { kind: 'rating', target: 600 }], invented: [...BASICS, 'merry_go_round', 'ferris_wheel', 'spiral_slide', 'junior_coaster', 'twist'],
    prebuild: starter([['merry_go_round', -4, -10], ['burger_bar', 3, -13]]) },
  { key: 'lakeside', name: 'Lakeside Gardens', tier: 1, blurb: 'A calm lake in the middle of the park. Put rides round the water and a flume on it.',
    size: 'medium', seed: 1202, difficulty: 'normal', shape: 'lake', terrain: { hills: 0.5, water: 0.2, trees: 0.8 }, cash: 1500000, loan: 500000, maxLoan: 2000000, minutes: 60,
    objectives: [{ kind: 'guests', target: 400 }, { kind: 'rating', target: 620 }, { kind: 'water', target: 1 }], invented: [...BASICS, 'merry_go_round', 'ferris_wheel', 'twist', 'log_flume', 'mini_railway', 'junior_coaster', 'ice_cream_stall'] },
  { key: 'boardwalk_bay', name: 'Boardwalk Bay', tier: 1, blurb: 'Miami sun, a sandy beach and the sea. Hot days: water rides and ice cream sell themselves.',
    size: 'medium', seed: 1303, difficulty: 'normal', shape: 'beach', terrain: { hills: 0.3, water: 0.1, trees: 0.4 }, cash: 1500000, loan: 500000, maxLoan: 2000000, minutes: 60, climate: 7,
    objectives: [{ kind: 'water', target: 3 }, { kind: 'guests', target: 450 }, { kind: 'rating', target: 640 }], invented: [...BASICS, 'log_flume', 'river_rapids', 'merry_go_round', 'ferris_wheel', 'ice_cream_stall', 'lemonade_stall'] },
  { key: 'canyon_run', name: 'Canyon Run', tier: 2, blurb: 'A river cuts through rocky hills. Use the drops: build coasters that thrill.',
    size: 'medium', seed: 2101, difficulty: 'normal', shape: 'canyon', terrain: { hills: 1, water: 0.2, trees: 0.6 }, cash: 2500000, loan: 1000000, maxLoan: 3000000, minutes: 75,
    objectives: [{ kind: 'coasters', target: 3, extra: 500 }, { kind: 'rating', target: 680 }], invented: [...BASICS, 'merry_go_round', 'ferris_wheel', 'junior_coaster', 'wooden_coaster', 'mine_train', 'twist'] },
  { key: 'desert_mirage', name: 'Desert Mirage', tier: 2, blurb: 'Hot sand, a few palms and very thirsty guests. Turn the heat into money.',
    size: 'medium', seed: 2202, difficulty: 'normal', shape: 'desert', terrain: { hills: 0.6, water: 0.05, trees: 0.5 }, cash: 1000000, loan: 1000000, maxLoan: 3000000, minutes: 75, climate: 9,
    objectives: [{ kind: 'cash', target: 3000000 }, { kind: 'guests', target: 500 }], invented: [...BASICS, 'merry_go_round', 'ferris_wheel', 'twist', 'mine_train', 'ice_cream_stall', 'lemonade_stall', 'log_flume'] },
  { key: 'island_hop', name: 'Island Hop', tier: 2, blurb: 'Four islands joined by narrow causeways. Plan the paths, then fill every island.',
    size: 'large', seed: 2303, difficulty: 'normal', shape: 'island', terrain: { hills: 0.4, water: 0.1, trees: 0.6 }, cash: 2000000, loan: 1000000, maxLoan: 3000000, minutes: 90,
    objectives: [{ kind: 'guests', target: 650 }, { kind: 'rating', target: 680 }], invented: [...BASICS, 'merry_go_round', 'ferris_wheel', 'spiral_slide', 'twist', 'mini_railway', 'junior_coaster', 'log_flume'] },
  { key: 'thrill_valley', name: 'Thrill Valley', tier: 3, blurb: 'Deep pockets and steep hills. Build the most exciting coaster this valley has seen.',
    size: 'large', seed: 3101, difficulty: 'hard', shape: 'plain', terrain: { hills: 1, water: 0.4, trees: 0.8 }, cash: 5000000, loan: 0, maxLoan: 5000000, minutes: 90,
    objectives: [{ kind: 'bestCoaster', target: 700 }, { kind: 'coasters', target: 4, extra: 550 }, { kind: 'rating', target: 700 }], invented: [...BASICS, 'merry_go_round', 'twist', 'junior_coaster', 'wooden_coaster', 'mine_train', 'steel_twister', 'inverted_coaster', 'top_spin'] },
  { key: 'miami_mega', name: 'Miami Mega Park', tier: 3, blurb: 'A huge plot by the sea, a big loan and a big city. Fill it, rate it, and pay the bank back.',
    size: 'large', seed: 3202, difficulty: 'hard', shape: 'beach', terrain: { hills: 0.5, water: 0.3, trees: 0.6 }, cash: 1000000, loan: 2000000, maxLoan: 3000000, minutes: 120, climate: 7,
    objectives: [{ kind: 'guests', target: 1000 }, { kind: 'rating', target: 720 }, { kind: 'noLoan', target: 0 }], invented: [...BASICS, 'merry_go_round', 'ferris_wheel', 'twist', 'junior_coaster', 'log_flume', 'ice_cream_stall'] },
];
export const SCENARIO_BY_KEY: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map(s => [s.key, s]));

/** A new park for this scenario: its land, money, starting rides (the rest to research), goals and any rides already built. */
export function newScenario(key: string, tempo = 0): GameState {
  const s = SCENARIO_BY_KEY[key]; if (!s) throw new Error('Unknown scenario ' + key);
  const g = newGame({ name: s.name, size: s.size, cash: s.cash, loan: s.loan, maxLoan: s.maxLoan, difficulty: s.difficulty, sandbox: false, seed: s.seed, goalMinutes: s.minutes, tempo, terrain: s.terrain, shape: s.shape });
  g.climate = s.climate ?? 0; g.weather.temp += g.climate;
  g.research.invented = [...s.invented]; g.research.queue = researchQueue(g); g.research.stage = g.research.queue.length ? 'initial' : 'done'; g.research.current = null;
  g.goals!.targets = s.objectives; g.goals!.scenario = s.key;
  g.news = []; g.chronicle = []; s.prebuild?.(g);
  news(g, 'park', `${s.name}: ${s.blurb}`);
  news(g, 'park', `Goals in ${s.minutes} minutes: ${goalRows(g, g.goals!).map(r => `${r.label.toLowerCase()} ${r.key === 'noLoan' ? '' : fmtGoal(r.target, r.fmt)}`.trim()).join(', ')}. Hold them all for two minutes.`);
  return g;
}
