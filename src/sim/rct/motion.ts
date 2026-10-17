// RCT2's train motion, ported from OpenRCT2 (ride/Vehicle.TrackMotion.cpp, Vehicle.Station.cpp, Vehicle.cpp; GPL-3.0).
// RCT keeps a train's speed as an integer "velocity" (29127 = 1 mph as it shows speeds) and moves the train by
// (velocity ÷ 1024) × 42 each tick, in units where 65536 is one of its metres. Each tick every car takes the
// acceleration its pitch gives it, averaged over the car positions it moved through; the train takes the cars'
// average × 21 ÷ 512, less drag (velocity ÷ 4096) and a friction that grows with speed squared over
// the train's mass. Chain lifts, brakes, boosters and launches then set the acceleration outright.
// Car masses and spacing come from RCT's vehicle objects, which are not used here: typical values stand in.

export const V_PER_MPH = 29127;
/** Speed as RCT shows it, in metres a second. */
export const vToMs = (V: number) => ((V * 9) / 262144) * 0.44704;
export const msToV = (ms: number) => Math.round((ms / 0.44704) * (262144 / 9));
/** RCT metres a train moves in one tick at this velocity. */
export const metresPerTick = (V: number) => (Math.trunc(V / 1024) * 42) / 65536;
/** One RCT car position along plain track, in its metres (8716 ÷ 65536). */
export const STEP_M = 8716 / 65536;
export const CAR_MASS = 280, RIDER_MASS = 70;
export const CAR_SPACING_M = 1.33;   // about ten car positions a car
export const DEPART_V = 131940, DEPART_ACC = 3298;   // leaving the station: nudged to about 4.5 mph
export const LIFT_ACC = 15539;                       // a chain lift pulls at this until the train reaches the lift speed
export const LIFT_V_PER_UNIT = 31079;                // lift speed setting (about mph) → velocity
export const BRAKE_SPEED = 8, BLOCK_BRAKE_SPEED = 2, BOOSTER_SPEED = 15;   // track speed settings (× 65536 = velocity)
export const TRACK_SPEED_SHIFT = 16;
/** Friction that grows with speed squared, over the train's mass (GetAccelerationDecrease2). */
export function decrease2(V: number, mass: number): number {
  let d = Math.trunc(V / 256); d *= d; if (V < 0) d = -d; d = Math.trunc(d / 16); return mass ? Math.trunc(d / mass) : 0;
}
/** The train's acceleration from its cars' (each the sum of what its pitch gave it this tick), as RCT combines them. */
export function trainAcceleration(carAccs: number[], V: number, mass: number): number {
  let a = Math.trunc(carAccs.reduce((s, x) => s + x, 0) / carAccs.length) * 21; if (a < 0) a += 511; a = a >> 9;
  a -= Math.trunc(V / 4096); a -= decrease2(V, mass);
  if (a <= 0 && a >= -500 && V <= V_PER_MPH / 2 && V >= 0) a += 400;   // creeping along the level: a little push
  return a;
}
/** A powered train (the railway, river rapids): it drives towards its speed (getPoweredCarAcceleration). */
export function poweredAcceleration(V: number, speed: number, poweredAcc: number, mass: number, cur: number, water = false, sloped = false): number {
  let p = (speed << 14) - V; p *= poweredAcc << 1; const quarter = (speed * mass) >> 2; if (quarter) p = Math.trunc(p / quarter);
  if (water) { if (p < 0) p >>= 4; if (sloped) return cur + Math.max(0, p); }
  return Math.abs(V) <= V_PER_MPH ? p : cur + p;
}
