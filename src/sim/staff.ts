// Staff: handymen sweep and empty bins, mechanics answer breakdowns and inspect, security deters vandals, entertainers cheer queues.
import { DX, DY, type Dir, type GameState, type Staff, type StaffType, key } from './types';
import { tileAt, pathNeighbours, findRoute, walkZ, pathAt, nx as keyX, ny as keyY, nz as keyZ, nkey } from './map';
import { rand, randInt, pick } from './rng';
import { spend, Cat } from './finance';
import { fixRide, inspectRide } from './ridesim';
import { RIDE_BY_KEY } from './rides';
import { rideById } from './runtime';

export const STAFF_WAGES: Record<StaffType, number> = { handyman: 5000, mechanic: 8000, security: 6000, entertainer: 5500 };
export const STAFF_NAMES: Record<StaffType, string> = { handyman: 'Handyman', mechanic: 'Mechanic', security: 'Security guard', entertainer: 'Entertainer' };
const FIRST = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Robin', 'Charlie', 'Pat', 'Frankie', 'Jesse', 'Kim', 'Lee'];

export function hireStaff(g: GameState, type: StaffType): Staff | string {
  if (g.staff.length >= 200) return 'Too many staff';
  const cost = STAFF_WAGES[type]; if (!g.noMoney && g.finance.cash < cost) return 'Not enough cash for the first month';
  spend(g, cost, Cat.Wages);
  // start on a path tile near the entrance
  const e = g.entrance; let sx = e.x + 0.5, sy = e.y - 1.5;
  const t = tileAt(g, e.x, e.y - 1); if (!t?.paths.length) { sx = e.x + 0.5; sy = e.y + 0.5; }
  const s: Staff = { id: g.nextStaffId++, type, name: `${STAFF_NAMES[type]} ${g.staff.filter(x => x.type === type).length + 1}`, x: sx, y: sy, z: 0, dir: 3, tx: Math.floor(sx), ty: Math.floor(sy), state: 'walking', timer: 0, target: null, route: null, dest: null, costume: randInt(g, 3), stats: { litterSwept: 0, binsEmptied: 0, lawnsMown: 0, ridesFixed: 0, ridesInspected: 0, vandalsStopped: 0 }, walkPhase: 0 };
  s.name = `${pick(g, FIRST)} (${STAFF_NAMES[type].toLowerCase()})`;
  g.staff.push(s); return s;
}
export function fireStaff(g: GameState, id: number) {
  const s = g.staff.find(x => x.id === id); if (!s) return;
  if (s.target !== null && s.type === 'mechanic') { const r = rideById(g, s.target); if (r?.breakdown && r.breakdown.mechanicId === id) r.breakdown.mechanicId = null; }
  g.staff = g.staff.filter(x => x.id !== id);
}

const SPEED = 1.1;   // tiles per second
export function updateStaff(g: GameState) {
  for (const s of g.staff) {
    switch (s.type) { case 'handyman': handyman(g, s); break; case 'mechanic': mechanic(g, s); break; case 'security': security(g, s); break; case 'entertainer': entertainer(g, s); break; }
  }
}
/** Walk along the route; returns true when the destination tile is reached (or there is none). */
export function walk(g: GameState, s: { x: number; y: number; z: number; pz?: number; dir: Dir; tx: number; ty: number; route: number[] | null; dest: { x: number; y: number } | null; walkPhase: number }, speed = SPEED): boolean {
  if (!s.dest) return true;
  if (!s.route) { s.route = findRoute(g, Math.floor(s.x), Math.floor(s.y), s.dest.x, s.dest.y, 3000, true, s.pz ?? s.z); if (!s.route) { s.dest = null; return true; } }
  const next = s.route[0]; if (next === undefined) { s.route = null; s.dest = null; return true; }
  const nx = keyX(next) + 0.5, ny = keyY(next) + 0.5, nzz = keyZ(next);

  const dx = nx - s.x, dy = ny - s.y; const d = Math.sqrt(dx * dx + dy * dy); const step = speed / 40;
  if (d <= step) { s.x = nx; s.y = ny; s.pz = nzz; s.route.shift(); s.tx = Math.floor(s.x); s.ty = Math.floor(s.y); if (!s.route.length) { s.z = walkZ(g, s.tx, s.ty, 0.5, 0.5, s.pz); s.route = null; s.dest = null; return true; } }
  else { s.x += (dx / d) * step; s.y += (dy / d) * step; s.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3); }
  // crossing into the next tile, the walker steps onto the path at the route's height there
  const ttx = Math.floor(s.x), tty = Math.floor(s.y); if ((ttx !== s.tx || tty !== s.ty) && ttx === Math.floor(nx) && tty === Math.floor(ny)) s.pz = nzz;
  s.tx = ttx; s.ty = tty; s.z = walkZ(g, s.tx, s.ty, s.x - s.tx, s.y - s.ty, s.pz); s.walkPhase += 0.25;
  return false;
}
// ---------- patrol areas ----------
export const PATROL = 4;   // a patrol square is 4×4 tiles, like the original
export const patrolCell = (g: GameState, x: number, y: number) => Math.floor(y / PATROL) * Math.ceil(g.w / PATROL) + Math.floor(x / PATROL);
const AREAS = new WeakMap<number[], Set<number>>();
/** Is (x, y) inside this staff member's patrol area? (no area = the whole park) */
export function inArea(g: GameState, s: Staff, x: number, y: number): boolean {
  const p = s.patrol; if (!p || !p.length) return true; let set = AREAS.get(p); if (!set || set.size !== p.length) { set = new Set(p); AREAS.set(p, set); } return set.has(patrolCell(g, x, y));
}
/** Outside the area: head for the nearest path tile inside it. */
function backToArea(g: GameState, s: Staff): boolean {
  let tries = 0;   // at most three routes asked for: an area the paths do not reach must not stall the tick
  for (let r = 1; r < 48 && tries < 3; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    if (Math.max(Math.abs(xx), Math.abs(yy)) !== r) continue; const x = s.tx + xx, y = s.ty + yy; const t = tileAt(g, x, y);
    const q = t?.paths.find(o => !o.queue); if (q && inArea(g, s, x, y)) { tries++; const route = findRoute(g, s.tx, s.ty, x, y, 4000, true, s.pz ?? s.z, q.z); if (route) { s.dest = { x, y }; s.route = route; return true; } if (tries >= 3) return false; }
  }
  return false;
}
function wander(g: GameState, s: Staff) {
  if (!inArea(g, s, s.tx, s.ty) && backToArea(g, s)) return;
  let opts = pathNeighbours(g, s.tx, s.ty, s.pz ?? s.z).filter(([x, y, z]) => !pathAt(tileAt(g, x, y), z)!.queue);
  if (s.patrol?.length) { const inside = opts.filter(([x, y]) => inArea(g, s, x, y)); if (inside.length) opts = inside; }
  if (!opts.length) { // stuck off the path: head for the nearest path tile
    for (let r = 1; r < 6; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const t = tileAt(g, s.tx + xx, s.ty + yy); const q = t?.paths.find(o => !o.queue); if (q) { s.x = s.tx + xx + 0.5; s.y = s.ty + yy + 0.5; s.tx += xx; s.ty += yy; s.pz = q.z; s.z = q.z; return; } }
    return;
  }
  // prefer continuing straight
  const straight = opts.find(([x, y]) => x === s.tx + DX[s.dir] && y === s.ty + DY[s.dir]);
  const [x, y, z] = straight && rand(g) < 0.6 ? straight : pick(g, opts);
  s.dest = { x, y }; s.route = [nkey(x, y, z)];
}
function handyman(g: GameState, s: Staff) {
  if (s.state === 'sweeping' || s.state === 'emptying') { s.timer--; if (s.timer <= 0) { const t = tileAt(g, s.tx, s.ty)!; if (s.state === 'sweeping') { if (t.litter) { t.litter = 0; s.stats.litterSwept++; g.stats.litterSwept++; } if (t.vomit) { t.vomit = 0; s.stats.litterSwept++; } t.litterAge = 0; } else { const b = t.paths.find(o => o.adds.bin !== undefined && o.adds.bin >= 8); if (b) b.adds.bin = 0; s.stats.binsEmptied++; } s.state = 'walking'; } return; }
  if (walk(g, s)) {
    const t = tileAt(g, s.tx, s.ty);
    if (t?.paths.length && (t.litter || t.vomit)) { s.state = 'sweeping'; s.timer = 60; return; }
    if (t?.paths.some(o => (o.adds.bin ?? 0) >= 8)) { s.state = 'emptying'; s.timer = 80; return; }
    // look for litter nearby
    let best: [number, number] | null = null, bd = 99;
    for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) { const tt = tileAt(g, s.tx + xx, s.ty + yy); if (tt?.paths.length && (tt.litter || tt.vomit || tt.paths.some(o => (o.adds.bin ?? 0) >= 8)) && inArea(g, s, s.tx + xx, s.ty + yy)) { const d = Math.abs(xx) + Math.abs(yy); if (d < bd) { bd = d; best = [s.tx + xx, s.ty + yy]; } } }
    if (best && rand(g) < 0.9) { s.dest = { x: best[0], y: best[1] }; s.route = null; } else wander(g, s);
  }
}
function mechanic(g: GameState, s: Staff) {
  if (s.state === 'fixing' || s.state === 'inspecting') {
    s.timer--; if (s.timer <= 0) { const r = rideById(g, s.target); if (r) { if (s.state === 'fixing' && r.breakdown) { fixRide(g, r); s.stats.ridesFixed++; } else if (s.state === 'inspecting') { inspectRide(g, r); s.stats.ridesInspected++; } } s.state = 'walking'; s.target = null; }
    return;
  }
  if (s.state === 'heading') {
    const r = rideById(g, s.target); if (!r || (!r.breakdown && !(r as any).dueInspection)) { s.state = 'walking'; s.target = null; s.dest = null; s.route = null; return; }
    if (walk(g, s)) { s.state = r.breakdown ? 'fixing' : 'inspecting'; s.timer = r.breakdown ? 600 + randInt(g, 600) : 240; }
    return;
  }
  // free: answer the nearest call
  let best: { r: typeof g.rides[number]; d: number } | null = null;
  for (const r of g.rides) {
    const def = RIDE_BY_KEY[r.type]; if (def.kind === 'stall' || !r.exit) continue;
    const needs = (r.breakdown && r.breakdown.mechanicId === null) || ((r as any).dueInspection && !r.breakdown && !g.staff.some(o => o.target === r.id));
    if (!needs) continue;
    // a mechanic with an area looks after the rides in it; a breakdown nobody has answered for a while is anyone's
    if (!inArea(g, s, r.exit.x, r.exit.y) && !(r.breakdown && g.tick - r.breakdown.since > 1500)) continue;
    const d = Math.abs(r.exit.x - s.x) + Math.abs(r.exit.y - s.y); if (!best || d < best.d) best = { r, d };
  }
  if (best) { const r = best.r; const ex = r.exit!; const px = ex.x + DX[(ex.dir + 2) & 3], py = ex.y + DY[(ex.dir + 2) & 3];   // the path tile outside the exit hut
    const t = tileAt(g, px, py); const dest = t?.paths.length ? { x: px, y: py } : { x: ex.x, y: ex.y };
    s.target = r.id; s.dest = dest; s.route = null; s.state = 'heading'; if (r.breakdown) r.breakdown.mechanicId = s.id; return; }
  if (walk(g, s)) wander(g, s);
}
function security(g: GameState, s: Staff) { if (walk(g, s)) wander(g, s); }
function entertainer(g: GameState, s: Staff) {
  if (s.state === 'entertaining') { s.timer--; if (s.timer <= 0) s.state = 'walking'; return; }
  if (walk(g, s)) {
    if (rand(g) < 0.25) { s.state = 'entertaining'; s.timer = 120; for (const gu of g.guests) { if (gu.state === 'left') continue; if (Math.abs(gu.x - s.x) < 3 && Math.abs(gu.y - s.y) < 3) { gu.happinessTarget = Math.min(255, gu.happinessTarget + (gu.state === 'queuing' ? 3 : 4)); if (gu.state === 'queuing') gu.queueTime = Math.max(0, gu.queueTime - 200); } } }
    else wander(g, s);
  }
}
