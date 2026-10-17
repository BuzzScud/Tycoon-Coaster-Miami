// RCT2's G-force factors, ported from OpenRCT2 (TrackData.cpp and ted/TED.*.h, GPL-3.0). A piece's vertical and lateral
// factor at a point along it (progress = car positions from its start) sets how hard riders are pressed: RCT adds
// speed × 98 / factor to the 1 g of gravity (a smaller factor is a tighter curve; negative pulls the other way).
const u16 = (v: number) => ((v % 65536) + 65536) % 65536;
const idiv = (a: number, b: number) => Math.trunc(a / b);
export const EVALUATORS: Record<string, (p: number) => number> = {
  QuarterTurn3Tiles: p => -idiv(p, 2) + 134,
  Down90QuarterLoop: p => idiv(p, 4) + 55,
  Up90QuarterLoop: p => idiv(u16(-(p - 137)), 4) + 55,
  DiveLoopUp: p => 385 - 2 * p, DiveLoopDown: p => 67 + 2 * p,
  DiveLoopUpLeft: p => 380 - 2 * p, DiveLoopUpRight: p => 2 * p - 380, DiveLoopDownLeft: p => -(62 + 2 * p), DiveLoopDownRight: p => 62 + 2 * p,
  HeartLineTransferUp: p => (p < 32 ? 103 : p < 64 ? -103 : p < 96 ? 0 : p < 128 ? 103 : -103),
  HeartLineTransferDown: p => (p < 32 ? -103 : p < 64 ? 103 : p < 96 ? 0 : p < 128 ? -103 : 103),
  VerticalLoop: p => idiv(Math.abs(p - 155), 2) + 28,
  HalfLoopUp: p => idiv(u16(-(p - 155)), 2) + 28, HalfLoopDown: p => idiv(p, 2) + 28,
  MediumHalfLoopUp: p => idiv(244 - p, 4) + 51, MediumHalfLoopDown: p => idiv(p, 4) + 51,
  LargeHalfLoopUp: p => idiv(u16(-(p - 311)), 4) + 46, LargeHalfLoopDown: p => idiv(p, 4) + 46,
  SBendLeft: p => (p < 48 ? 98 : -98), SBendRight: p => (p < 48 ? -98 : 98),
  WaterSplash: p => (p < 32 ? -150 : p < 64 ? 150 : p < 96 ? 0 : p < 128 ? 150 : -150),
  LargeZeroGRollUp: p => (p > 114 ? 371 - 2 * p : 0), LargeZeroGRollDown: p => (p < 38 ? 67 + 2 * p : 0),
  LargeZeroGRollUpLeft: p => 387 - 2 * p, LargeZeroGRollUpRight: p => 2 * p - 387, LargeZeroGRollDownLeft: p => 83 + 2 * p, LargeZeroGRollDownRight: p => -(83 + 2 * p),
  ZeroGRollUpLeft: p => 174 - p, ZeroGRollUpRight: p => p - 174, ZeroGRollDownLeft: p => 73 + p, ZeroGRollDownRight: p => -(73 + p),
};
/** A factor as the data gives it: a constant, the name of an evaluator, or none. */
export function factor(f: number | string | null | undefined, progress: number): number {
  if (f === null || f === undefined) return 0; if (typeof f === 'number') return f; return EVALUATORS[f]?.(Math.floor(progress)) ?? 0;
}
/** RCT's speed units from metres a second in this game. Heights here are 1.5 m a unit where RCT's are about 0.8 m, so
 *  the same drop gives a faster train here: scaled back by the square root of that (the energy of the same drop). */
export const RCT_VELOCITY_PER_MS = (1 / 0.44704) * 29127 * Math.sqrt(0.8 / 1.5);
/** Extra g from a factor at this speed (RCT: |velocity| × 98 / factor, then × 10 ÷ 65536 in hundredths of a g). */
export const gFrom = (f: number, v: number) => (f ? (Math.abs(v) * RCT_VELOCITY_PER_MS * 98 * 10) / f / 65536 / 100 : 0);
