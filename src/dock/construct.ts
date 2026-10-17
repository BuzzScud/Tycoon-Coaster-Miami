// The construction window's choices, as in RCT: pick a curve, a pitch and a bank for where the track should go, and the
// game builds the piece that gets there from where the track ends (a transition first when it must: level to up is
// "flat to up 25°"). Special pieces (stations, loops, corkscrews, helices, brakes…) come from a list of their own.
import type { GameState, Ride } from '../sim/types';
import { RIDE_BY_KEY } from '../sim/rides';
import { coasterCursor } from '../sim/game';
import { PIECE_BY_KEY, SPECIAL_ORDER, nextPiece, pieceAllowed, type Curve, type Pitch, type Roll } from '../sim/track';
import { RCT_NEXT } from '../sim/rct/track-data';

export interface BuildSel { curve: Curve; pitch: Pitch; roll: Roll; chain: boolean; special: string | null; }
export const freshSel = (): BuildSel => ({ curve: 'none', pitch: 'none', roll: 'none', chain: false, special: null });

export const CURVE_UI: [Curve, string, string][] = [
  ['leftLarge', 'curveLD', 'Large left turn, onto a diagonal'], ['left', 'curveL2', 'Left turn (5 tiles)'], ['leftSmall', 'curveL', 'Left turn (3 tiles)'], ['leftVerySmall', 'curveL0', 'Tight left turn (1 tile)'],
  ['none', 'straight', 'Straight'],
  ['rightVerySmall', 'curveR0', 'Tight right turn (1 tile)'], ['rightSmall', 'curveR', 'Right turn (3 tiles)'], ['right', 'curveR2', 'Right turn (5 tiles)'], ['rightLarge', 'curveRD', 'Large right turn, onto a diagonal'],
];
export const PITCH_UI: [Pitch, string, string][] = [['down90', 'vertDown', 'Vertical down'], ['down60', 'steepDown', 'Steep down (60°)'], ['down25', 'down', 'Down (25°)'], ['none', 'level', 'Level'], ['up25', 'up', 'Up (25°)'], ['up60', 'steepUp', 'Steep up (60°)'], ['up90', 'vertUp', 'Vertical up']];
export const ROLL_UI: [Roll, string, string][] = [['left', 'bankL', 'Bank left'], ['none', 'level', 'No banking'], ['right', 'bankR', 'Bank right']];
const NAMES: Record<string, string> = { endStation: 'Station platform', onRidePhoto: 'On-ride photo section', waterSplash: 'Water splash', blockBrakes: 'Block brakes', brakes: 'Brakes', booster: 'Booster', sBendLeft: 'S-bend (left)', sBendRight: 'S-bend (right)', cableLiftHill: 'Cable lift hill', poweredLift: 'Powered lift' };
export const pieceName = (key: string) => {
  if (NAMES[key]) return NAMES[key];
  // helices read better size first: "Small banked helix up (left)"
  const m = key.match(/^(left|right)(Half|Quarter)(Banked)?Helix(Up|Down)?(Small|Large)(Up|Down)?$/);
  if (m) { const [, side, part, banked, ud1, size, ud2] = m; return `${size} ${banked ? 'banked ' : ''}${part === 'Quarter' ? 'quarter ' : ''}helix ${(ud1 ?? ud2).toLowerCase()} (${side})`; }
  return PIECE_BY_KEY[key]?.name ?? key;
};

const OFFERS = new Map<string, { curves: Set<Curve>; pitches: Set<Pitch>; rolls: Set<Roll>; specials: string[] }>();
/** What this ride type's builder can ever offer: which curves, pitches and banks, and its special pieces. */
export function offers(rct: string | undefined) {
  const k = rct ?? ''; let o = OFFERS.get(k); if (o) return o;
  o = { curves: new Set(), pitches: new Set(), rolls: new Set(), specials: [] };
  for (const [, ps, rs, cv, pe, re, el] of RCT_NEXT) if (pieceAllowed(rct, el)) { o.curves.add(cv as Curve); o.pitches.add(ps as Pitch); o.pitches.add(pe as Pitch); o.rolls.add(rs as Roll); o.rolls.add(re as Roll); }
  o.specials = SPECIAL_ORDER.filter(k => k === '-' || pieceAllowed(rct, k));
  o.specials = o.specials.filter((k, i, a) => k !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
  OFFERS.set(k, o); return o;
}
/** Where the track ends: the state the next piece has to start from (an old piece lets anything follow). */
function from(g: GameState, r: Ride) {
  const at = coasterCursor(g, r); if (!at) return null; const last = r.pieces[r.pieces.length - 1]; const free = !!PIECE_BY_KEY[last.type].legacy;
  return { diag: at.diag ?? false, pitch: at.pitch ?? 'none', roll: at.roll ?? 'none', free };
}
/** The piece the window's choices build here, or null when there is none. */
export function pieceFor(g: GameState, r: Ride, s: BuildSel): string | null {
  const c = RIDE_BY_KEY[r.type].coaster; const f = from(g, r); if (!c || !f) return null;
  if (s.special) return specialOk(g, r, s.special) ? s.special : null;
  const k = nextPiece(s.curve, f.diag, f.pitch, s.pitch, f.roll, s.roll) ?? (f.free ? nextPiece(s.curve, false, 'none', s.pitch, 'none', s.roll) : null);
  return k && pieceAllowed(c.rct, k) ? k : null;
}
/** Can a special piece go on here? (it must start the way the track ends) */
export function specialOk(g: GameState, r: Ride, key: string): boolean {
  const d = PIECE_BY_KEY[key]; const f = from(g, r); if (!d || !f) return false;
  return f.free || (d.diagIn === f.diag && d.pitchIn === f.pitch && d.rollIn === f.roll);
}
/** Choose a curve, pitch or bank; when that leaves no piece, the other two change to the nearest choice that has one
 *  (RCT's window does the same: pick "up" while banked and the bank comes off). */
export function choose(g: GameState, r: Ride, s: BuildSel, field: 'curve' | 'pitch' | 'roll', value: string): BuildSel {
  const next = { ...s, special: null, [field]: value } as BuildSel; if (pieceFor(g, r, next)) return next;
  const f = from(g, r); const c = RIDE_BY_KEY[r.type].coaster; const o = offers(c?.rct);
  const curves: Curve[] = field === 'curve' ? [next.curve] : [next.curve, 'none'];
  const pitches: Pitch[] = field === 'pitch' ? [next.pitch] : [next.pitch, f?.pitch ?? 'none', 'none', ...o.pitches];
  const rolls: Roll[] = field === 'roll' ? [next.roll] : [next.roll, 'none', f?.roll ?? 'none', ...o.rolls];
  for (const cv of curves) for (const pt of pitches) for (const rl of rolls) { const t = { ...next, curve: cv, pitch: pt, roll: rl }; if (pieceFor(g, r, t)) return t; }
  return next;
}
/** Would choosing this give a piece (after the window's own adjusting)? */
export const canChoose = (g: GameState, r: Ride, s: BuildSel, field: 'curve' | 'pitch' | 'roll', value: string) => !!pieceFor(g, r, choose(g, r, s, field, value));
