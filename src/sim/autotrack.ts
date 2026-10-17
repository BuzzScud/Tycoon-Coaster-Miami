// Finish circuit: plan the track from where the builder stands back into the first station piece, arriving level and
// the way the station faces. A best-first search over RCT's pieces this ride may use, each following on from the last
// as the construction window would allow (same pitch, bank and diagonal); every candidate must pass the same checks
// as building it by hand and must not cross the pieces planned before it. Climbs get a chain lift so the train always
// makes it; the plan is test-run before it is offered.
import { LAND_STEP, type GameState, type Ride, type TrackPiece, type Dir } from './types';
import { PIECES, PIECE_BY_KEY, pieceEnd, pieceSpans, spansMeet, pieceAllowed, isStation, type Pitch, type Roll } from './track';
import { checkPiece, coasterCursor, cmdAddPiece, trial } from './game';
import { RIDE_BY_KEY } from './rides';
import { simulateTest } from './ridesim';

export interface PlanStep { type: string; chain: boolean; bank: -1 | 0 | 1 }
interface Node { x: number; y: number; z: number; dir: Dir; diag: boolean; pitch: Pitch; roll: Roll; cost: number; f: number; parent: Node | null; piece: TrackPiece | null; depth: number }

/** The kinds of piece the planner builds with: plain track, slopes and turns, and the ways back to level and unbanked. */
const PLAN_GROUPS = new Set(['straight', 'flat', 'slope', 'slopeSteepUp', 'slopeSteepDown', 'flatToSteepSlope', 'curve', 'curveSmall', 'curveVerySmall', 'curveLarge', 'slopeCurve', 'flatRollBanking']);
const PITCH_COST: Record<string, number> = { none: 0, up25: 0.15, down25: 0.1, up60: 1.5, down60: 1.2, up90: 9, down90: 9 };
/** How a move is weighed: its length in tiles, a little more for slopes and banking, much more for steep track. */
function weight(key: string): number {
  const d = PIECE_BY_KEY[key]; const tiles = Math.max(1, d.length / 6);
  return tiles * (1 + PITCH_COST[d.pitchOut] + PITCH_COST[d.pitchIn] + (d.rollOut !== 'none' ? 0.5 : 0) + (d.turn ? 0.1 : 0) + (d.diagIn || d.diagOut ? 0.2 : 0));
}
/** Do two pieces fill the same space? (the rule checkPiece uses) */
function clash(a: TrackPiece, b: TrackPiece, clear: number): boolean {
  const sa = pieceSpans(a, clear), sb = pieceSpans(b, clear);
  return sa.some(a => sb.some(b => spansMeet(a, b)));
}

export function planCircuit(g: GameState, ride: Ride, maxNodes = 40000): { steps: PlanStep[] } | { why: string } {
  const def = RIDE_BY_KEY[ride.type]; if (!def.coaster) return { why: 'Not a track ride' };
  if (ride.closedLoop) return { why: 'The circuit is already complete' };
  if (!ride.pieces.length || !isStation(ride.pieces[0].type)) return { why: 'Start with a station' };
  const goal = ride.pieces[0]; const c0 = coasterCursor(g, ride)!; const clear = def.coaster.clear ?? 3;
  const moves = PIECES.filter(p => PLAN_GROUPS.has(p.group) && pieceAllowed(def.coaster!.rct, p.key) && !p.station).map(p => [p.key, weight(p.key)] as [string, number]);
  const byStart = new Map<string, [string, number][]>();
  for (const m of moves) { const d = PIECE_BY_KEY[m[0]]; const k = `${d.diagIn ? 1 : 0}${d.pitchIn}${d.rollIn}`; if (!byStart.has(k)) byStart.set(k, []); byStart.get(k)!.push(m); }
  const h = (n: { x: number; y: number; z: number; dir: Dir; diag: boolean; pitch: Pitch; roll: Roll }) =>
    (Math.abs(n.x - goal.x) + Math.abs(n.y - goal.y)) * 0.95 + (Math.abs(n.z - goal.z) / LAND_STEP) * 0.9 + (n.dir === goal.dir && !n.diag ? 0 : n.dir === ((goal.dir + 2) & 3) ? 2 : 1) + (n.pitch === 'none' ? 0 : 0.5) + (n.roll === 'none' ? 0 : 0.5);
  const W = 1.6;   // greedy weight: finds a good circuit fast rather than the very shortest
  const open: Node[] = []; const best = new Map<string, number>();
  const id = (n: { x: number; y: number; z: number; dir: number; diag: boolean; pitch: string; roll: string }) => `${n.x},${n.y},${n.z},${n.dir},${n.diag ? 1 : 0},${n.pitch},${n.roll}`;
  const push = (n: Node) => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= open[i].f) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0], last = open.pop()!; if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l].f < open[m].f) m = l; if (r < open.length && open[r].f < open[m].f) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  const start = { x: c0.x, y: c0.y, z: c0.z, dir: c0.dir, diag: c0.diag ?? false, pitch: c0.pitch ?? 'none', roll: c0.roll ?? 'none' };
  // after an old piece anything may follow (as when building by hand): start from any pitch the moves begin with
  const lastLegacy = PIECE_BY_KEY[ride.pieces[ride.pieces.length - 1].type].legacy;
  push({ ...start, cost: 0, f: h(start), parent: null, piece: null, depth: 0 });
  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    const n = pop(); expanded++;
    if (n.depth > 0 && n.x === goal.x && n.y === goal.y && n.z === goal.z && n.dir === goal.dir && !n.diag && n.pitch === 'none' && n.roll === 'none') {
      const steps: PlanStep[] = []; for (let c: Node | null = n; c?.piece; c = c.parent) steps.push({ type: c.piece.type, chain: c.piece.chain, bank: 0 });
      steps.reverse(); return testPlan(g, ride, steps) ?? { steps };
    }
    if (n.depth >= 90) continue;
    const cands = n.depth === 0 && lastLegacy ? moves.filter(([k]) => PIECE_BY_KEY[k].diagIn === n.diag) : byStart.get(`${n.diag ? 1 : 0}${n.pitch}${n.roll}`) ?? [];
    for (const [key, w] of cands) {
      const pd = PIECE_BY_KEY[key]; const at = { x: n.x, y: n.y, z: n.z, dir: n.dir, diag: n.diag, pitch: n.pitch, roll: n.roll };
      if (checkPiece(g, ride, key, at)) continue;
      const piece: TrackPiece = { type: key, x: n.x, y: n.y, z: n.z, dir: n.dir, chain: !!pd.chainable && pd.dz > 0, bank: 0 };
      const e = pieceEnd(piece);
      const closing = e.x === goal.x && e.y === goal.y && e.z === goal.z && e.dir === goal.dir && !e.diag && e.pitch === 'none' && e.roll === 'none';
      let crossed = false; for (let c: Node | null = n; c?.piece && !crossed; c = c.parent) if (clash(piece, c.piece, clear)) crossed = true; if (crossed) continue;
      const cost = n.cost + w; const k = id(e); if (!closing && (best.get(k) ?? Infinity) <= cost) continue; best.set(k, cost);
      push({ x: e.x, y: e.y, z: e.z, dir: e.dir, diag: e.diag, pitch: e.pitch, roll: e.roll, cost, f: cost + W * h(e), parent: n, piece, depth: n.depth + 1 });
    }
  }
  return { why: expanded >= maxNodes ? 'No way back to the station found nearby: clear some room or build closer to the station' : 'The track cannot reach the station from here' };
}

/** Run a test train round the finished plan; null when it gets round, otherwise why not. */
function testPlan(g: GameState, ride: Ride, steps: PlanStep[]): { why: string } | null {
  const pieces = [...ride.pieces]; let at = coasterCursor(g, ride)!;
  for (const s of steps) { const p: TrackPiece = { type: s.type, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: s.chain, bank: s.bank }; pieces.push(p); at = pieceEnd(p); }
  const st = simulateTest(g, { ...ride, pieces, closedLoop: true }); return st.completed ? null : { why: 'A planned circuit would not get round: ' + (st.failReason ?? 'test failed') };
}

/** Plan and build the rest of the circuit as one undo step. */
export function buildCircuit(g: GameState, rideId: number): { ok: boolean; why?: string; pieces: number; cost: number } {
  const ride = g.rides.find(r => r.id === rideId); if (!ride) return { ok: false, why: 'No such ride', pieces: 0, cost: 0 };
  const plan = planCircuit(g, ride); if ('why' in plan) return { ok: false, why: plan.why, pieces: 0, cost: 0 };
  const cash = g.finance.cash; let why = '';
  const ok = trial(() => { for (const s of plan.steps) { const r = cmdAddPiece(g, rideId, s.type, s.chain, s.bank); if (!r.ok) { why = r.error; return false; } } return ride.closedLoop; }, 'finish circuit');
  return ok ? { ok, pieces: plan.steps.length, cost: cash - g.finance.cash } : { ok, why: why || 'Could not finish the circuit', pieces: 0, cost: 0 };
}
