// Every RollerCoaster Tycoon 2 ride type this game did not have, built from RCT's own rules (src/sim/rct/ride-data.ts,
// from OpenRCT2, GPL-3.0): costs, upkeep, prices, reliability, rating rules and track pieces come from there; the
// names, words and how each looks here (sizes, vehicles, track styles) are this game's.
import type { RideTypeDef } from '../rides';
import type { RideCategory } from '../types';
import { RCT_RIDES } from './ride-data';

type Look = { style?: string; cars?: number; seats?: number; powered?: number; current?: number; maxHeight?: number; liftSpeed?: number; size?: 1 | 2 | 3 | 4; capacity?: number; ticks?: number; sheltered?: boolean; height?: number };
/** rct ride type, our key, name, category, kind, research group, description, look */
type Row = [string, string, string, RideCategory, 'flat' | 'coaster' | 'stall', RideTypeDef['research'], string, Look];
const C = 'coaster' as const;
export const NEW_RIDES: Row[] = [
  // ---------- roller coasters ----------
  ['looping_rc', 'looping_rc', 'Looping Roller Coaster', C, 'coaster', 'coaster', 'Steel track with vertical loops and corkscrews: the classic.', { style: 'steel', cars: 7, seats: 4, maxHeight: 35 }],
  ['corkscrew_rc', 'corkscrew_rc', 'Corkscrew Roller Coaster', C, 'coaster', 'coaster', 'Steel track built around corkscrews and loops.', { style: 'steel', cars: 7, seats: 4, maxHeight: 33 }],
  ['hypercoaster', 'hypercoaster', 'Hypercoaster', C, 'coaster', 'coaster', 'Tall and fast with big drops, but no inversions.', { style: 'steel', cars: 6, seats: 4, maxHeight: 50 }],
  ['giga_rc', 'giga_rc', 'Giga Coaster', C, 'coaster', 'coaster', 'Enormous drops pulled up by a cable lift.', { style: 'steel', cars: 7, seats: 4, maxHeight: 86 }],
  ['hyper_twister', 'hyper_twister', 'Hyper-Twister Coaster', C, 'coaster', 'coaster', 'Steep drops and banked twists on a tall steel track.', { style: 'steel', cars: 6, seats: 4, maxHeight: 54 }],
  ['vertical_drop_rc', 'vertical_drop_rc', 'Vertical Drop Roller Coaster', C, 'coaster', 'coaster', 'Wide cars held over the edge, then dropped straight down.', { style: 'steel', cars: 3, seats: 8, maxHeight: 55 }],
  ['stand_up_rc', 'stand_up_rc', 'Stand-up Roller Coaster', C, 'coaster', 'coaster', 'Riders stand through loops and corkscrews.', { style: 'standup', cars: 7, seats: 4, maxHeight: 37 }],
  ['classic_stand_up_rc', 'classic_stand_up_rc', 'Classic Stand-up Roller Coaster', C, 'coaster', 'coaster', 'The original stand-up coaster.', { style: 'standup', cars: 7, seats: 4, maxHeight: 37 }],
  ['flying_rc', 'flying_rc', 'Flying Roller Coaster', C, 'coaster', 'coaster', 'Riders lie face down under the track, as if flying.', { style: 'flying', cars: 7, seats: 4, maxHeight: 30 }],
  ['lay_down_rc', 'lay_down_rc', 'Lay-down Roller Coaster', C, 'coaster', 'coaster', 'Riders lie on their backs and twist upside down.', { style: 'laydown', cars: 7, seats: 4, maxHeight: 26 }],
  ['compact_inverted_rc', 'compact_inverted_rc', 'Compact Inverted Coaster', C, 'coaster', 'coaster', 'A tight inverted coaster with feet dangling.', { style: 'inverted', cars: 7, seats: 2, maxHeight: 27 }],
  ['inverted_hairpin_rc', 'inverted_hairpin_rc', 'Inverted Hairpin Coaster', C, 'coaster', 'coaster', 'Single cars hang under a zig-zag of hairpin turns.', { style: 'inverted', cars: 1, seats: 4, maxHeight: 16 }],
  ['inverted_impulse_rc', 'inverted_impulse_rc', 'Inverted Impulse Coaster', C, 'coaster', 'coaster', 'Launched forwards and backwards up vertical spikes.', { style: 'inverted', cars: 7, seats: 2, maxHeight: 45 }],
  ['suspended_swinging_rc', 'suspended_swinging_rc', 'Suspended Swinging Coaster', C, 'coaster', 'coaster', 'Cars hang below the track and swing out on the turns.', { style: 'suspended', cars: 7, seats: 2, maxHeight: 24 }],
  ['mini_suspended_rc', 'mini_suspended_rc', 'Mini Suspended Coaster', C, 'coaster', 'coaster', 'A small swinging coaster for everyone.', { style: 'suspended', cars: 4, seats: 2, maxHeight: 12 }],
  ['classic_wooden_rc', 'classic_wooden_rc', 'Classic Wooden Roller Coaster', C, 'coaster', 'coaster', 'An old-style wooden coaster with low banking.', { style: 'wood', cars: 6, seats: 4, maxHeight: 41 }],
  ['classic_wooden_twister_rc', 'classic_wooden_twister_rc', 'Classic Wooden Twister Coaster', C, 'coaster', 'coaster', 'A twisting old-style wooden coaster.', { style: 'wood', cars: 6, seats: 4, maxHeight: 41 }],
  ['wooden_wild_mouse', 'wooden_wild_mouse', 'Wooden Wild Mouse', C, 'coaster', 'coaster', 'Single cars whip round tight, unbanked corners.', { style: 'wood', cars: 1, seats: 4, maxHeight: 14 }],
  ['side_friction_rc', 'side_friction_rc', 'Side-Friction Roller Coaster', C, 'coaster', 'coaster', 'An early wooden coaster held in by side rails.', { style: 'wood', cars: 4, seats: 4, maxHeight: 21 }],
  ['reverser_rc', 'reverser_rc', 'Reverser Roller Coaster', C, 'coaster', 'coaster', 'Wooden track where the cars run backwards after each reverser.', { style: 'wood', cars: 4, seats: 4, maxHeight: 20 }],
  ['virginia_reel', 'virginia_reel', 'Virginia Reel', C, 'coaster', 'coaster', 'Round tubs spin as they roll down a wooden track.', { style: 'wood', cars: 1, seats: 4, maxHeight: 14 }],
  ['hybrid_rc', 'hybrid_rc', 'Hybrid Coaster', C, 'coaster', 'coaster', 'A steel rail on a wooden structure: smooth and fast.', { style: 'wood', cars: 6, seats: 4, maxHeight: 50 }],
  ['mine_ride', 'mine_ride', 'Mine Ride', C, 'coaster', 'coaster', 'A runaway mine car ride on wooden trestles.', { style: 'mine', cars: 4, seats: 4, maxHeight: 18 }],
  ['mini_rc', 'mini_rc', 'Mini Roller Coaster', C, 'coaster', 'coaster', 'A small, gentle steel coaster.', { style: 'junior', cars: 4, seats: 2, maxHeight: 13 }],
  ['classic_mini_rc', 'classic_mini_rc', 'Classic Mini Roller Coaster', C, 'coaster', 'coaster', 'The original small coaster for small parks.', { style: 'junior', cars: 4, seats: 2, maxHeight: 13 }],
  ['steel_wild_mouse', 'steel_wild_mouse', 'Steel Wild Mouse', C, 'coaster', 'coaster', 'Single mouse cars snap round sharp corners on steel.', { style: 'junior', cars: 1, seats: 4, maxHeight: 16 }],
  ['spinning_wild_mouse', 'spinning_wild_mouse', 'Spinning Wild Mouse', C, 'coaster', 'coaster', 'Mouse cars that spin as they go.', { style: 'junior', cars: 1, seats: 4, maxHeight: 16 }],
  ['bobsleigh_rc', 'bobsleigh_rc', 'Bobsleigh Coaster', C, 'coaster', 'coaster', 'Sleds swoop down a free-running half-pipe.', { style: 'bobsleigh', cars: 4, seats: 2, maxHeight: 20 }],
  ['alpine_rc', 'alpine_rc', 'Alpine Coaster', C, 'coaster', 'coaster', 'Single sleds glide down a hillside rail.', { style: 'singlerail', cars: 1, seats: 2, maxHeight: 12 }],
  ['single_rail_rc', 'single_rail_rc', 'Single-Rail Coaster', C, 'coaster', 'coaster', 'A narrow single rail with sharp twists.', { style: 'singlerail', cars: 7, seats: 2, maxHeight: 37 }],
  ['steeplechase', 'steeplechase', 'Steeplechase', C, 'coaster', 'coaster', 'Riders on horse cars race along a steel track.', { style: 'steel', cars: 1, seats: 2, maxHeight: 16 }],
  ['water_coaster', 'water_coaster', 'Water Coaster', C, 'coaster', 'coaster', 'Boats run on a coaster track and splash through water channels.', { style: 'steel', cars: 4, seats: 4, maxHeight: 24 }],
  ['lim_launched_rc', 'lim_launched_rc', 'LIM Launched Roller Coaster', C, 'coaster', 'coaster', 'Launched by linear motors straight out of the station.', { style: 'steel', cars: 7, seats: 4, maxHeight: 35 }],
  ['lsm_rc', 'lsm_rc', 'LSM Launched Roller Coaster', C, 'coaster', 'coaster', 'A launched coaster that can climb a vertical tower.', { style: 'steel', cars: 7, seats: 4, maxHeight: 55 }],
  ['air_powered_vertical_rc', 'air_powered_vertical_rc', 'Air Powered Vertical Coaster', C, 'coaster', 'coaster', 'Fired out of the station by air pressure and over a top hat.', { style: 'steel', cars: 4, seats: 4, maxHeight: 64 }],
  ['heartline_twister_rc', 'heartline_twister_rc', 'Heartline Twister Coaster', C, 'coaster', 'coaster', 'The cars roll around the riders\' hearts.', { style: 'steel', cars: 4, seats: 4, maxHeight: 20 }],
  ['multi_dimension_rc', 'multi_dimension_rc', 'Multi-Dimension Coaster', C, 'coaster', 'coaster', 'Seats either side of the track flip head over heels.', { style: 'steel', cars: 4, seats: 4, maxHeight: 40 }],
  ['spiral_rc', 'spiral_rc', 'Spiral Roller Coaster', C, 'coaster', 'coaster', 'A family coaster that climbs a spiral lift.', { style: 'steel', cars: 6, seats: 4, maxHeight: 24 }],
  ['reverse_freefall_rc', 'reverse_freefall_rc', 'Reverse Freefall Coaster', C, 'coaster', 'coaster', 'Launched up a vertical tower, then falls back down.', { style: 'steel', cars: 1, seats: 8, maxHeight: 70 }],
  // ---------- gentle rides ----------
  ['car_ride', 'car_ride', 'Car Ride', 'gentle', 'coaster', 'gentle', 'Little cars on a winding road. Guests drive themselves round.', { style: 'road', cars: 1, seats: 2, powered: 3.5, maxHeight: 6 }],
  ['ghost_train', 'ghost_train', 'Ghost Train', 'gentle', 'coaster', 'gentle', 'Cars rattle through dark tunnels full of frights.', { style: 'ghost', cars: 3, seats: 2, powered: 3.5, maxHeight: 6 }],
  ['monster_trucks', 'monster_trucks', 'Monster Trucks', 'gentle', 'coaster', 'gentle', 'Big-wheeled trucks bounce along a rough road.', { style: 'road', cars: 1, seats: 2, powered: 4, maxHeight: 6 }],
  ['mini_helicopters', 'mini_helicopters', 'Mini Helicopters', 'gentle', 'coaster', 'gentle', 'Pedal-powered little helicopters on a rail.', { style: 'singlerail', cars: 1, seats: 2, powered: 2.5, maxHeight: 5 }],
  ['monorail_cycles', 'monorail_cycles', 'Monorail Cycles', 'gentle', 'coaster', 'gentle', 'Pedal round a raised monorail track.', { style: 'monorail', cars: 1, seats: 1, powered: 2.5, maxHeight: 8 }],
  ['mini_golf', 'mini_golf', 'Mini Golf', 'gentle', 'coaster', 'gentle', 'Putt round a course of holes.', { style: 'golf', cars: 1, seats: 1, powered: 1, maxHeight: 4 }],
  ['crooked_house', 'crooked_house', 'Crooked House', 'gentle', 'flat', 'gentle', 'A wonky house where nothing is straight.', { size: 3, capacity: 5, ticks: 1600, sheltered: true, height: 5 }],
  ['flying_saucers', 'flying_saucers', 'Flying Saucers', 'gentle', 'flat', 'gentle', 'Hover in saucers and bump into each other.', { size: 4, capacity: 18, ticks: 2000, height: 3 }],
  ['maze', 'maze', 'Hedge Maze', 'gentle', 'flat', 'gentle', 'Find the way through a maze of hedges.', { size: 4, capacity: 16, ticks: 3000, height: 3 }],
  // ---------- thrill rides ----------
  ['3d_cinema', '3d_cinema', '3D Cinema', 'thrill', 'flat', 'thrill', 'A dome cinema showing 3D films.', { size: 3, capacity: 20, ticks: 2400, sheltered: true, height: 5 }],
  ['enterprise', 'enterprise', 'Enterprise', 'thrill', 'flat', 'thrill', 'A spinning wheel of cars that tilts up on end.', { size: 4, capacity: 20, ticks: 1800, height: 9 }],
  ['magic_carpet', 'magic_carpet', 'Magic Carpet', 'thrill', 'flat', 'thrill', 'A carpet of seats swung round in a big circle.', { size: 2, capacity: 12, ticks: 1600, height: 7 }],
  ['swinging_inverter_ship', 'swinging_inverter_ship', 'Swinging Inverter Ship', 'thrill', 'flat', 'thrill', 'A ship that swings right over the top.', { size: 2, capacity: 12, ticks: 1800, height: 8 }],
  ['roto_drop', 'roto_drop', 'Roto-Drop', 'thrill', 'flat', 'thrill', 'Riders turn slowly up a tower, then drop.', { size: 1, capacity: 16, ticks: 1400, height: 14 }],
  ['go_karts', 'go_karts', 'Go Karts', 'thrill', 'coaster', 'thrill', 'Race karts round a track.', { style: 'road', cars: 1, seats: 1, powered: 6, maxHeight: 6 }],
  // ---------- water rides ----------
  ['dinghy_slide', 'dinghy_slide', 'Dinghy Slide', 'water', 'coaster', 'gentle', 'Dinghies slide down a water chute.', { style: 'flume', cars: 1, seats: 2, maxHeight: 16 }],
  ['river_rafts', 'river_rafts', 'River Rafts', 'water', 'coaster', 'gentle', 'Gentle rafts float down a slow river.', { style: 'rapids', cars: 1, seats: 4, current: 2.5, maxHeight: 10 }],
  ['splash_boats', 'splash_boats', 'Splash Boats', 'water', 'coaster', 'gentle', 'Boats climb up and splash down into water.', { style: 'flume', cars: 1, seats: 6, maxHeight: 18 }],
  ['submarine_ride', 'submarine_ride', 'Submarine Ride', 'water', 'coaster', 'gentle', 'Submarines tour under the water.', { style: 'rapids', cars: 1, seats: 4, powered: 2.5, maxHeight: 4 }],
  ['boat_hire', 'boat_hire', 'Boat Hire', 'water', 'coaster', 'gentle', 'Rowing boats and canoes for hire on the water.', { style: 'rapids', cars: 1, seats: 2, powered: 2, maxHeight: 4 }],
  // ---------- transport ----------
  ['monorail', 'monorail', 'Monorail', 'transport', 'coaster', 'gentle', 'Streamlined trains on a single raised beam.', { style: 'monorail', cars: 4, seats: 4, powered: 6, maxHeight: 24 }],
  ['suspended_monorail', 'suspended_monorail', 'Suspended Monorail', 'transport', 'coaster', 'gentle', 'Cars hang below a raised rail.', { style: 'suspended', cars: 3, seats: 4, powered: 6, maxHeight: 24 }],
  ['chairlift', 'chairlift', 'Chairlift', 'transport', 'coaster', 'gentle', 'Chairs on a moving cable float over the park.', { style: 'cable', cars: 1, seats: 2, powered: 2, maxHeight: 30 }],
  ['lift', 'lift', 'Lift', 'transport', 'flat', 'gentle', 'A lift up a tower and back down again.', { size: 1, capacity: 16, ticks: 1400, height: 12 }],
  // ---------- shops ----------
  ['cash_machine', 'cash_machine', 'Cash Machine', 'stall', 'stall', 'stall', 'Guests short of money draw more here.', { height: 2 }],
];
/** Rides this game keeps from before, and the RCT ride type each is (for its costs, prices and rating rules). */
export const KEPT_RCT: Record<string, string> = {
  merry_go_round: 'merry_go_round', ferris_wheel: 'ferris_wheel', spiral_slide: 'spiral_slide', dodgems: 'dodgems', haunted_house: 'haunted_house',
  observation_tower: 'observation_tower', circus: 'circus', twist: 'twist', swinging_ship: 'swinging_ship', launched_freefall: 'launched_freefall', top_spin: 'top_spin',
  space_rings: 'space_rings', motion_simulator: 'motion_simulator', junior_coaster: 'junior_rc', wooden_coaster: 'wooden_rc', mine_train: 'mine_train_rc',
  steel_twister: 'twister_rc', inverted_coaster: 'inverted_rc', log_flume: 'log_flume', river_rapids: 'river_rapids', mini_railway: 'miniature_railway',
  burger_bar: 'food_stall', fries_stall: 'food_stall', pizza_stall: 'food_stall', hot_dog_stall: 'food_stall', ice_cream_stall: 'food_stall', candy_floss_stall: 'food_stall',
  drink_stall: 'drink_stall', coffee_shop: 'drink_stall', lemonade_stall: 'drink_stall', balloon_stall: 'shop', souvenir_stall: 'shop', info_kiosk: 'information_kiosk',
  toilets: 'toilets', first_aid: 'first_aid',
};
/** The price RCT puts on a ride type's first piece (a flat ride's whole footprint), in cents. */
const START_MUL: Record<string, number> = { flatTrack3x3: 8, flatTrack4x4: 16, flatTrack2x2: 4, flatTrack1x4A: 4, flatTrack1x4B: 4, flatTrack1x4C: 4, flatTrack1x5: 5, flatTrack1x1A: 1, flatTrack1x1B: 1, towerBase: 8, endStation: 1.5, maze: 16 };
/** What RCT's data says about money and reliability for a ride type: build cost, the price of a track piece, upkeep base,
 *  the default ticket price, ride value multipliers, bonus value and unreliability. Upkeep is scaled to this game's
 *  fortnightly cents (RCT's base × 50, which matches the costs this game always had). */
export function rctEconomics(rct: string, start: string | null) {
  const d = RCT_RIDES[rct]; if (!d) return null; const track = d.buildCosts[0] ?? 0;
  return { cost: Math.round(track * (START_MUL[start ?? 'endStation'] ?? 1.5)), pieceCost: track, upkeep: (d.upkeep[0] ?? 50) * 50, price: (d.defaultPrices[0] ?? 0) * 10,
    multipliers: (d.ratingsMultipliers.length === 3 ? d.ratingsMultipliers : [0, 0, 0]) as [number, number, number], bonusValue: d.bonusValue, unreliability: d.ratings.unreliability ?? 10 };
}
export const BD_MAP: Record<string, string> = { safetyCutOut: 'safety_cut_out', restraintsStuckClosed: 'restraints_closed', restraintsStuckOpen: 'restraints_open', doorsStuckClosed: 'restraints_closed', doorsStuckOpen: 'restraints_open', vehicleMalfunction: 'vehicle_malfunction', brakesFailure: 'brakes_failure', controlFailure: 'control_failure' };
