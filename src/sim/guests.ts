// Guests: arrive at the entrance, walk the paths, get hungry, pick rides that suit them, queue, ride, buy things, think, and leave.
// The rules follow the original closely (intensity windows, nausea tolerance, value checks, the 128-tick need updates).
import { DX, DY, clamp, key, type Dir, type GameState, type Guest, type Ride, type Tile, type PathTile } from './types';
import { SCENERY_BY_KEY, sceneryAround } from './scenery';
import { tileAt, pathNeighbours, findRoute, walkZ, pathNear, pathAt, pathLink, edgeZ, landTop, nkey } from './map';
import { rand, randInt, pick } from './rng';
import { RIDE_BY_KEY } from './rides';
import { earn, spend, Cat } from './finance';
import { totalRideValueForMoney } from './park';
import { campaignSpawnBonus } from './marketing';
import { walk } from './staff';
import { news } from './game';
import { tempoOf } from './time';
import { eventArrivals } from './events';
import { rideById, crowdAt, runtime } from './runtime';
import { chooseDirection, aimless, linkMask, leadsTo, MAX_JUNCTIONS } from './rct/pathfind';
import { RCT_RIDES } from './rct/ride-data';
import { guestName } from './names';

const NAUSEA_MAX = [300, 600, 800, 1000];
const ITEM_VALUE: Record<string, number> = { burger: 190, chips: 160, pizza: 210, hotDog: 170, iceCream: 100, candyfloss: 90, drink: 120, coffee: 110, lemonade: 110, balloon: 140, hat: 270, map: 70, umbrella: 350 };
const EAT_TICKS: Record<string, number> = { burger: 600, chips: 480, pizza: 600, hotDog: 530, iceCream: 240, candyfloss: 200, drink: 400, coffee: 360, lemonade: 460 };
const DRINKS = new Set(['drink', 'coffee', 'lemonade']);
/** Most guests on the map at once (in the park, arriving or leaving). */
export const MAX_GUESTS = 4000;

// ---------- spawning ----------
export function spawnGuests(g: GameState) {
  if (!g.parkOpen || g.guests.length > MAX_GUESTS) return;
  let p = 50 + clamp(g.rating - 200, 0, 650);
  const inPark = g.guestsInPark + runtime(g).entering;
  if (inPark > g.suggestedMax) { p >>= 2; if (g.difficultGuests) p >>= 2; }
  if (!g.noMoney && g.finance.entranceFee > 0) { const v = totalRideValueForMoney(g); if (g.finance.entranceFee > v) p >>= 2; if (g.finance.entranceFee / 2 > v) p >>= 2; }
  for (const a of g.awards) p += (a.type === 0 || a.type === 5 || a.type === 9 || a.type === 11 || a.type === 14) ? -(p >> 2) : (p >> 2);
  p += campaignSpawnBonus(g); p *= tempoOf(g).arrivals * eventArrivals(g);
  if (randInt(g, 65536) < p) {
    if (g.difficultGuests && inPark > g.suggestedMax + 150) return;
    g.guests.push(makeGuest(g));
  }
}
/** A guest arriving now at the map edge (park events: a school trip, a VIP), with a few things set. */
export function spawnGuest(g: GameState, o: { name?: string; cash?: number; intMax?: number; happiness?: number }): Guest {
  const gu = makeGuest(g); if (o.name) gu.name = o.name; if (o.cash !== undefined && !g.noMoney) gu.cash = o.cash;
  if (o.intMax !== undefined) { gu.intMax = o.intMax; gu.intMin = Math.max(0, Math.min(o.intMax, 7) - 4); } if (o.happiness !== undefined) gu.happiness = gu.happinessTarget = o.happiness;
  g.guests.push(gu); return gu;
}
const gu0 = (id: number) => id % 18;   // stagger the surroundings check
function makeGuest(g: GameState): Guest {
  const id = g.nextGuestId++;
  const d = () => randInt(g, 32) - 15;
  // like the original: the high end is 3..10, the low end is min(high, 7) - 3, so most guests happily ride gentle rides
  const intMax = 3 + randInt(g, 8); const intMin = Math.max(0, Math.min(intMax, 7) - 4);
  const tolRoll = randInt(g, 12); const nauseaTol = (tolRoll < 1 ? 0 : tolRoll < 3 ? 1 : tolRoll < 6 ? 2 : 3) as 0 | 1 | 2 | 3;
  const cash = g.noMoney ? 0 : Math.max(0, 5000 + [-1000, 0, 1000, 2000][randInt(g, 4)] + randInt(g, 1000));
  return { id, name: guestName(id, !g.guestNumbers), x: g.spawn.x + 0.5, y: g.spawn.y + 0.5, z: 0, dir: 3, tx: g.spawn.x, ty: g.spawn.y, state: 'entering',
    happiness: 128 + d(), happinessTarget: 128 + d(), energy: 65 + randInt(g, 64), energyTarget: 128, hunger: 200 + d(), thirst: 200 + d(), toilet: randInt(g, 40), nausea: 0, nauseaTarget: 0, nauseaTol, intMin, intMax,
    cash, spent: 0, items: { balloon: null, umbrella: rand(g) < 0.08, map: false, hat: false, food: null, drink: null, photo: false, souvenir: false }, eatTimer: 0, thoughts: [], entered: g.tick, ridesTaken: 0, prevRide: null, favourite: null, headingTo: null,
    dest: { x: g.entrance.x + (rand(g) < 0.5 ? 0 : 1), y: g.entrance.y - 2 }, route: null, lostTimer: 0, queueTime: 0, rideId: null, sitTimer: 0, watchTimer: 0, shirt: randInt(g, 12), trousers: randInt(g, 4), hair: randInt(g, 5), litterTimer: 0, angry: 0, vouchers: 0,
    flags: { leaving: false, paidEntry: false, tracked: false, sick: false, lost: false, crowded: false, atm: 0 }, walkPhase: rand(g) * 4,
    pz: 0, using: null, usedAt: -1e9, aim: null, pf: null, lostCd: 0, aimSteps: 0, ridden: [], surround: gu0(id), onRide: 0, want: null, boardTick: 0 };   // every field from the start: one object shape for all guests keeps the hot loops fast
}

export function think(gu: Guest, t: string, arg?: string) {
  if (gu.thoughts.slice(0, 3).some(x => x.t === t && x.arg === arg)) return;
  gu.thoughts.unshift({ t, arg, age: 0, at: key(gu.tx, gu.ty) }); if (gu.thoughts.length > 6) gu.thoughts.length = 6;
}

// ---------- main update ----------
export function updateGuests(g: GameState) {
  const tickPhase = g.tick & 127;
  let removed = false, arriving = 0;
  for (const gu of g.guests) {
    if (gu.state === 'left') { removed = true; continue; }
    if (gu.state === 'entering') arriving++;
    if ((gu.id & 127) === tickPhase) slowUpdate(g, gu);
    // smooth drift toward targets
    if ((g.tick & 7) === 0) {
      gu.happiness += gu.happiness < gu.happinessTarget ? 1 : gu.happiness > gu.happinessTarget ? -1 : 0;
      gu.nausea += gu.nausea < gu.nauseaTarget ? 1 : gu.nausea > gu.nauseaTarget ? -1 : 0;
      gu.energy += gu.energy < gu.energyTarget ? 1 : gu.energy > gu.energyTarget ? -1 : 0;
      gu.energy = clamp(gu.energy, 32, 128);
    }
    if (gu.eatTimer > 0) { gu.eatTimer--; if (gu.eatTimer === 0) finishEating(g, gu); }
    switch (gu.state) {
      case 'entering': entering(g, gu); break;
      case 'walking': walking(g, gu); break;
      case 'queuing': queuing(g, gu); break;
      case 'riding': break;
      case 'leavingRide': leaveRide(g, gu); break;
      case 'sitting': gu.sitTimer--; if (gu.sitTimer <= 0) { gu.state = 'walking'; gu.energyTarget = 128; } break;
      case 'buying': gu.sitTimer--; if (gu.sitTimer <= 0) finishBuying(g, gu); break;
      case 'leaving': leaving(g, gu); break;
      case 'watching': gu.watchTimer--; if (gu.watchTimer <= 0) gu.state = 'walking'; break;
      case 'admiring': gu.sitTimer--; if (gu.sitTimer <= 0) { gu.state = 'walking'; gu.using = null; } break;
    }
  }
  if (removed) g.guests = g.guests.filter(x => x.state !== 'left');
  runtime(g).entering = arriving;
}

/** The original's 128-tick update: needs drift, thoughts, vomiting, leaving decisions. */
function slowUpdate(g: GameState, gu: Guest) {
  for (const t of gu.thoughts) t.age++; gu.thoughts = gu.thoughts.filter(t => t.age < 40);
  if (gu.state === 'riding' && (gu.id & 511) === (g.tick & 511)) {   // RCT: a long time on one ride wears thin
    gu.onRide = (gu.onRide ?? 0) + 1; if (gu.onRide > 15) gu.happinessTarget = Math.max(0, gu.happinessTarget - 5);
    const r = gu.onRide > 22 ? rideById(g, gu.rideId) : null; if (r) think(gu, RCT_RIDES[RIDE_BY_KEY[r.type].rct ?? RIDE_BY_KEY[r.type].coaster?.rct ?? '']?.flags.includes('describeAsInside') ? 'get_out' : 'get_off', r.name);
  }
  if (gu.state === 'riding' || gu.state === 'entering') return;
  gu.hunger = Math.max(0, gu.hunger - 2); gu.thirst = Math.max(0, gu.thirst - (g.weather.temp >= 21 ? 3 : 2)); gu.toilet = Math.min(255, gu.toilet + 2);
  // RCT: walking wears guests down (energy target −2) and a full stomach builds them back up (+2), so guests only tire
  // when they go hungry; energy itself stays between 32 and 128
  if ((gu.state === 'walking' || gu.state === 'leaving') && gu.energyTarget >= 33) gu.energyTarget -= 2;
  if (gu.hunger >= 3) gu.energyTarget = Math.min(255, gu.energyTarget + 2);
  if (gu.state === 'sitting' || (gu.state === 'admiring' && gu.using?.act === 'sit')) { gu.energyTarget = Math.min(135, gu.energyTarget + 5); gu.thirst = Math.max(0, gu.thirst - 2); gu.nauseaTarget = Math.max(0, gu.nauseaTarget - 6); }
  // happiness drifts toward the middle, pulled down by unmet needs
  gu.happinessTarget += gu.happinessTarget < 127 ? 1 : gu.happinessTarget > 127 ? -1 : 0;
  if (gu.energy <= 50) gu.happinessTarget -= 2; if (gu.hunger < 25 || gu.thirst < 25) gu.happinessTarget -= 1; if (gu.toilet >= 195) gu.happinessTarget -= 1; if (gu.nausea >= 140) gu.happinessTarget -= 1;
  gu.nauseaTarget = Math.max(0, gu.nauseaTarget - 2);
  gu.happinessTarget = clamp(gu.happinessTarget, 0, 255);
  // thoughts about needs
  if (gu.energy <= 70 && gu.happiness < 128) think(gu, 'tired');
  if (gu.hunger <= 60 && !gu.items.food) think(gu, 'hungry');
  if (gu.thirst <= 60 && !gu.items.drink) think(gu, 'thirsty');
  if (gu.toilet >= 160) think(gu, 'toilet');
  if (gu.nausea >= 140) think(gu, 'sick');
  if (!g.noMoney && gu.cash <= 900 && gu.happiness >= 105 && gu.energy >= 70) think(gu, 'spent_money');
  if (g.weather.kind >= 3 && !gu.items.umbrella && rand(g) < 0.3) { think(gu, 'raining'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 1); }
  // surroundings
  const t = tileAt(g, gu.tx, gu.ty); const p = pathNear(t, gu.pz ?? gu.z);   // the path they stand on (a tile can hold several)
  if (t && p) {
    if (t.litter + t.vomit >= 3) { think(gu, t.vomit ? 'disgusting' : 'litter'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 2); }
    const crowd = crowdAt(g, gu.tx, gu.ty); if (crowd >= 8) { think(gu, 'crowded'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 1); }
  }
  rctUpdate(g, gu, t, p);
  // vomiting
  if (gu.nauseaTarget >= 128 && randInt(g, 256) < (gu.nausea - 128) / 2 && gu.state !== 'queuing') { if (t && p) { t.vomit++; t.litterAge = 0; } gu.nausea = Math.max(0, gu.nausea - 30); gu.nauseaTarget = Math.floor(gu.nauseaTarget / 2); gu.hunger = Math.floor(gu.hunger / 2); g.stats.vomits++; think(gu, 'sick'); }
  // vandalism: unhappy, energetic, nobody watching
  if (gu.happiness < 48 && gu.energy >= 85 && gu.state === 'walking' && p && (p.adds.bench || p.adds.lamp) && !p.broken && rand(g) < 0.05) {
    const guard = g.staff.some(s => s.type === 'security' && Math.abs(s.x - gu.x) < 7 && Math.abs(s.y - gu.y) < 7);
    if (guard) { const s = g.staff.find(s => s.type === 'security' && Math.abs(s.x - gu.x) < 7 && Math.abs(s.y - gu.y) < 7)!; s.stats.vandalsStopped++; }
    else { p.broken = true; gu.angry = 16; news(g, 'sad', `A bench was vandalised near ${rideNear(g, gu) ?? 'the entrance'}.`, { kind: 'tile', x: gu.tx, y: gu.ty }); }
  }
  // leaving?
  if (!gu.flags.leaving && gu.state === 'walking') {
    const stays = g.noMoney ? (gu.energy >= 70 && gu.happiness >= 60) : (gu.energy >= 55 && gu.happiness >= 45 && (gu.cash >= 500 || gu.want === 'cash'));   // (on the way to a cash machine)
    const longVisit = g.tick - gu.entered > 24000 && rand(g) < 0.04;
    if ((!stays && rand(g) < 0.05) || longVisit || !g.parkOpen) startLeaving(g, gu, !g.parkOpen ? 'closed_park' : 'go_home');
  }
}
/** RCT's every-512-ticks block: take in the surroundings now and then, and choose a ride to head for. Needs here
 *  run about four times faster than in RCT (a visit is shorter), so this runs every 128 ticks with the same odds. */
function rctUpdate(g: GameState, gu: Guest, t: Tile | null, p: PathTile | null) {
  gu.surround = (gu.surround ?? 0) + 1;
  if (gu.surround >= 18 && t && p) { gu.surround = 0; const th = assessSurroundings(g, gu.tx, gu.ty, p.z); if (th) { think(gu, th); gu.happinessTarget = Math.min(255, gu.happinessTarget + 45); } }
  if (gu.state !== 'walking' || gu.flags.leaving) return;
  // a guest who has ridden nothing after a while looks hard for a ride, and goes home disappointed if there is none
  if (gu.ridesTaken === 0 && gu.headingTo === null && g.tick - gu.entered >= 5 * 2048) {
    pickRide(g, gu); if (gu.headingTo === null) { gu.happinessTarget = Math.max(0, gu.happinessTarget - 128); startLeaving(g, gu, 'go_home'); return; }
  }
  if (randInt(g, 65536) <= (gu.items.map ? 8192 : 2184)) pickRide(g, gu);
}
/** RCT's GuestAssessSurroundings, over 5 tiles each way: lots of scenery, fountains, or a spotless park lift a guest's
 *  mood (litter or broken benches spoil it). */
function assessSurroundings(g: GameState, x: number, y: number, z: number): string | null {
  let scenery = 0, fountains = 0, rubbish = 0;
  for (let yy = y - 5; yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) {
    const t = tileAt(g, xx, yy); if (!t) continue;
    if (t.scenery && (!t.scenery.root || (t.scenery.root[0] === xx && t.scenery.root[1] === yy))) { scenery++; if (t.scenery.kind.includes('fountain')) fountains++; }
    rubbish += t.litter + t.vomit; for (const q of t.paths) if (q.broken) rubbish++;
  }
  if (landTop(tileAt(g, x, y)!) > z + 2) return null;   // in a tunnel: nothing to see
  if (fountains >= 5 && rubbish < 20) return 'fountains';
  if (scenery >= 40 && rubbish < 8) return 'scenery';
  if (rubbish < 2 && g.guestsInPark > 30) return 'clean';
  return null;
}
function rideNear(g: GameState, gu: Guest): string | null { let best: Ride | null = null, bd = 99; for (const r of g.rides) { const d = Math.abs(r.x - gu.x) + Math.abs(r.y - gu.y); if (d < bd) { bd = d; best = r; } } return best && bd < 12 ? best.name : null; }

// ---------- entering / leaving ----------
function entering(g: GameState, gu: Guest) {
  if (walk(g, gu, 1.0)) {
    if (!gu.dest && gu.ty > g.entrance.y - 2 + 0.01) { // never reached the park: no path in
      if (!gu.route && gu.lostTimer++ > 3) { gu.state = 'left'; return; }
      gu.dest = { x: g.entrance.x, y: g.entrance.y - 2 }; return;
    }
    const fee = g.noMoney ? 0 : g.finance.entranceFee;
    if (fee > gu.cash) { think(gu, 'fee'); gu.state = 'left'; return; }
    if (fee) { gu.cash -= fee; gu.spent += fee; gu.flags.paidEntry = true; earn(g, fee, Cat.EntranceTickets); }
    gu.state = 'walking'; g.guestsInPark++; g.totalAdmissions++; gu.entered = g.tick;
  }
}
export function startLeaving(g: GameState, gu: Guest, why = 'go_home') {
  gu.flags.leaving = true; gu.headingTo = null; think(gu, why);
  if (gu.state === 'queuing') leaveQueue(g, gu);
  gu.state = 'leaving'; gu.dest = null; gu.route = null; gu.lostTimer = 0; gu.lostCd = 254; aimAt(gu, exitTile(g));
}
/** The path piece just inside the park gate that leaving guests make for. */
function exitTile(g: GameState): [number, number, number] {
  const y = g.entrance.y - 1; for (const x of [g.entrance.x, g.entrance.x + 1]) { const p = tileAt(g, x, y)?.paths.find(o => !o.queue); if (p) return [x, y, p.z]; }
  return [g.entrance.x, y, landTop(tileAt(g, g.entrance.x, y)!)];
}
function leaving(g: GameState, gu: Guest) {
  if (gu.ty >= g.entrance.y - 1 && !gu.aim) {   // through the gate: off to the map edge on the outside path
    if (!gu.dest) { gu.dest = { x: g.spawn.x, y: g.spawn.y }; gu.route = null; }
    walk(g, gu, 1.0); if (!gu.dest && gu.ty >= g.spawn.y - 1) { gu.state = 'left'; g.guestsInPark = Math.max(0, g.guestsInPark - 1); } else if (!gu.dest) gu.dest = { x: g.spawn.x, y: g.spawn.y };
    return;
  }
  if (!walk(g, gu, 1.0)) return;
  if (!gu.aim) aimAt(gu, exitTile(g));
  const p = pathNear(tileAt(g, gu.tx, gu.ty), gu.pz ?? gu.z); if (!p) { snapToPath(g, gu); return; }
  if (atAim(gu, p)) { gu.aim = null; gu.pf = null; gu.dest = { x: g.spawn.x, y: g.spawn.y }; gu.route = null; return; }
  if (!stepOn(g, gu, p)) { gu.lostTimer++; if (gu.lostTimer === 2) think(gu, 'cant_find_exit'); }
}

// ---------- RCT pathfinding: one tile at a time ----------
function aimAt(gu: Guest, at: [number, number, number] | null) { gu.aim = at; gu.aimSteps = 0; gu.pf = null; if (at && !gu.flags.leaving) gu.lostCd = 200; }
const atAim = (gu: Guest, p: PathTile) => !!gu.aim && gu.tx === gu.aim[0] && gu.ty === gu.aim[1] && p.z === gu.aim[2];
/** The ride whose queue starts here, when (x, y) piece q is the far end of a ride's queue line. */
function queueMouth(g: GameState, x: number, y: number, q: PathTile): Ride | null {
  if (!q.queue || q.rideId === null) return null; const r = rideById(g, q.rideId); if (!r) return null;
  const line = queueLine(g, r); const end = line[line.length - 1]; return end && end[0] === x && end[1] === y && end[2] === q.z ? r : null;
}
/** CalculateNextDestination: the next tile for a guest standing on piece p, set as their walk. False if there is none. */
function stepOn(g: GameState, gu: Guest, p: PathTile): boolean {
  const x = gu.tx, y = gu.ty; const opts: ([number, number, number] | null)[] = [null, null, null, null]; const mouths: (Ride | null)[] = [null, null, null, null]; let edges = 0;
  for (let d = 0; d < 4; d++) {
    const q = pathLink(g, x, y, p, d as Dir); if (!q) continue; const nx = x + DX[d], ny = y + DY[d];
    if (q.queue && !p.queue) { const r = queueMouth(g, nx, ny, q); if (!r) continue; mouths[d] = r; }   // into a queue only at its mouth
    edges |= 1 << d; opts[d] = [nx, ny, q.z];
  }
  if (!edges) return false;
  const back = (gu.dir + 2) & 3;
  if (!(edges & ~(1 << back))) deadEnd(g, gu); else edges &= ~(1 << back);
  let d = edges & 1 ? 0 : edges & 2 ? 1 : edges & 4 ? 2 : 3;
  if (edges & ~(1 << d)) {
    if (gu.aim) {
      const leavingLost = gu.flags.leaving && (gu.lostCd ?? 254) < 90;
      const maxJ = gu.flags.leaving ? (leavingLost ? MAX_JUNCTIONS.leavingLost : MAX_JUNCTIONS.leaving) : gu.items.map ? MAX_JUNCTIONS.map : MAX_JUNCTIONS.guest;
      d = chooseDirection(g, gu, x, y, p, gu.aim, gu.headingTo, maxJ);
      if (d < 0 || !opts[d]) { gu.pf = null; if (d < 0) lostOnTheWay(g, gu); d = aimless(() => rand(g), gu.dir, edges); }   // no way gets anywhere near: that counts toward giving up (ours)
    } else {
      // most guests walking about (not carrying food) keep off paths that only lead to a dead end
      if (!gu.items.food && !gu.items.drink && rand(g) >= 2184 / 65536) { let keep = edges; for (let e = 0; e < 4; e++) if (keep & (1 << e) && !mouths[e] && leadsTo(g, x, y, p.z, e as Dir) === 'deadEnd') keep &= ~(1 << e); if (keep) edges = keep; }
      for (let tries = 0; tries < 4; tries++) {   // a queue's mouth: they think about the ride on the spot (RCT), and turn away if not
        d = aimless(() => rand(g), gu.dir, edges); const r = d >= 0 ? mouths[d] : null; if (!r) break;
        if (gu.flags.leaving || !wantsRide(g, gu, r, true)) { edges &= ~(1 << d); d = -1; if (!edges) break; continue; }
        gu.headingTo = r.id; aimAt(gu, opts[d]); break;
      }
      if (d < 0) d = back;
    }
  } else if (mouths[d] && !gu.aim && !gu.flags.leaving) {   // the only way on is into a queue
    const r = mouths[d]!; if (wantsRide(g, gu, r, true)) { gu.headingTo = r.id; aimAt(gu, opts[d]); } else d = back;
  }
  const to = opts[d] ?? (() => { const q = pathLink(g, x, y, p, d as Dir); return q ? [x + DX[d], y + DY[d], q.z] as [number, number, number] : null; })(); if (!to) return false;
  if (gu.aim && ++gu.aimSteps! > 3 * (Math.abs(gu.aim[0] - x) + Math.abs(gu.aim[1] - y)) + 120) { gu.aimSteps = 0; lostOnTheWay(g, gu); }   // walking a long way round: ours too
  gu.dest = { x: to[0], y: to[1] }; gu.route = [nkey(to[0], to[1], to[2])]; return true;
}
/** At a dead end: RCT's checkIfLost, checkCantFindRide and checkCantFindExit. */
function deadEnd(g: GameState, gu: Guest) {
  if (g.rides.length >= 2 && !gu.items.map) { gu.lostTimer++; if (gu.lostTimer >= 48) { gu.lostTimer = 40; think(gu, 'lost'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 30); } }
  lostOnTheWay(g, gu);
}
function lostOnTheWay(g: GameState, gu: Guest) {
  if (gu.flags.leaving) {
    if (gu.lostCd === 1) { think(gu, 'cant_find_exit'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 30); }
    gu.lostCd = (gu.lostCd ?? 254) - 1; if (gu.lostCd <= 0) gu.lostCd = 90; return;
  }
  if (gu.headingTo === null || !gu.aim) return;
  if (gu.lostCd === 30 || gu.lostCd === 60) { const r = rideById(g, gu.headingTo); think(gu, 'cant_find', r?.name); gu.happinessTarget = Math.max(0, gu.happinessTarget - 30); }
  gu.lostCd = (gu.lostCd ?? 200) - 1; if (gu.lostCd <= 0) { gu.headingTo = null; aimAt(gu, null); }
}

// ---------- walking and deciding ----------
function walking(g: GameState, gu: Guest) {
  const arrived = walk(g, gu, 0.95 + (gu.energy / 255) * 0.3);
  if (!arrived) return;
  // arrived on a tile: walking somewhere, or there?
  const t = tileAt(g, gu.tx, gu.ty);
  const p = pathNear(t, gu.pz ?? gu.z); if (!t || !p) { snapToPath(g, gu); return; }
  if (gu.aim) {
    if (!atAim(gu, p)) { if (stepOn(g, gu, p)) return; aimAt(gu, null); gu.headingTo = null; gu.rideId = null; }
    else {
      gu.aim = null; gu.pf = null;
      if (gu.headingTo !== null) { const r = rideById(g, gu.headingTo); gu.headingTo = null; if (r && arriveAtRide(g, gu, r)) return; }
      if (gu.rideId !== null) { const r = rideById(g, gu.rideId); gu.rideId = null; if (r && RIDE_BY_KEY[r.type].kind === 'stall' && arriveAtStall(g, gu, r)) return; }
    }
  }
  // sit down?
  if (p.adds.bench && !p.broken && (gu.energy <= 60 || (gu.items.food && gu.hunger < 128)) && rand(g) < 0.5) { gu.state = 'sitting'; gu.sitTimer = Math.min(2000, (129 - gu.energy) * 16 + 50); gu.energyTarget = 135; return; }
  if (useScenery(g, gu)) return;
  if (passStall(g, gu, p) || passEntrance(g, gu, p)) return;
  decide(g, gu, p);
}
/** Next to a piece with a use, a guest may stop: take a photo (statues, the rocket), gather round (fountain, saucer,
 *  dome) or sit at a picnic table (more likely with food in hand or tired). Each stop lifts their mood; then they
 *  wait a while before stopping again. */
function useScenery(g: GameState, gu: Guest): boolean {
  if (gu.flags.leaving || (gu.usedAt !== undefined && g.tick - gu.usedAt < 3000)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue; const t = tileAt(g, gu.tx + dx, gu.ty + dy); const def = t?.scenery ? SCENERY_BY_KEY[t.scenery.kind] : undefined; if (!def?.use) continue;
    const chance = def.use === 'sit' ? (gu.items.food || gu.items.drink || gu.energy < 100 ? 0.6 : 0.1) : 0.3; if (rand(g) >= chance) continue;
    const [rx, ry] = t!.scenery!.root ?? [gu.tx + dx, gu.ty + dy]; const n = def.size ?? 1;
    gu.state = 'admiring'; gu.using = { x: rx + n / 2, y: ry + n / 2, act: def.use, kind: def.key }; gu.usedAt = g.tick;
    gu.sitTimer = def.use === 'sit' ? 700 : def.use === 'gather' ? 360 : 160;
    think(gu, def.use === 'sit' ? 'picnic' : def.use === 'photo' ? 'photo' : 'gather', def.name);
    gu.happinessTarget = Math.min(255, gu.happinessTarget + (def.use === 'sit' ? 4 : 6)); if (def.use === 'sit') gu.energyTarget = Math.max(gu.energyTarget, 120);
    return true;
  }
  return false;
}
function snapToPath(g: GameState, gu: Guest) {
  for (let r = 1; r < 5; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const t = tileAt(g, gu.tx + xx, gu.ty + yy); const q = t?.paths.find(o => !o.queue); if (q) { gu.x = gu.tx + xx + 0.5; gu.y = gu.ty + yy + 0.5; gu.tx += xx; gu.ty += yy; gu.pz = q.z; gu.z = q.z; gu.route = null; gu.dest = null; return; } }
  startLeaving(g, gu, 'lost');
}
function wanderStep(g: GameState, gu: Guest) {
  const p = pathNear(tileAt(g, gu.tx, gu.ty), gu.pz ?? gu.z); if (!p || !stepOn(g, gu, p)) snapToPath(g, gu);
}
function decide(g: GameState, gu: Guest, p: PathTile) {
  // needs first
  if (gu.toilet >= 160 && goToFacility(g, gu, 'toilet')) return;
  if (gu.nausea >= 200 && goToFacility(g, gu, 'firstaid')) return;
  // RCT: guests who run short draw $50 from a cash machine (here at most twice a visit), if they still want to stay
  if (!g.noMoney && gu.cash < 1000 && (gu.flags.atm ?? 0) < 2 && gu.happiness >= 90 && gu.energy >= 60 && goToFacility(g, gu, 'cash')) return;
  if (gu.hunger <= 60 && !gu.items.food && goToStall(g, gu, 'food')) return;
  if (gu.thirst <= 60 && !gu.items.drink && goToStall(g, gu, 'drink')) return;
  if (gu.energy <= 60 && rand(g) < 0.5 && goToBench(g, gu)) return;
  if (g.weather.kind >= 3 && !gu.items.umbrella && rand(g) < 0.2 && goToStall(g, gu, 'umbrella')) return;
  if (gu.lostTimer >= 20 && !gu.items.map && rand(g) < 0.3 && goToStall(g, gu, 'map')) return;
  // otherwise walk on: aimless, and into any queue whose ride they like the look of (RCT)
  if (!stepOn(g, gu, p)) snapToPath(g, gu);
}
/** RCT: a ride entrance straight off the path (no queue line) is one more way to go; a guest walking past takes it
 *  about as often as any other way, and then decides on the spot whether to ride. */
function passEntrance(g: GameState, gu: Guest, p: PathTile): boolean {
  if (gu.flags.leaving || gu.aim || p.queue) return false;
  for (let d = 0; d < 4; d++) {
    const t = tileAt(g, gu.tx + DX[d], gu.ty + DY[d]); const e = t?.entrance; if (!e || e.exit) continue; const r = rideById(g, e.rideId); if (!r?.entrance || r.entrance.x !== gu.tx + DX[d] || r.entrance.y !== gu.ty + DY[d]) continue;
    const [fx, fy] = frontTile(r, r.entrance); if (fx !== gu.tx || fy !== gu.ty) continue;
    const ways = linkMask(g, gu.tx, gu.ty, p); if (rand(g) * ((ways & 1) + ((ways >> 1) & 1) + ((ways >> 2) & 1) + ((ways >> 3) & 1) + 1) >= 1) return false;
    return wantsRide(g, gu, r, true) && arriveAtRide(g, gu, r, true);
  }
  return false;
}
/** RCT: a shop is one more way off the path; walking past, a guest turns in about as often as they would take any
 *  other way, then decides on the spot (not hungry, not thirsty, a souvenir only when happy after a few rides). */
function passStall(g: GameState, gu: Guest, p: PathTile): boolean {
  if (gu.flags.leaving || gu.aim) return false;
  for (let d = 0; d < 4; d++) {
    const t = tileAt(g, gu.tx + DX[d], gu.ty + DY[d]); if (!t || t.rideId === null) continue; const r = rideById(g, t.rideId); if (!r || r.status !== 'open') continue;
    const def = RIDE_BY_KEY[r.type]; if (def.kind !== 'stall') continue; const [fx, fy] = stallFront(r); if (fx !== gu.tx || fy !== gu.ty) continue;
    const ways = linkMask(g, gu.tx, gu.ty, p); if (rand(g) * ((ways & 1) + ((ways >> 1) & 1) + ((ways >> 2) & 1) + ((ways >> 3) & 1) + 1) >= 1) return false;
    if (r.id === gu.prevRide) return false;
    let want: string;
    if (def.facility) { if (def.facility === 'toilet' && gu.toilet < 70) return false; if (def.facility === 'firstaid' && gu.nausea < 128) return false; if (def.facility === 'cash' && (g.noMoney || gu.cash >= 1000 || (gu.flags.atm ?? 0) >= 2)) return false; if (def.facility === 'info' && gu.items.map) return false; want = def.facility === 'info' ? 'map' : def.facility; }
    else {
      const item = def.item; if (!item) return false; const drink = DRINKS.has(item), food = !drink && !['balloon', 'hat', 'map', 'umbrella'].includes(item);
      if (food || drink) { if (gu.items.food || gu.items.drink) { think(gu, 'havent_finished'); return false; } if (gu.nausea >= 145) return false; }
      if ((item === 'balloon' || item === 'iceCream' || item === 'candyfloss') && g.weather.kind >= 3) return false;
      if (item === 'iceCream' && g.weather.temp < 12) return false;
      if (food && gu.hunger > 75) { think(gu, 'not_hungry'); return false; }
      if (drink && gu.thirst > 75) { think(gu, 'not_thirsty'); return false; }
      if (!food && !drink && item !== 'map') { if (randInt(g, 128) + 115 > gu.happiness || gu.ridesTaken < 3) return false; if (item === 'balloon' && gu.items.balloon !== null) return false; if (item === 'hat' && gu.items.hat) return false; }
      if (item === 'map' && gu.items.map) return false;
      want = food ? 'food' : drink ? 'drink' : item;
    }
    gu.rideId = r.id; gu.want = want; if (arriveAtStall(g, gu, r)) return true; gu.rideId = null; return false;
  }
  return false;
}
function frontTile(r: Ride, e: { x: number; y: number; dir: Dir }): [number, number] { return [e.x - DX[e.dir], e.y - DY[e.dir]]; }
function stallFront(r: Ride): [number, number] { return [r.x + DX[r.rot], r.y + DY[r.rot]]; }
/** The path piece in front of a stall, where guests stand to buy. */
function stallSpot(g: GameState, r: Ride): [number, number, number] | null {
  const [fx, fy] = stallFront(r); const p = pathNear(tileAt(g, fx, fy), landTop(tileAt(g, r.x, r.y)!)); return p && !p.queue ? [fx, fy, p.z] : null;
}
/** RCT's PeepHeadForNearestRide: the nearest open stall that sells it, within 10 tiles (anywhere, with a park map).
 *  Guests set off for it without knowing the way and find it junction by junction. */
function goToStall(g: GameState, gu: Guest, want: 'food' | 'drink' | 'umbrella' | 'map' | 'balloon'): boolean {
  let best: Ride | null = null, bd = 1e9; const reach = gu.items.map ? 1e9 : 10;
  for (const r of g.rides) { const d = RIDE_BY_KEY[r.type]; if (d.kind !== 'stall' || r.status !== 'open' || !d.item) continue;
    const sells = want === 'food' ? (!DRINKS.has(d.item) && !['balloon', 'hat', 'map'].includes(d.item)) : want === 'drink' ? DRINKS.has(d.item) : want === 'umbrella' ? d.item2 === 'umbrella' : want === 'map' ? d.item === 'map' : d.item === 'balloon';
    if (!sells || Math.max(Math.abs(r.x - gu.tx), Math.abs(r.y - gu.ty)) > reach) continue; const dist = Math.abs(r.x - gu.x) + Math.abs(r.y - gu.y); if (dist < bd && stallSpot(g, r)) { bd = dist; best = r; } }
  if (!best) return false; aimAt(gu, stallSpot(g, best)); gu.rideId = best.id; gu.want = want; return true;
}
function goToFacility(g: GameState, gu: Guest, kind: 'toilet' | 'firstaid' | 'cash'): boolean {
  let best: Ride | null = null, bd = 1e9; const reach = gu.items.map && kind !== 'firstaid' ? 1e9 : 10;   // RCT: first aid only when close
  for (const r of g.rides) { const d = RIDE_BY_KEY[r.type]; if (d.facility !== kind || r.status !== 'open') continue; if (Math.max(Math.abs(r.x - gu.tx), Math.abs(r.y - gu.ty)) > reach) continue; const dist = Math.abs(r.x - gu.x) + Math.abs(r.y - gu.y); if (dist < bd && stallSpot(g, r)) { bd = dist; best = r; } }
  if (!best) return false; aimAt(gu, stallSpot(g, best)); gu.rideId = best.id; gu.want = kind; return true;
}
function goToBench(g: GameState, gu: Guest): boolean {
  for (let r = 1; r < 8; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { if (Math.max(Math.abs(xx), Math.abs(yy)) !== r) continue; const t = tileAt(g, gu.tx + xx, gu.ty + yy); const b = t?.paths.find(o => o.adds.bench && !o.broken); if (b) { aimAt(gu, [gu.tx + xx, gu.ty + yy, b.z]); return true; } }
  return false;
}
/** Queue tiles from the entrance hut outward (nearest the hut first). */
export function queueLine(g: GameState, r: Ride): [number, number, number][] {
  const cache = runtime(g).lines; const hit = cache.get(r); if (hit && hit.tick === g.tick) return hit.line;
  const line = traceQueue(g, r); cache.set(r, { tick: g.tick, line }); return line;
}
/** Queue tiles from the entrance hut outward, traced now (queueLine keeps one per ride per tick). */
export function traceQueue(g: GameState, r: Ride): [number, number, number][] {
  if (!r.entrance) return []; const [fx, fy] = frontTile(r, r.entrance); const ft = tileAt(g, fx, fy); const hz = landTop(tileAt(g, r.entrance.x, r.entrance.y)!);
  const fp = ft?.paths.find(p => edgeZ(p, r.entrance!.dir) === hz) ?? pathNear(ft, hz); if (!ft || !fp) return [];   // the path at the hut's door
  if (!fp.queue) return [[fx, fy, fp.z]];
  const line: [number, number, number][] = [[fx, fy, fp.z]]; const seen = new Set<number>([nkey(fx, fy, fp.z), key(r.entrance.x, r.entrance.y)]);
  let cx = fx, cy = fy, cz = fp.z;
  for (let i = 0; i < 60; i++) { let next: [number, number, number] | null = null; for (const [nx, ny, nz] of pathNeighbours(g, cx, cy, cz)) { const k = nkey(nx, ny, nz); if (seen.has(k)) continue; if (pathAt(tileAt(g, nx, ny), nz)!.queue) { next = [nx, ny, nz]; break; } } if (!next) break; seen.add(nkey(next[0], next[1], next[2])); line.push(next); [cx, cy, cz] = next; }
  for (const [x, y, z] of line) { const p = pathAt(tileAt(g, x, y), z)!; if (p.queue) p.rideId = r.id; }
  return line;
}
/** RCT's GuestPickRideToGoOn: of the rides a guest can see (within 10 tiles, plus any with excitement 8 or more; every
 *  ride with a park map) that they have not been on yet and would go on, the most exciting one. */
function pickRide(g: GameState, gu: Guest) {
  if (gu.state !== 'walking' || gu.headingTo !== null || gu.flags.leaving || gu.items.food || gu.items.drink) return;
  let best: Ride | null = null;
  for (const r of g.rides) {
    const d = RIDE_BY_KEY[r.type]; if (d.kind === 'stall' || !r.entrance || !r.ratings || gu.ridden?.includes(r.id)) continue;
    if (!gu.items.map && r.ratings.e < 800 && !near(r, gu.tx, gu.ty, 10)) continue;
    if (best && r.ratings.e <= best.ratings!.e) continue;
    if (queueFull(g, r) || !wantsRide(g, gu, r, false)) continue;
    best = r;
  }
  if (!best) return; const line = queueLine(g, best); if (!line.length) return;
  gu.headingTo = best.id; aimAt(gu, line[line.length - 1]);
}
/** Any part of the ride (its area, entrance or exit; a coaster's track) within n tiles. */
function near(r: Ride, x: number, y: number, n: number): boolean {
  const d = RIDE_BY_KEY[r.type]; const box = (x0: number, y0: number, x1: number, y1: number) => x >= x0 - n && x <= x1 + n && y >= y0 - n && y <= y1 + n;
  if (box(r.x, r.y, r.x + d.size - 1, r.y + d.size - 1)) return true; if (r.entrance && box(r.entrance.x, r.entrance.y, r.entrance.x, r.entrance.y)) return true; if (r.exit && box(r.exit.x, r.exit.y, r.exit.x, r.exit.y)) return true;
  if (d.kind === 'coaster') for (const p of r.pieces) if (box(p.x, p.y, p.x, p.y)) return true;
  return false;
}
const queueFull = (g: GameState, r: Ride) => r.queue.length >= Math.max(3, queueLine(g, r).length * 3);
/** The original's shouldGoOnRide: thinking about a ride (atQueue false) or standing at its queue (true). A guest who
 *  already set off for this ride (heading) only checks it is not wildly intense. */
function wantsRide(g: GameState, gu: Guest, r: Ride, atQueue: boolean, heading = false): boolean {
  const d = RIDE_BY_KEY[r.type];
  const refuse = (t?: string, hurt = true) => { if (atQueue) { if (t) think(gu, t, r.name); if (hurt) { r.popularity = Math.max(0, r.popularity - (r.popularity >> 3)); if (gu.happinessTarget >= 64) gu.happinessTarget -= 8; } } return false; };
  if (r.status !== 'open' || r.breakdown) return refuse(atQueue ? 'closed' : undefined, false);
  const freeTransport = d.category === 'transport' && (g.noMoney || r.price === 0);
  if (gu.flags.leaving && !freeTransport) return false;
  if (atQueue && queueFull(g, r)) return refuse('queue_long', false);
  if (freeTransport) return true;   // RCT: a free ride round the park is for everyone
  if (r.id === gu.prevRide) return false;
  if (!g.noMoney && r.price > gu.cash) return refuse(gu.cash <= 0 ? 'spent_money' : 'cant_afford', false);
  if (r.crashes > 0 && (r as any).lastCrash && g.tick - (r as any).lastCrash < 20000 && gu.happiness < 225) return refuse('not_safe');
  const rt = r.ratings;
  if (rt) {
    if (heading) { if (rt.i > 1000) return refuse('too_intense'); }
    else {
      const raining = g.weather.kind >= 3; const dry = !!d.sheltered || (gu.items.umbrella && rand(g) < 0.5);
      if (raining && !dry) return refuse('not_while_raining');
      if (!raining) {   // in the rain a ride under cover skips the intensity checks: anywhere dry will do
        const maxI = Math.min(gu.intMax * 100, 1000) + gu.happiness, minI = gu.intMin * 100 - gu.happiness;
        if (rt.i < minI && d.category !== 'transport') return refuse('more_thrilling');   // a train ride round the park is for everyone
        if (rt.i > maxI) return refuse('too_intense');
        if (rt.n > NAUSEA_MAX[gu.nauseaTol] + gu.happiness) return refuse('sickening');
        if (rt.n >= 140 && gu.nausea > 160) return refuse(undefined, false);
      }
    }
  } else if (d.kind === 'coaster' && rand(g) < 0.9) return refuse(undefined, false);   // not yet tested: most guests wait for the ratings
  if (!g.noMoney && r.value > 0) {
    const limit = gu.flags.paidEntry ? r.value / 4 : r.value;
    if (r.price > limit * 2) { if (atQueue) { think(gu, 'bad_value', r.name); r.thoughtBad++; if (gu.happinessTarget >= 60) gu.happinessTarget -= 16; } return false; }
    if (atQueue && r.price <= limit / 2 && !gu.flags.paidEntry) think(gu, 'good_value', r.name);
  }
  return true;
}
function arriveAtRide(g: GameState, gu: Guest, r: Ride, checked = false): boolean {
  if (!checked && !wantsRide(g, gu, r, true, true)) return false;
  r.popularity = Math.min(255, r.popularity + ((255 - r.popularity) >> 3));
  gu.state = 'queuing'; gu.rideId = r.id; gu.queueTime = 0; r.queue.push(gu.id); gu.route = null; gu.dest = null; return true;
}
function leaveQueue(g: GameState, gu: Guest) { const r = rideById(g, gu.rideId); if (r) r.queue = r.queue.filter(id => id !== gu.id); gu.rideId = null; gu.state = 'walking'; gu.route = null; gu.dest = null; }
function queuing(g: GameState, gu: Guest) {
  const r = rideById(g, gu.rideId); if (!r || r.status !== 'open') { if (r) think(gu, 'closed', r.name); leaveQueue(g, gu); return; }
  const idx = r.queue.indexOf(gu.id); if (idx < 0) { gu.state = 'walking'; gu.rideId = null; return; }
  gu.queueTime++; gu.walkPhase = 0;
  // stand in line
  const line = queueLine(g, r); if (line.length) { const ti = Math.min(line.length - 1, Math.floor(idx / 3)); const [lx, ly] = line[ti]; const nxt = line[Math.min(line.length - 1, ti + 1)]; const f = (idx % 3) * 0.3; gu.x = lx + 0.5 + (nxt[0] - lx) * f; gu.y = ly + 0.5 + (nxt[1] - ly) * f; gu.tx = lx; gu.ty = ly; gu.pz = line[ti][2]; gu.z = walkZ(g, lx, ly, 0.5, 0.5, gu.pz); }
  if (gu.queueTime === 2000 && gu.items.food && gu.eatTimer === 0) gu.eatTimer = 300;
  if (gu.queueTime === 3500) think(gu, 'waiting', r.name);
  if (gu.queueTime >= 4300 && gu.happiness <= 65 && rand(g) < 0.03) { leaveQueue(g, gu); think(gu, 'queue_long', r.name); return; }
  if (r.breakdown) { if (gu.queueTime > 1200 && rand(g) < 0.01) { think(gu, 'broken', r.name); leaveQueue(g, gu); } return; }
  if (idx !== 0) return;
  // board when the ride is loading
  const d = RIDE_BY_KEY[r.type];
  if (d.kind === 'coaster') { const tr = r.trains.find(t => t.state === 'station'); const seats = (t: { cars: number }) => t.cars * (d.coaster?.seats ?? 4); if (!tr || tr.riders.length >= seats(tr)) return; tr.riders.push(gu.id); }
  else { if (r.running || r.riders.length >= d.capacity) return; r.riders.push(gu.id); }
  r.queue.shift(); gu.state = 'riding'; gu.x = r.x + d.size / 2; gu.y = r.y + d.size / 2;
  if (!g.noMoney && r.price) { gu.cash -= r.price; gu.spent += r.price; r.income += r.price; r.incomeHist[0] = (r.incomeHist[0] || 0) + r.price; earn(g, r.price, Cat.RideTickets); }
  gu.boardTick = g.tick;
}
function leaveRide(g: GameState, gu: Guest) {
  const r = rideById(g, gu.rideId); gu.state = 'walking'; gu.rideId = null; gu.route = null; gu.dest = null;
  if (!r) return; const d = RIDE_BY_KEY[r.type];
  const ex = r.exit ?? r.entrance; if (ex) { const [fx, fy] = frontTile(r, ex); gu.x = fx + 0.5; gu.y = fy + 0.5; gu.tx = fx; gu.ty = fy; }
  gu.ridesTaken++; gu.prevRide = r.id; gu.onRide = 0; if (!(gu.ridden ??= []).includes(r.id)) gu.ridden.push(r.id);
  // satisfaction (-140..105) and nausea growth, like the original
  let sat = 0; const q = gu.queueTime; sat += q >= 4500 ? -35 : q >= 2250 ? -10 : q <= 750 ? 10 : 0;
  if (r.ratings) {
    const i = r.ratings.i / 100; sat += i >= gu.intMin && i <= gu.intMax ? 35 : (i < gu.intMin - 1 || i > gu.intMax + 1) ? -35 : 10;
    const n = r.ratings.n; sat += n <= NAUSEA_MAX[gu.nauseaTol] / 2 ? 30 : n <= NAUSEA_MAX[gu.nauseaTol] ? 10 : -35;
    sat += Math.min(40, r.ratings.e / 20);
    const mult = clamp(256 - gu.happinessTarget, 64, 200); const gen = (r.ratings.n * mult) / 512; const adj = ((gen * Math.max(128, gu.hunger)) / 128) * 2; gu.nauseaTarget = Math.min(255, gu.nauseaTarget + (adj >> gu.nauseaTol));
  }
  if (!g.noMoney && r.value > 0) { if (r.price <= r.value / 2) sat += 20; else if (r.price > r.value * 2) sat -= 30; }
  if (d.category === 'water' && g.weather.temp >= 24) sat += 15;   // a soaking on a hot day
  if (d.category === 'transport') { gu.energyTarget = Math.min(135, gu.energyTarget + 12); if (gu.energy < 90) sat += 10; }   // a sit-down for tired legs
  gu.happinessTarget = clamp(gu.happinessTarget + sat, 0, 255);
  r.satisfaction = Math.round((r.satisfaction * 19 + clamp(sat + 140, 0, 255)) / 20);
  // RCT's onExitRide: the mood lands at once; a really good ride is 'great', a favourite, maybe worth another go,
  // and very happy guests grow braver
  gu.happiness = gu.happinessTarget; gu.nausea = gu.nauseaTarget;
  if (sat >= 40 && gu.happiness >= 160) gu.favourite = r.id;
  const rt = r.ratings, mild = !!rt && rt.i <= 1000;
  if (gu.happiness >= 215 && gu.nausea <= 120 && mild) { think(gu, 'great', r.name); r.thoughtGood++; }
  else if (sat < 0 && rand(g) < 0.5) think(gu, 'sickening', r.name);
  if (gu.happiness >= 200 && randInt(g, 256) >= (gu.intMin | (gu.intMax << 4)) && gu.intMax < 15) gu.intMax++;
  const again = RCT_RIDES[RIDE_BY_KEY[r.type].rct ?? RIDE_BY_KEY[r.type].coaster?.rct ?? '']?.flags.includes('guestsWillRideAgain');
  if (again && mild && gu.happiness >= 180 && gu.energy >= 100 && gu.nausea <= 160 && gu.hunger >= 30 && gu.thirst >= 20 && gu.toilet <= 170) {
    const k = randInt(g, 256); if (k > 128 || (gu.ridesTaken <= 7 && k <= 64)) { const line = queueLine(g, r); if (line.length) { gu.headingTo = r.id; gu.prevRide = null; aimAt(gu, line[line.length - 1]); } }
  }
  // on-ride photo
  if (d.kind === 'coaster' && r.pieces.some(p => p.type === 'photo') && !g.noMoney && r.price2 <= gu.cash && gu.happiness > 150 && rand(g) < 0.35) { gu.cash -= r.price2; gu.spent += r.price2; r.income += r.price2; r.incomeHist[0] = (r.incomeHist[0] || 0) + r.price2; earn(g, r.price2, Cat.ShopSales); spend(g, 20, Cat.ShopStock); gu.items.photo = true; }
}

// ---------- stalls ----------
function arriveAtStall(g: GameState, gu: Guest, r: Ride): boolean {
  const d = RIDE_BY_KEY[r.type]; const want = gu.want as string;
  if (d.facility === 'toilet') { if (!g.noMoney && r.price > gu.cash) return false; gu.state = 'buying'; gu.sitTimer = 300; gu.rideId = r.id; return true; }
  if (d.facility === 'firstaid') { gu.state = 'buying'; gu.sitTimer = 600; gu.rideId = r.id; return true; }
  if (d.facility === 'cash') { gu.state = 'buying'; gu.sitTimer = 160; gu.rideId = r.id; return true; }
  const item = want === 'umbrella' ? d.item2 : d.item; if (!item) return false;
  const price = want === 'umbrella' ? r.price2 : r.price; const cost = want === 'umbrella' ? (d.item2Cost ?? 0) : (d.itemCost ?? 0);
  if (!g.noMoney) {
    if (price > gu.cash) { think(gu, gu.cash === 0 ? 'spent_money' : 'cant_afford', r.name); return false; }
    const value = itemValue(g, item);
    if (price > value) { let gap = price - value; if (gu.happiness >= 128) gap /= 2; if (gu.happiness >= 180) gap /= 2; if (gap / 25 > randInt(g, 8)) { think(gu, 'bad_value', r.name); r.thoughtBad++; return false; } }
    if (price <= value / 2 && rand(g) < 0.3) think(gu, 'good_value', r.name);
    gu.cash -= price; gu.spent += price;
    const food = !['balloon', 'hat', 'map', 'umbrella'].includes(item);
    earn(g, price, food ? Cat.FoodSales : Cat.ShopSales); spend(g, cost, food ? Cat.FoodStock : Cat.ShopStock);
    r.income += price - cost; r.incomeHist[0] = (r.incomeHist[0] || 0) + price - cost;
  }
  r.customers++; r.recent[0] = (r.recent[0] || 0) + 1;
  if (item === 'balloon') { gu.items.balloon = randInt(g, 12); think(gu, 'bought', 'balloon'); gu.happinessTarget = Math.min(255, gu.happinessTarget + 8); }
  else if (item === 'hat') { gu.items.hat = true; gu.happinessTarget = Math.min(255, gu.happinessTarget + 6); }
  else if (item === 'map') { gu.items.map = true; gu.lostTimer = 0; }
  else if (item === 'umbrella') { gu.items.umbrella = true; gu.happinessTarget = Math.min(255, gu.happinessTarget + 6); }
  else if (DRINKS.has(item)) { gu.items.drink = item; gu.eatTimer = EAT_TICKS[item] ?? 400; gu.thirst = Math.min(255, gu.thirst + 130); gu.happinessTarget = Math.min(255, gu.happinessTarget + 4); }
  else { gu.items.food = item; gu.eatTimer = EAT_TICKS[item] ?? 500; gu.hunger = Math.min(255, gu.hunger + 140); gu.thirst = Math.max(0, gu.thirst - 10); gu.toilet = Math.min(255, gu.toilet + 10); gu.happinessTarget = Math.min(255, gu.happinessTarget + 4); }
  gu.state = 'buying'; gu.sitTimer = 60; gu.rideId = null; return true;
}
/** What a guest thinks an item is worth right now (cents): ice cream and drinks are worth more on a hot day, coffee on
 *  a cold one, an umbrella in the rain. A price above it puts guests off, more so the further above. */
export function itemValue(g: GameState, item: string): number {
  let value = ITEM_VALUE[item] ?? 100; if (g.weather.temp >= 24 && (item === 'iceCream' || DRINKS.has(item))) value *= 1.6; if (g.weather.temp <= 10 && item === 'coffee') value *= 1.6; if (g.weather.kind >= 3 && item === 'umbrella') value *= 2;
  return value;
}
/** A price guests are happy to pay: a ride's value (they pay up to twice it), or what an item is worth today. Rounded to 10 cents. */
export function fairPrice(g: GameState, r: Ride, second = false): number {
  const d = RIDE_BY_KEY[r.type]; const round = (c: number) => Math.max(0, Math.round(c / 10) * 10);
  if (d.kind === 'stall') { const item = second ? d.item2 : d.item; if (d.facility === 'toilet') return 20; return item ? round(itemValue(g, item)) : r.price; }
  if (second) return 300; if (r.value <= 0) return r.price; return round(g.finance.entranceFee > 0 ? r.value / 4 : r.value);
}
function finishBuying(g: GameState, gu: Guest) {
  const r = rideById(g, gu.rideId); gu.state = 'walking';
  if (r) { const d = RIDE_BY_KEY[r.type]; if (d.facility === 'toilet') { gu.toilet = 0; if (!g.noMoney && r.price) { gu.cash -= r.price; gu.spent += r.price; r.income += r.price; r.incomeHist[0] = (r.incomeHist[0] || 0) + r.price; earn(g, r.price, Cat.ShopSales); } r.customers++; r.recent[0] = (r.recent[0] || 0) + 1; }
    if (d.facility === 'firstaid') { gu.nausea = 0; gu.nauseaTarget = 0; r.customers++; }
    if (d.facility === 'cash') { gu.cash += 5000; gu.flags.atm = (gu.flags.atm ?? 0) + 1; r.customers++; r.recent[0] = (r.recent[0] || 0) + 1; } }
  gu.rideId = null;
}
function finishEating(g: GameState, gu: Guest) {
  gu.items.food = null; gu.items.drink = null;
  const t = tileAt(g, gu.tx, gu.ty); const p = pathNear(t, gu.pz ?? gu.z); if (!t || !p) return;
  // a bin on this path or the ones it joins takes the wrapper; otherwise it becomes litter
  const bins: PathTile[] = []; if (p.adds.bin !== undefined && p.adds.bin < 8) bins.push(p);
  for (let d = 0; d < 4; d++) { const q = pathLink(g, gu.tx, gu.ty, p, d as Dir); if (q && q.adds.bin !== undefined && q.adds.bin < 8) bins.push(q); }
  if (bins.length) { bins[0].adds.bin = (bins[0].adds.bin ?? 0) + 1; return; }
  if (rand(g) < 0.75) { t.litter++; if (t.litter === 1) t.litterAge = 0; }
}
