// Core data model. Pure data, no DOM. Everything here is JSON-serialisable (saves are a JSON dump of GameState).

export const TICKS_PER_SEC = 40;          // like the original: 40 simulation ticks a second
export const MONTH_TICKS = 16384;         // one in-game month (~6.8 minutes at normal speed)
export const WEEK_TICKS = MONTH_TICKS / 4;
export const FORTNIGHT_TICKS = MONTH_TICKS / 2;
export const MONTHS = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'];
export const DAYS_IN_MONTH = [31, 30, 31, 30, 31, 31, 30, 31];

export const Z_PX = 8;                    // screen pixels per height unit (internal pixels)
export const LAND_STEP = 2;               // land heights move in steps of 2 height units (16 px), like RCT
export const TILE_M = 6;                  // one tile is 6 metres across (for speeds and lengths)
export const UNIT_M = 1.5;                // one height unit is 1.5 metres

export type Dir = 0 | 1 | 2 | 3;          // 0 = +x (east), 1 = +y (south), 2 = -x (west), 3 = -y (north)
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export const enum Surface { Grass = 0, Sand = 1, Dirt = 2, Rock = 3, GrassDark = 4 }

export interface PathAdds { bench?: boolean; lamp?: boolean; bin?: number /* 0..8 litter inside; 8 = full */; }
export interface PathTile {
  z: number;                  // height of the path's low end (height units); a tile can hold several paths at different heights
  queue: boolean;
  rideId: number | null;      // queue paths belong to a ride once connected
  style: number;              // 0 tarmac, 1 brown brick, 2 crazy paving
  slope: Dir | -1;            // -1 flat; otherwise the direction that goes UP one land step
  adds: PathAdds;
  broken?: boolean;           // vandalised bench/lamp
}
export interface SceneryItem { kind: string; rot: Dir; age: number; root?: [number, number]; colour?: number; }   // kind indexes SCENERY in scenery.ts; a big piece sits on every tile it covers, root = its corner tile

export interface TileRef { rideId: number; piece: number; }   // a track piece sitting on this tile

export interface Tile {
  h: number;                  // land height at the tile's lowest corner, in height units (a multiple of LAND_STEP)
  slope?: number;             // RCT's slope bits: corners raised one land step (N 1 · E 2 · S 4 · W 8), 16 = steep (the corner
                              // opposite the low one two steps up). Absent or 0 = flat. Corners: S (0,0) E (1,0) N (1,1) W (0,1)
  surf: Surface;
  water: boolean;             // the tile has water (its surface is above some of the land)
  wz?: number;                // the water's surface height (absent on old saves: h + LAND_STEP when water)
  owned: boolean;
  paths: PathTile[];          // paths on this tile, lowest first: on the ground, on bridges above it, in tunnels below it
  scenery: SceneryItem | null;
  rideId: number | null;      // a flat ride or stall standing on this tile (its footprint)
  entrance: { rideId: number; exit: boolean; dir: Dir } | null;  // ride entrance / exit hut, dir = side the path is on
  tracks: TileRef[];          // coaster track pieces above this tile
  litter: number;             // pieces of litter (0..)
  vomit: number;
  litterAge: number;          // ticks since the oldest litter landed
}

// ---------- rides ----------
export type RideCategory = 'transport' | 'gentle' | 'coaster' | 'thrill' | 'water' | 'stall';
export type RideStatus = 'closed' | 'open' | 'testing';
export interface Ratings { e: number; i: number; n: number }   // hundredths: 612 = 6.12

export interface TrackPiece {
  type: string;               // key into TRACK_PIECES
  x: number; y: number; z: number;   // origin tile + height (height units) at the piece START
  dir: Dir;                   // travel direction entering the piece
  chain: boolean;             // chain lift on this piece
  bank: -1 | 0 | 1;           // banked left / none / right (turns only)
}

export interface Train { cars: number; pos: number; v: number; state: 'station' | 'running' | 'crashed'; wait: number; riders: number[]; lapStart: number; maxV: number; V?: number; acc?: number; lap?: number; back?: boolean; }   // V, acc: RCT's velocity and acceleration (trains on RCT track); back: a shuttle on its way back

export interface RideStats {
  length: number;             // metres
  maxSpeed: number;           // m/s
  avgSpeed: number;
  duration: number;           // ticks for one lap
  drops: number;
  highestDrop: number;        // height units
  maxPosG: number; maxNegG: number; maxLatG: number;
  airTime: number;            // ticks with negative vertical G
  inversions: number;
  helices?: number;           // helix quarters (sloped large turns)
  splashes?: number;          // water splashes taken at speed
  turns: number; bankedTurns: number;
  sheltered: number;          // pieces under cover (always 0 for now)
  completed: boolean;         // the test train got round
  failReason?: string;
  rct?: import('./rct/ratings').RctStats;   // RCT's own measurements (rides on RCT track), which its ratings use
}

export interface Ride {
  id: number;
  type: string;               // key into RIDE_TYPES
  name: string;
  x: number; y: number;       // origin tile of the footprint (flat rides / stalls) or the first station piece
  rot: Dir;                   // orientation (stalls face rot; flat rides use it for the entrance side)
  status: RideStatus;
  price: number;              // cents
  price2: number;             // secondary item price (photos, drinks at a kiosk)
  ratings: Ratings | null;
  stats: RideStats | null;
  built: number;              // months elapsed when built
  reliability: number;        // 0..25000 (like the original); 25000 = new
  breakdown: null | { type: string; since: number; mechanicId: number | null; fixing: number };
  lastInspection: number;     // ticks since
  inspection: number;         // interval in minutes: 10, 20, 30, 45, 60, 120, 0 (never)
  downtime: number;           // % recent
  downHist: number;           // ticks broken in the current window
  customers: number;          // total riders
  recent: number[];           // riders per 5-minute window (last 8)
  income: number;             // cents, total
  incomeHist: number[];       // per month, cents
  popularity: number;         // 0..255 moving estimate of "want to ride" vs "refused"
  satisfaction: number;       // 0..255
  value: number;              // computed ride value (cents) for pricing
  queue: number[];            // guest ids in the queue, head first
  riders: number[];           // guest ids on the ride right now (flat rides)
  cycle: number;              // ticks into the current run (flat rides)
  running: boolean;
  colours: [number, number, number];   // palette indexes
  entrance: { x: number; y: number; dir: Dir } | null;
  exit: { x: number; y: number; dir: Dir } | null;
  pieces: TrackPiece[];       // coasters only
  trains: Train[];
  numTrains: number; carsPerTrain: number;
  mode?: string;              // RCT operating mode (continuousCircuit, poweredLaunch…); absent = the ride type's default
  liftSpeed?: number;         // RCT lift hill speed setting (about mph); absent = the ride type's lowest
  launchSpeed?: number;       // RCT launch speed setting (launched modes)
  circuits?: number;          // laps a train makes before it stops at the station (RCT allows 1–7)
  option?: number;            // a flat ride's operating option as RCT has it: rotations, swings, laps, minutes…
  departLoad?: number;        // leave with: 0 any riders, 1 a quarter, 2 half, 3 three quarters, 4 a full train
  minWait?: number; maxWait?: number;   // seconds a train waits at least / at most
  leaveWhenAnother?: boolean; // leave when another train arrives behind
  closedLoop: boolean;
  z0?: number;   // where the first piece goes, when not on the ground (a ready-made ride raised so its lowest dip clears the ground)
  crashes: number;
  thoughtGood: number; thoughtBad: number;
}

// ---------- people ----------
export type GuestState = 'entering' | 'walking' | 'queuing' | 'riding' | 'leavingRide' | 'sitting' | 'buying' | 'leaving' | 'left' | 'watching' | 'admiring';
export interface Thought { t: string; arg?: string; age: number; at?: number /* packed tile where it was thought */ }

export interface Guest {
  id: number;
  name: string;
  x: number; y: number;       // tile units (float), feet position
  z: number;
  dir: Dir;
  tx: number; ty: number;     // current tile
  state: GuestState;
  happiness: number; happinessTarget: number;
  energy: number; energyTarget: number;
  hunger: number; thirst: number; toilet: number;
  nausea: number; nauseaTarget: number;
  nauseaTol: 0 | 1 | 2 | 3;  // none, low, average, high
  intMin: number; intMax: number;   // intensity preference, whole numbers (e.g. 4..7)
  cash: number;               // cents
  spent: number;
  items: { balloon: number | null; umbrella: boolean; map: boolean; hat: boolean; food: string | null; drink: string | null; photo: boolean; souvenir: boolean };
  eatTimer: number;           // ticks of food/drink left
  thoughts: Thought[];
  entered: number;            // tick when entered
  ridesTaken: number;
  prevRide: number | null;
  favourite: number | null;
  headingTo: number | null;   // ride id the guest wants
  dest: { x: number; y: number } | null;   // tile they are walking towards
  route: number[] | null;     // packed tile keys to follow
  lostTimer: number;
  queueTime: number;
  rideId: number | null;      // ride being queued for / ridden
  sitTimer: number;
  watchTimer: number;
  shirt: number; trousers: number; hair: number;
  litterTimer: number;
  angry: number;
  vouchers: number;
  flags: { leaving: boolean; paidEntry: boolean; tracked: boolean; sick: boolean; lost: boolean; crowded: boolean; atm?: number };   // atm: cash machine visits
  walkPhase: number;
  pz?: number;                // height of the path they stand on (a tile can hold several)
  using?: { x: number; y: number; act: 'sit' | 'photo' | 'gather'; kind: string } | null;   // admiring: the piece being used (its centre)
  usedAt?: number;   // tick of the last use, so a guest does not stop at every piece
  // RCT pathfinding (rct/pathfind.ts): the path piece they are walking to, chosen one junction at a time
  aim?: [number, number, number] | null;
  pf?: { goal: number; keys: number[]; tried: number[]; next: number } | null;   // junctions passed on the way to the aim, ways tried
  lostCd?: number;            // RCT's guestIsLostCountdown: dead ends left before giving up on a ride (or before 'can't find the exit')
  aimSteps?: number;          // tiles walked toward the current aim
  ridden?: number[];          // rides this guest has been on (RCT picks only rides they have not tried)
  surround?: number;          // 512-tick updates since they last took in their surroundings
  onRide?: number;            // 512-tick updates on the current ride
  want?: string | null;       // what they are on the way to a stall for
  boardTick?: number;         // tick they boarded the ride they are on
}

export type StaffType = 'handyman' | 'mechanic' | 'security' | 'entertainer';
export interface Staff {
  id: number; type: StaffType; name: string;
  x: number; y: number; z: number; dir: Dir; tx: number; ty: number;
  state: 'walking' | 'sweeping' | 'emptying' | 'mowing' | 'heading' | 'fixing' | 'inspecting' | 'entertaining' | 'watering';
  timer: number;
  target: number | null;      // ride id (mechanic) or tile key
  route: number[] | null;
  dest: { x: number; y: number } | null;
  costume: number;            // entertainers
  patrol?: number[];          // patrol area: 4×4-tile squares (see staff.ts patrolCell); absent or empty = the whole park
  stats: { litterSwept: number; binsEmptied: number; lawnsMown: number; ridesFixed: number; ridesInspected: number; vandalsStopped: number };
  walkPhase: number;
  pz?: number;
}

// ---------- park ----------
export interface Finance {
  cash: number;               // cents
  loan: number; maxLoan: number; interestRate: number;   // % per year
  entranceFee: number;        // cents; 0 = free
  payPerRide: boolean;        // true: rides charge; entrance can be charged too (classic RCT1 allowed both)
  expenditure: number[][];    // [month][category] cents, newest first (16 months)
  categories: string[];
  researchFunding: 0 | 1 | 2 | 3;
  researchPriorities: Record<string, boolean>;
  value: number;              // park value
  companyValue: number;
  weeklyProfit: number;
}

export interface Campaign { type: number; weeksLeft: number; rideId: number | null; item: string | null }

export interface Research {
  stage: 'idle' | 'initial' | 'designing' | 'completing' | 'done';
  progress: number;           // 0..65535
  current: string | null;     // ride type or scenery group being researched
  queue: string[];            // uninvented, in order
  invented: string[];
  lastInvented: string | null;
  expectedMonth: number | null;
}

export interface NewsItem { tick: number; icon: string; text: string; subject?: { kind: 'ride' | 'guest' | 'staff' | 'tile'; id?: number; x?: number; y?: number } }

export interface Weather { month: number; temp: number; kind: 0 | 1 | 2 | 3 | 4 | 5; /* sunny, partly cloudy, cloudy, rain, heavy rain, thunder */ next: number; rainLevel: number; gloom: number; }

export interface Award { type: number; time: number }

export interface GameState {
  version: number;
  seed: number; rng: number;
  tick: number;               // total ticks
  monthTick: number;          // ticks into the month
  monthsElapsed: number;
  speed: 0 | 1 | 2 | 3 | 4;   // 0 paused
  parkName: string;
  w: number; h: number;
  tiles: Tile[];              // row-major y*w+x
  rides: Ride[]; nextRideId: number;
  guests: Guest[]; nextGuestId: number;
  staff: Staff[]; nextStaffId: number;
  finance: Finance;
  research: Research;
  campaigns: Campaign[];
  news: NewsItem[];
  weather: Weather;
  awards: Award[];
  rating: number; ratingHist: number[]; guestHist: number[]; cashHist: number[];
  goals?: import('./goals').Goals | null;            // optional clock + targets (absent = free play)
  history?: import('./goals').HistPoint[];           // weekly samples for the park report
  chronicle?: { tick: number; text: string }[];      // every message, for the park report
  ratingCasualtyPenalty: number;
  parkOpen: boolean;
  entrance: { x: number; y: number; dir: Dir };    // the two-tile arch's first tile and the inward direction
  spawn: { x: number; y: number };                 // off-park tile where guests appear
  guestsInPark: number; totalAdmissions: number;
  suggestedMax: number;
  difficultGuests: boolean;
  lostCount: number;
  stats: { totalRidesTaken: number; vomits: number; litterSwept: number; crashesEver: number };
  noMoney: boolean;
  landPrice: number;
  musicOn: boolean;
  tempo?: number;             // index into TEMPOS (time.ts); absent = normal
  event?: import('./events').ParkEvent | null;      // a park event running now (help-only)
  eventsOff?: boolean;        // Options: no park events
  guestNumbers?: boolean;     // Options: guests called "Guest 123" instead of real names
  climate?: number;           // °C added to the weather (a desert or beach scenario)
}

export const key = (x: number, y: number) => (y << 10) | x;       // pack a tile coordinate (maps up to 1024 wide)
export const unkey = (k: number): [number, number] => [k & 1023, k >> 10];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const money = (cents: number) => {
  const neg = cents < 0; const v = Math.abs(Math.round(cents));
  const whole = Math.floor(v / 100), frac = v % 100;
  return (neg ? '-$' : '$') + whole.toLocaleString('en-US') + (frac ? '.' + String(frac).padStart(2, '0') : '');
};
