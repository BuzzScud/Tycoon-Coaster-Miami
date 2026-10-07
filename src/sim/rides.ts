// Ride, coaster and stall catalogue. Numbers follow the original's spirit (ratings in hundredths, money in cents).
import type { Ratings, RideCategory } from './types';

export interface CoasterDef {
  style: 'wood' | 'steel' | 'mine' | 'inverted' | 'junior';
  maxHeight: number;          // height units above the ground
  liftSpeed: number;          // m/s on chain lifts
  friction: number;           // rolling friction (fraction of speed lost per second)
  loops: boolean;             // vertical loops allowed
  cars: number; seats: number;
  carColour: number;
  pieceCost: number;          // cents per track piece
  requirements: { minLength: number; minDrop: number; minSpeed: number; minDrops: number; needNegG: boolean };
}

export interface RideTypeDef {
  key: string; name: string; category: RideCategory; kind: 'flat' | 'coaster' | 'stall';
  size: 1 | 2 | 3;            // footprint n × n (flat rides / stalls)
  cost: number;               // cents (flat / stall build cost, coaster station cost)
  upkeep: number;             // cents per fortnight
  capacity: number;           // riders per cycle (flat)
  rideTicks: number;          // flat ride run time in ticks
  base: Ratings | null;       // flat rides: their ratings; coasters: base ratings for the formula
  bonusValue: number;         // soft guest cap contribution
  unreliability: number;      // reliability lost per check
  price: number;              // default price in cents
  multipliers: [number, number, number];
  height: number;             // sprite height in height units (for drawing order / clearance)
  sheltered: boolean;         // indoors: runs in the rain
  item?: string; itemCost?: number; itemPrice?: number;   // stalls
  item2?: string; item2Cost?: number; item2Price?: number;
  facility?: 'toilet' | 'info' | 'firstaid';
  coaster?: CoasterDef;
  description: string;
  research: 'gentle' | 'thrill' | 'coaster' | 'stall';
  breakdowns: string[];
}

const BD_FLAT = ['safety_cut_out', 'restraints_closed', 'restraints_open', 'control_failure'];
const BD_COASTER = ['safety_cut_out', 'restraints_closed', 'restraints_open', 'vehicle_malfunction', 'brakes_failure', 'control_failure'];

export const RIDE_TYPES: RideTypeDef[] = [
  // ---------- gentle ----------
  { key: 'merry_go_round', name: 'Merry-Go-Round', category: 'gentle', kind: 'flat', size: 2, cost: 45000, upkeep: 2500, capacity: 16, rideTicks: 1200, base: { e: 100, i: 35, n: 30 }, bonusValue: 45, unreliability: 16, price: 100, multipliers: [50, 10, 0], height: 5, sheltered: false, description: 'Galloping horses on a spinning platform. A classic for everyone.', research: 'gentle', breakdowns: BD_FLAT },
  { key: 'ferris_wheel', name: 'Ferris Wheel', category: 'gentle', kind: 'flat', size: 2, cost: 56000, upkeep: 2500, capacity: 24, rideTicks: 2400, base: { e: 100, i: 40, n: 35 }, bonusValue: 45, unreliability: 16, price: 150, multipliers: [50, 10, 0], height: 9, sheltered: false, description: 'A tall wheel with gondolas and a view over the whole park.', research: 'gentle', breakdowns: BD_FLAT },
  { key: 'spiral_slide', name: 'Spiral Slide', category: 'gentle', kind: 'flat', size: 2, cost: 32000, upkeep: 2000, capacity: 8, rideTicks: 1000, base: { e: 150, i: 140, n: 90 }, bonusValue: 25, unreliability: 10, price: 100, multipliers: [50, 10, 0], height: 7, sheltered: false, description: 'Climb the tower, grab a mat and spiral back down.', research: 'gentle', breakdowns: BD_FLAT },
  { key: 'dodgems', name: 'Dodgems', category: 'gentle', kind: 'flat', size: 3, cost: 48000, upkeep: 3000, capacity: 24, rideTicks: 2000, base: { e: 135, i: 50, n: 65 }, bonusValue: 35, unreliability: 16, price: 150, multipliers: [50, 10, 0], height: 3, sheltered: true, description: 'Bumper cars under a roof. Mild, noisy, and loved by kids.', research: 'gentle', breakdowns: BD_FLAT },
  { key: 'haunted_house', name: 'Haunted House', category: 'gentle', kind: 'flat', size: 2, cost: 72000, upkeep: 3000, capacity: 24, rideTicks: 2400, base: { e: 341, i: 153, n: 10 }, bonusValue: 22, unreliability: 8, price: 200, multipliers: [50, 10, 0], height: 7, sheltered: true, description: 'A dark walk-through full of surprises. Runs in any weather.', research: 'gentle', breakdowns: BD_FLAT },
  { key: 'observation_tower', name: 'Observation Tower', category: 'gentle', kind: 'flat', size: 1, cost: 80000, upkeep: 2500, capacity: 20, rideTicks: 2600, base: { e: 150, i: 5, n: 10 }, bonusValue: 45, unreliability: 15, price: 150, multipliers: [50, 10, 0], height: 16, sheltered: false, description: 'A slow rotating cabin that rises high above the park.', research: 'gentle', breakdowns: BD_FLAT },
  { key: 'circus', name: 'Circus', category: 'gentle', kind: 'flat', size: 3, cost: 60000, upkeep: 3500, capacity: 60, rideTicks: 3600, base: { e: 210, i: 30, n: 0 }, bonusValue: 39, unreliability: 9, price: 200, multipliers: [50, 10, 0], height: 6, sheltered: true, description: 'A big top with a clown show. Huge capacity, zero nausea.', research: 'gentle', breakdowns: BD_FLAT },
  // ---------- thrill ----------
  { key: 'twist', name: 'Twist', category: 'thrill', kind: 'flat', size: 2, cost: 52000, upkeep: 2800, capacity: 24, rideTicks: 1800, base: { e: 113, i: 97, n: 190 }, bonusValue: 40, unreliability: 16, price: 150, multipliers: [50, 10, 0], height: 3, sheltered: false, description: 'Spinning cars on spinning arms. Cheap thrills, queasy stomachs.', research: 'thrill', breakdowns: BD_FLAT },
  { key: 'swinging_ship', name: 'Swinging Ship', category: 'thrill', kind: 'flat', size: 2, cost: 64000, upkeep: 3000, capacity: 32, rideTicks: 2000, base: { e: 150, i: 190, n: 141 }, bonusValue: 35, unreliability: 10, price: 150, multipliers: [50, 10, 0], height: 8, sheltered: false, description: 'A pirate ship that swings higher and higher.', research: 'thrill', breakdowns: BD_FLAT },
  { key: 'launched_freefall', name: 'Launched Freefall', category: 'thrill', kind: 'flat', size: 1, cost: 95000, upkeep: 3500, capacity: 12, rideTicks: 1400, base: { e: 270, i: 300, n: 350 }, bonusValue: 50, unreliability: 16, price: 250, multipliers: [50, 10, 0], height: 20, sheltered: false, description: 'Fired up a tower, then dropped. Not for the faint-hearted.', research: 'thrill', breakdowns: BD_FLAT },
  { key: 'top_spin', name: 'Top Spin', category: 'thrill', kind: 'flat', size: 2, cost: 88000, upkeep: 3200, capacity: 20, rideTicks: 1800, base: { e: 240, i: 310, n: 400 }, bonusValue: 55, unreliability: 19, price: 200, multipliers: [50, 10, 0], height: 7, sheltered: false, description: 'Two arms flip a gondola over and over.', research: 'thrill', breakdowns: BD_FLAT },
  { key: 'space_rings', name: 'Space Rings', category: 'thrill', kind: 'flat', size: 1, cost: 30000, upkeep: 1500, capacity: 8, rideTicks: 1400, base: { e: 150, i: 210, n: 650 }, bonusValue: 12, unreliability: 7, price: 100, multipliers: [50, 10, 0], height: 4, sheltered: false, description: 'Strapped into a gyroscope ring. Tiny footprint, big nausea.', research: 'thrill', breakdowns: BD_FLAT },
  { key: 'motion_simulator', name: 'Motion Simulator', category: 'thrill', kind: 'flat', size: 2, cost: 70000, upkeep: 2800, capacity: 8, rideTicks: 1800, base: { e: 240, i: 210, n: 170 }, bonusValue: 24, unreliability: 21, price: 200, multipliers: [50, 10, 0], height: 5, sheltered: true, description: 'A cabin that tilts with the film. Dry even in a storm.', research: 'thrill', breakdowns: BD_FLAT },
  // ---------- roller coasters ----------
  { key: 'junior_coaster', name: 'Junior Roller Coaster', category: 'coaster', kind: 'coaster', size: 1, cost: 60000, upkeep: 2500, capacity: 0, rideTicks: 0, base: { e: 240, i: 250, n: 180 }, bonusValue: 50, unreliability: 13, price: 150, multipliers: [50, 30, 10], height: 4, sheltered: false, description: 'A small steel coaster with gentle hills. Great first coaster.', research: 'coaster', breakdowns: BD_COASTER,
    coaster: { style: 'junior', maxHeight: 12, liftSpeed: 2.5, friction: 0.012, loops: false, cars: 4, seats: 2, carColour: 7, pieceCost: 2500, requirements: { minLength: 60, minDrop: 2, minSpeed: 6, minDrops: 1, needNegG: false } } },
  { key: 'wooden_coaster', name: 'Wooden Roller Coaster', category: 'coaster', kind: 'coaster', size: 1, cost: 90000, upkeep: 4000, capacity: 0, rideTicks: 0, base: { e: 320, i: 260, n: 200 }, bonusValue: 105, unreliability: 19, price: 200, multipliers: [52, 33, 8], height: 4, sheltered: false, description: 'Rattling wooden track, big drops and air time. The classic.', research: 'coaster', breakdowns: BD_COASTER,
    coaster: { style: 'wood', maxHeight: 41, liftSpeed: 2.3, friction: 0.016, loops: false, cars: 5, seats: 4, carColour: 0, pieceCost: 3500, requirements: { minLength: 160, minDrop: 10, minSpeed: 10, minDrops: 1, needNegG: true } } },
  { key: 'mine_train', name: 'Mine Train Coaster', category: 'coaster', kind: 'coaster', size: 1, cost: 85000, upkeep: 3500, capacity: 0, rideTicks: 0, base: { e: 290, i: 230, n: 210 }, bonusValue: 60, unreliability: 16, price: 200, multipliers: [50, 30, 10], height: 4, sheltered: false, description: 'Runaway mine cars that hug the hills. Fast turns, few drops.', research: 'coaster', breakdowns: BD_COASTER,
    coaster: { style: 'mine', maxHeight: 22, liftSpeed: 2.5, friction: 0.014, loops: false, cars: 6, seats: 2, carColour: 10, pieceCost: 3000, requirements: { minLength: 150, minDrop: 6, minSpeed: 8, minDrops: 1, needNegG: false } } },
  { key: 'steel_twister', name: 'Steel Twister Coaster', category: 'coaster', kind: 'coaster', size: 1, cost: 120000, upkeep: 4500, capacity: 0, rideTicks: 0, base: { e: 350, i: 40, n: 30 }, bonusValue: 120, unreliability: 15, price: 300, multipliers: [52, 36, 10], height: 4, sheltered: false, description: 'Smooth steel track that loops, dives and banks hard.', research: 'coaster', breakdowns: BD_COASTER,
    coaster: { style: 'steel', maxHeight: 54, liftSpeed: 2.8, friction: 0.011, loops: true, cars: 6, seats: 4, carColour: 1, pieceCost: 5000, requirements: { minLength: 220, minDrop: 10, minSpeed: 12, minDrops: 1, needNegG: false } } },
  { key: 'inverted_coaster', name: 'Inverted Roller Coaster', category: 'coaster', kind: 'coaster', size: 1, cost: 140000, upkeep: 5000, capacity: 0, rideTicks: 0, base: { e: 360, i: 280, n: 320 }, bonusValue: 100, unreliability: 17, price: 300, multipliers: [50, 30, 10], height: 6, sheltered: false, description: 'Riders hang beneath the track with their feet in the air.', research: 'coaster', breakdowns: BD_COASTER,
    coaster: { style: 'inverted', maxHeight: 38, liftSpeed: 2.8, friction: 0.011, loops: true, cars: 7, seats: 4, carColour: 4, pieceCost: 5500, requirements: { minLength: 220, minDrop: 10, minSpeed: 12, minDrops: 1, needNegG: false } } },
  // ---------- stalls & facilities ----------
  { key: 'burger_bar', name: 'Burger Bar', category: 'stall', kind: 'stall', size: 1, cost: 40000, upkeep: 1200, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 150, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'burger', itemCost: 50, itemPrice: 150, description: 'Burgers to go. Fills hungry guests fast.', research: 'stall', breakdowns: [] },
  { key: 'fries_stall', name: 'Fries Stall', category: 'stall', kind: 'stall', size: 1, cost: 36000, upkeep: 1100, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 150, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'chips', itemCost: 40, itemPrice: 150, description: 'Hot salty fries.', research: 'stall', breakdowns: [] },
  { key: 'pizza_stall', name: 'Pizza Stall', category: 'stall', kind: 'stall', size: 1, cost: 42000, upkeep: 1200, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 160, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'pizza', itemCost: 60, itemPrice: 160, description: 'Pizza slices.', research: 'stall', breakdowns: [] },
  { key: 'hot_dog_stall', name: 'Hot Dog Stall', category: 'stall', kind: 'stall', size: 1, cost: 36000, upkeep: 1100, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 100, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'hotDog', itemCost: 50, itemPrice: 100, description: 'Hot dogs with everything on.', research: 'stall', breakdowns: [] },
  { key: 'ice_cream_stall', name: 'Ice Cream Stall', category: 'stall', kind: 'stall', size: 1, cost: 34000, upkeep: 1000, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 90, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'iceCream', itemCost: 40, itemPrice: 90, description: 'Sells best on hot days.', research: 'stall', breakdowns: [] },
  { key: 'candy_floss_stall', name: 'Candy Floss Stall', category: 'stall', kind: 'stall', size: 1, cost: 30000, upkeep: 900, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 80, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'candyfloss', itemCost: 30, itemPrice: 80, description: 'Pink sugar clouds.', research: 'stall', breakdowns: [] },
  { key: 'drink_stall', name: 'Drinks Stall', category: 'stall', kind: 'stall', size: 1, cost: 32000, upkeep: 1000, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 120, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'drink', itemCost: 30, itemPrice: 120, description: 'Cold drinks. Thirsty guests queue here.', research: 'stall', breakdowns: [] },
  { key: 'coffee_shop', name: 'Coffee Shop', category: 'stall', kind: 'stall', size: 1, cost: 38000, upkeep: 1100, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 120, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'coffee', itemCost: 30, itemPrice: 120, description: 'Hot coffee. Sells best on cold days.', research: 'stall', breakdowns: [] },
  { key: 'lemonade_stall', name: 'Lemonade Stall', category: 'stall', kind: 'stall', size: 1, cost: 32000, upkeep: 1000, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 120, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'lemonade', itemCost: 40, itemPrice: 120, description: 'Fresh lemonade.', research: 'stall', breakdowns: [] },
  { key: 'balloon_stall', name: 'Balloon Stall', category: 'stall', kind: 'stall', size: 1, cost: 28000, upkeep: 800, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 90, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'balloon', itemCost: 30, itemPrice: 90, description: 'Balloons in every colour. Happy guests buy them.', research: 'stall', breakdowns: [] },
  { key: 'souvenir_stall', name: 'Souvenir Stall', category: 'stall', kind: 'stall', size: 1, cost: 44000, upkeep: 1200, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 150, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'hat', itemCost: 90, itemPrice: 150, description: 'Hats and T-shirts with the park name on.', research: 'stall', breakdowns: [] },
  { key: 'info_kiosk', name: 'Information Kiosk', category: 'stall', kind: 'stall', size: 1, cost: 30000, upkeep: 1000, capacity: 0, rideTicks: 0, base: null, bonusValue: 0, unreliability: 0, price: 60, multipliers: [0, 0, 0], height: 3, sheltered: true, item: 'map', itemCost: 10, itemPrice: 60, item2: 'umbrella', item2Cost: 200, item2Price: 250, facility: 'info', description: 'Park maps so guests stop getting lost, and umbrellas when it rains.', research: 'stall', breakdowns: [] },
  { key: 'toilets', name: 'Toilets', category: 'stall', kind: 'stall', size: 1, cost: 25000, upkeep: 800, capacity: 4, rideTicks: 300, base: null, bonusValue: 0, unreliability: 0, price: 0, multipliers: [0, 0, 0], height: 3, sheltered: true, facility: 'toilet', description: 'Every park needs them. Can charge a small fee.', research: 'stall', breakdowns: [] },
  { key: 'first_aid', name: 'First Aid Room', category: 'stall', kind: 'stall', size: 1, cost: 30000, upkeep: 900, capacity: 2, rideTicks: 600, base: null, bonusValue: 0, unreliability: 0, price: 0, multipliers: [0, 0, 0], height: 3, sheltered: true, facility: 'firstaid', description: 'Sick guests recover here instead of on your paths.', research: 'stall', breakdowns: [] },
];
export const RIDE_BY_KEY: Record<string, RideTypeDef> = Object.fromEntries(RIDE_TYPES.map(r => [r.key, r]));

/** Which ride types a fresh park starts with. The rest come through research. */
export const STARTING_INVENTED = ['merry_go_round', 'ferris_wheel', 'spiral_slide', 'twist', 'wooden_coaster', 'junior_coaster', 'burger_bar', 'drink_stall', 'balloon_stall', 'toilets', 'info_kiosk', 'scenery:trees', 'scenery:gardens'];

export const CATEGORY_NAMES: Record<string, string> = { transport: 'Transport rides', gentle: 'Gentle rides', coaster: 'Roller coasters', thrill: 'Thrill rides', water: 'Water rides', stall: 'Shops & stalls' };

/** Words the original uses for a rating value (hundredths). */
export function ratingWord(v: number): string {
  if (v < 200) return 'Low'; if (v < 400) return 'Medium'; if (v < 600) return 'High'; if (v < 800) return 'Very High'; if (v < 1000) return 'Extreme'; return 'Ultra-Extreme';
}
export const fmtRating = (v: number) => (v / 100).toFixed(2);

export const BREAKDOWN_NAMES: Record<string, string> = {
  safety_cut_out: 'Safety cut-out', restraints_closed: 'Restraints stuck closed', restraints_open: 'Restraints stuck open',
  vehicle_malfunction: 'Vehicle malfunction', brakes_failure: 'Brakes failure', control_failure: 'Control failure',
};
export const BREAKDOWN_WEIGHTS: Record<string, number> = { safety_cut_out: 25, restraints_closed: 12, restraints_open: 10, vehicle_malfunction: 6, brakes_failure: 3, control_failure: 3 };

export const COLOURS = ['#c0392b', '#2b6cd9', '#2f9e44', '#e9c21f', '#8e44ad', '#e67e22', '#1abc9c', '#ecf0f1', '#f368a4', '#34495e', '#8d5524', '#00a8e8', '#7f8c8d', '#fdf2a6', '#5c3a1e', '#2c3e50'];
export const COLOUR_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Teal', 'White', 'Pink', 'Dark blue', 'Brown', 'Light blue', 'Grey', 'Cream', 'Dark brown', 'Black'];
