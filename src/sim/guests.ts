// Guests: arrive at the entrance, walk the paths, get hungry, pick rides that suit them, queue, ride, buy things, think, and leave.
// The rules follow the original closely (intensity windows, nausea tolerance, value checks, the 128-tick need updates).
import { DX, DY, clamp, key, type Dir, type GameState, type Guest, type Ride, type Tile } from './types';
import { tileAt, pathNeighbours, findRoute, walkZ } from './map';
import { rand, randInt, pick } from './rng';
import { RIDE_BY_KEY } from './rides';
import { earn, spend, Cat } from './finance';
import { totalRideValueForMoney } from './park';
import { campaignSpawnBonus } from './marketing';
import { walk } from './staff';
import { news } from './game';

const NAUSEA_MAX = [300, 600, 800, 1000];
const ITEM_VALUE: Record<string, number> = { burger: 190, chips: 160, pizza: 210, hotDog: 170, iceCream: 100, candyfloss: 90, drink: 120, coffee: 110, lemonade: 110, balloon: 140, hat: 270, map: 70, umbrella: 350 };
const EAT_TICKS: Record<string, number> = { burger: 600, chips: 480, pizza: 600, hotDog: 530, iceCream: 240, candyfloss: 200, drink: 400, coffee: 360, lemonade: 460 };
const DRINKS = new Set(['drink', 'coffee', 'lemonade']);

// ---------- spawning ----------
export function spawnGuests(g: GameState) {
  if (!g.parkOpen || g.guests.length > 1800) return;
  let p = 50 + clamp(g.rating - 200, 0, 650);
  const inPark = g.guestsInPark + g.guests.filter(x => x.state === 'entering').length;
  if (inPark > g.suggestedMax) { p >>= 2; if (g.difficultGuests) p >>= 2; }
  if (!g.noMoney && g.finance.entranceFee > 0) { const v = totalRideValueForMoney(g); if (g.finance.entranceFee > v) p >>= 2; if (g.finance.entranceFee / 2 > v) p >>= 2; }
  for (const a of g.awards) p += (a.type === 0 || a.type === 5 || a.type === 9 || a.type === 11 || a.type === 14) ? -(p >> 2) : (p >> 2);
  p += campaignSpawnBonus(g);
  if (randInt(g, 65536) < p) {
    if (g.difficultGuests && inPark > g.suggestedMax + 150) return;
    g.guests.push(makeGuest(g));
  }
}
function makeGuest(g: GameState): Guest {
  const id = g.nextGuestId++;
  const d = () => randInt(g, 32) - 15;
  // like the original: the high end is 3..10, the low end is min(high, 7) - 3, so most guests happily ride gentle rides
  const intMax = 3 + randInt(g, 8); const intMin = Math.max(0, Math.min(intMax, 7) - 4);
  const tolRoll = randInt(g, 12); const nauseaTol = (tolRoll < 1 ? 0 : tolRoll < 3 ? 1 : tolRoll < 6 ? 2 : 3) as 0 | 1 | 2 | 3;
  const cash = g.noMoney ? 0 : Math.max(0, 5000 + [-1000, 0, 1000, 2000][randInt(g, 4)] + randInt(g, 1000));
  return { id, name: `Guest ${id}`, x: g.spawn.x + 0.5, y: g.spawn.y + 0.5, z: 0, dir: 3, tx: g.spawn.x, ty: g.spawn.y, state: 'entering',
    happiness: 128 + d(), happinessTarget: 128 + d(), energy: 65 + randInt(g, 64), energyTarget: 128, hunger: 200 + d(), thirst: 200 + d(), toilet: randInt(g, 40), nausea: 0, nauseaTarget: 0, nauseaTol, intMin, intMax,
    cash, spent: 0, items: { balloon: null, umbrella: rand(g) < 0.08, map: false, hat: false, food: null, drink: null, photo: false, souvenir: false }, eatTimer: 0, thoughts: [], entered: g.tick, ridesTaken: 0, prevRide: null, favourite: null, headingTo: null,
    dest: { x: g.entrance.x + (rand(g) < 0.5 ? 0 : 1), y: g.entrance.y - 2 }, route: null, lostTimer: 0, queueTime: 0, rideId: null, sitTimer: 0, watchTimer: 0, shirt: randInt(g, 12), trousers: randInt(g, 4), hair: randInt(g, 5), litterTimer: 0, angry: 0, vouchers: 0,
    flags: { leaving: false, paidEntry: false, tracked: false, sick: false, lost: false, crowded: false }, walkPhase: rand(g) * 4 };
}

export function think(gu: Guest, t: string, arg?: string) {
  if (gu.thoughts.slice(0, 3).some(x => x.t === t && x.arg === arg)) return;
  gu.thoughts.unshift({ t, arg, age: 0 }); if (gu.thoughts.length > 6) gu.thoughts.length = 6;
}

// ---------- main update ----------
export function updateGuests(g: GameState) {
  const tickPhase = g.tick & 127;
  let removed = false;
  for (const gu of g.guests) {
    if (gu.state === 'left') { removed = true; continue; }
    if ((gu.id & 127) === tickPhase) slowUpdate(g, gu);
    // smooth drift toward targets
    if ((g.tick & 7) === 0) {
      gu.happiness += gu.happiness < gu.happinessTarget ? 1 : gu.happiness > gu.happinessTarget ? -1 : 0;
      gu.nausea += gu.nausea < gu.nauseaTarget ? 1 : gu.nausea > gu.nauseaTarget ? -1 : 0;
      gu.energy += gu.energy < gu.energyTarget ? 1 : gu.energy > gu.energyTarget ? -1 : 0;
      gu.energy = clamp(gu.energy, 0, 255);
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
    }
  }
  if (removed) g.guests = g.guests.filter(x => x.state !== 'left');
}

/** The original's 128-tick update: needs drift, thoughts, vomiting, leaving decisions. */
function slowUpdate(g: GameState, gu: Guest) {
  for (const t of gu.thoughts) t.age++; gu.thoughts = gu.thoughts.filter(t => t.age < 40);
  if (gu.state === 'riding' || gu.state === 'entering') return;
  gu.hunger = Math.max(0, gu.hunger - 2); gu.thirst = Math.max(0, gu.thirst - (g.weather.temp >= 21 ? 3 : 2)); gu.toilet = Math.min(255, gu.toilet + 2);
  if (gu.state === 'walking' || gu.state === 'queuing') gu.energyTarget = Math.max(32, gu.energyTarget - 1);
  if (gu.state === 'sitting') { gu.energyTarget = Math.min(135, gu.energyTarget + 5); gu.thirst = Math.max(0, gu.thirst - 2); gu.nauseaTarget = Math.max(0, gu.nauseaTarget - 6); }
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
  const t = tileAt(g, gu.tx, gu.ty);
  if (t?.path) {
    if (t.litter + t.vomit >= 3) { think(gu, t.vomit ? 'disgusting' : 'litter'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 2); }
    else if (rand(g) < 0.04) { let scen = 0; for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) { const tt = tileAt(g, gu.tx + xx, gu.ty + yy); if (tt?.scenery) scen++; } if (scen >= 4) { think(gu, 'scenery'); gu.happinessTarget = Math.min(255, gu.happinessTarget + 2); } else if (scen === 0 && rand(g) < 0.1 && g.guestsInPark > 30) think(gu, 'clean'); }
    const crowd = g.guests.filter(o => o.tx === gu.tx && o.ty === gu.ty && o.state === 'walking').length; if (crowd >= 8) { think(gu, 'crowded'); gu.happinessTarget = Math.max(0, gu.happinessTarget - 1); }
  }
  // vomiting
  if (gu.nauseaTarget >= 128 && randInt(g, 256) < (gu.nausea - 128) / 2 && gu.state !== 'queuing') { if (t?.path) { t.vomit++; t.litterAge = 0; } gu.nausea = Math.max(0, gu.nausea - 30); gu.nauseaTarget = Math.floor(gu.nauseaTarget / 2); gu.hunger = Math.floor(gu.hunger / 2); g.stats.vomits++; think(gu, 'sick'); }
  // vandalism: unhappy, energetic, nobody watching
  if (gu.happiness < 48 && gu.energy >= 85 && gu.state === 'walking' && t?.path && (t.path.adds.bench || t.path.adds.lamp) && !t.path.broken && rand(g) < 0.05) {
    const guard = g.staff.some(s => s.type === 'security' && Math.abs(s.x - gu.x) < 7 && Math.abs(s.y - gu.y) < 7);
    if (guard) { const s = g.staff.find(s => s.type === 'security' && Math.abs(s.x - gu.x) < 7 && Math.abs(s.y - gu.y) < 7)!; s.stats.vandalsStopped++; }
    else { t.path.broken = true; gu.angry = 16; news(g, 'sad', `A bench was vandalised near ${rideNear(g, gu) ?? 'the entrance'}.`, { kind: 'tile', x: gu.tx, y: gu.ty }); }
  }
  // leaving?
  if (!gu.flags.leaving && gu.state === 'walking') {
    const stays = g.noMoney ? (gu.energy >= 70 && gu.happiness >= 60) : (gu.energy >= 55 && gu.happiness >= 45 && gu.cash >= 500);
    const longVisit = g.tick - gu.entered > 24000 && rand(g) < 0.04;
    if ((!stays && rand(g) < 0.05) || longVisit || !g.parkOpen) startLeaving(g, gu, !g.parkOpen ? 'closed_park' : 'go_home');
  }
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
  gu.state = 'leaving'; gu.dest = { x: g.entrance.x, y: g.entrance.y - 1 }; gu.route = null; gu.lostTimer = 0;
}
function leaving(g: GameState, gu: Guest) {
  if (!gu.dest) { gu.dest = { x: g.entrance.x, y: g.entrance.y - 1 }; gu.route = null; }
  const arrived = walk(g, gu, 1.0);
  if (gu.route === null && gu.dest === null) {
    if (gu.ty >= g.entrance.y - 1) { gu.dest = { x: g.spawn.x, y: g.spawn.y }; gu.route = null; if (gu.ty >= g.spawn.y) { gu.state = 'left'; g.guestsInPark = Math.max(0, g.guestsInPark - 1); } return; }
    // could not route to the exit: lost
    if (arrived) { gu.lostTimer++; if (gu.lostTimer === 2) think(gu, 'cant_find_exit'); if (gu.lostTimer > 1) gu.happinessTarget = Math.max(0, gu.happinessTarget - 2); wanderStep(g, gu); }
  }
}

// ---------- walking and deciding ----------
function walking(g: GameState, gu: Guest) {
  const arrived = walk(g, gu, 0.95 + (gu.energy / 255) * 0.3);
  if (!arrived) return;
  // arrived (or had nowhere to go): did we reach something?
  const t = tileAt(g, gu.tx, gu.ty);
  if (!t?.path) { snapToPath(g, gu); return; }
  if (gu.headingTo !== null) { const r = g.rides.find(x => x.id === gu.headingTo); gu.headingTo = null; if (r && arriveAtRide(g, gu, r)) return; }
  if (gu.rideId !== null && gu.state === 'walking') { const r = g.rides.find(x => x.id === gu.rideId); gu.rideId = null; if (r && RIDE_BY_KEY[r.type].kind === 'stall' && arriveAtStall(g, gu, r)) return; }
  // sit down?
  if (t.path.adds.bench && !t.path.broken && (gu.energy <= 60 || (gu.items.food && gu.hunger < 128)) && rand(g) < 0.5) { gu.state = 'sitting'; gu.sitTimer = Math.min(2000, (129 - gu.energy) * 16 + 50); gu.energyTarget = 135; return; }
  if (gu.lostTimer > 0 && rand(g) < 0.7) { wanderStep(g, gu); return; }
  decide(g, gu);
}
function snapToPath(g: GameState, gu: Guest) {
  for (let r = 1; r < 5; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const t = tileAt(g, gu.tx + xx, gu.ty + yy); if (t?.path && !t.path.queue) { gu.x = gu.tx + xx + 0.5; gu.y = gu.ty + yy + 0.5; gu.tx += xx; gu.ty += yy; gu.route = null; gu.dest = null; return; } }
  startLeaving(g, gu, 'lost');
}
function wanderStep(g: GameState, gu: Guest) {
  const opts = pathNeighbours(g, gu.tx, gu.ty).filter(([x, y]) => !tileAt(g, x, y)!.path!.queue);
  if (!opts.length) { snapToPath(g, gu); return; }
  const straight = opts.find(([x, y]) => x === gu.tx + DX[gu.dir] && y === gu.ty + DY[gu.dir]);
  const back = opts.filter(([x, y]) => !(x === gu.tx - DX[gu.dir] && y === gu.ty - DY[gu.dir]));
  const [x, y] = straight && rand(g) < 0.55 ? straight : (back.length ? pick(g, back) : opts[0]);
  gu.dest = { x, y }; gu.route = [key(x, y)];
}
function decide(g: GameState, gu: Guest) {
  // needs first
  if (gu.toilet >= 160 && goToFacility(g, gu, 'toilet')) return;
  if (gu.nausea >= 200 && goToFacility(g, gu, 'firstaid')) return;
  if (gu.hunger <= 60 && !gu.items.food && goToStall(g, gu, 'food')) return;
  if (gu.thirst <= 60 && !gu.items.drink && goToStall(g, gu, 'drink')) return;
  if (gu.energy <= 60 && rand(g) < 0.5 && goToBench(g, gu)) return;
  if (g.weather.kind >= 3 && !gu.items.umbrella && rand(g) < 0.2 && goToStall(g, gu, 'umbrella')) return;
  if (gu.lostTimer === 0 && rand(g) < 0.06 && !gu.items.map && goToStall(g, gu, 'map')) return;
  if (gu.happiness > 150 && rand(g) < 0.05 && gu.items.balloon === null && goToStall(g, gu, 'balloon')) return;
  // a ride?
  if (rand(g) < (gu.items.map ? 0.5 : 0.3) && chooseRide(g, gu)) return;
  wanderStep(g, gu);
}
function frontTile(r: Ride, e: { x: number; y: number; dir: Dir }): [number, number] { return [e.x - DX[e.dir], e.y - DY[e.dir]]; }
function stallFront(r: Ride): [number, number] { return [r.x + DX[r.rot], r.y + DY[r.rot]]; }
function goToStall(g: GameState, gu: Guest, want: 'food' | 'drink' | 'umbrella' | 'map' | 'balloon'): boolean {
  let best: Ride | null = null, bd = 99;
  for (const r of g.rides) { const d = RIDE_BY_KEY[r.type]; if (d.kind !== 'stall' || r.status !== 'open' || !d.item) continue;
    const sells = want === 'food' ? (!DRINKS.has(d.item) && !['balloon', 'hat', 'map'].includes(d.item)) : want === 'drink' ? DRINKS.has(d.item) : want === 'umbrella' ? d.item2 === 'umbrella' : want === 'map' ? d.item === 'map' : d.item === 'balloon';
    if (!sells) continue; const [fx, fy] = stallFront(r); const ft = tileAt(g, fx, fy); if (!ft?.path) continue;
    const dist = Math.abs(fx - gu.x) + Math.abs(fy - gu.y); if (dist < bd && dist < (gu.items.map ? 60 : 22)) { bd = dist; best = r; } }
  if (!best) return false; const [fx, fy] = stallFront(best); const route = findRoute(g, gu.tx, gu.ty, fx, fy, 2500); if (!route) return false;
  gu.dest = { x: fx, y: fy }; gu.route = route; gu.rideId = best.id; (gu as any).want = want; return true;
}
function goToFacility(g: GameState, gu: Guest, kind: 'toilet' | 'firstaid'): boolean {
  let best: Ride | null = null, bd = 99;
  for (const r of g.rides) { const d = RIDE_BY_KEY[r.type]; if (d.facility !== kind || r.status !== 'open') continue; const [fx, fy] = stallFront(r); if (!tileAt(g, fx, fy)?.path) continue; const dist = Math.abs(fx - gu.x) + Math.abs(fy - gu.y); if (dist < bd && dist < 40) { bd = dist; best = r; } }
  if (!best) return false; const [fx, fy] = stallFront(best); const route = findRoute(g, gu.tx, gu.ty, fx, fy, 2500); if (!route) return false;
  gu.dest = { x: fx, y: fy }; gu.route = route; gu.rideId = best.id; (gu as any).want = kind; return true;
}
function goToBench(g: GameState, gu: Guest): boolean {
  for (let r = 1; r < 8; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const t = tileAt(g, gu.tx + xx, gu.ty + yy); if (t?.path?.adds.bench && !t.path.broken) { const route = findRoute(g, gu.tx, gu.ty, gu.tx + xx, gu.ty + yy, 800); if (route) { gu.dest = { x: gu.tx + xx, y: gu.ty + yy }; gu.route = route; return true; } } }
  return false;
}
/** Queue tiles from the entrance hut outward (nearest the hut first). */
export function queueLine(g: GameState, r: Ride): [number, number][] {
  if (!r.entrance) return []; const [fx, fy] = frontTile(r, r.entrance); const ft = tileAt(g, fx, fy); if (!ft?.path) return [];
  if (!ft.path.queue) return [[fx, fy]];
  const line: [number, number][] = [[fx, fy]]; const seen = new Set<number>([key(fx, fy), key(r.entrance.x, r.entrance.y)]);
  let cx = fx, cy = fy;
  for (let i = 0; i < 60; i++) { let next: [number, number] | null = null; for (const [nx, ny] of pathNeighbours(g, cx, cy)) { const k = key(nx, ny); if (seen.has(k)) continue; const nt = tileAt(g, nx, ny)!; if (nt.path!.queue) { next = [nx, ny]; break; } } if (!next) break; seen.add(key(next[0], next[1])); line.push(next); cx = next[0]; cy = next[1]; }
  for (const [x, y] of line) { const t = tileAt(g, x, y)!; if (t.path!.queue) t.path!.rideId = r.id; }
  return line;
}
function chooseRide(g: GameState, gu: Guest): boolean {
  const radius = gu.items.map ? 80 : 14; let best: Ride | null = null, bd = 999;
  for (const r of g.rides) { const d = RIDE_BY_KEY[r.type]; if (d.kind === 'stall' || r.status !== 'open' || r.breakdown || !r.entrance) continue;
    const dist = Math.abs(r.entrance.x - gu.x) + Math.abs(r.entrance.y - gu.y); if (dist > radius || dist >= bd) continue;
    if (!wantsRide(g, gu, r, false)) continue; bd = dist; best = r; }
  if (!best) return false;
  const line = queueLine(g, best); if (!line.length) return false; const end = line[line.length - 1];
  const route = findRoute(g, gu.tx, gu.ty, end[0], end[1], 3000); if (!route) return false;
  gu.dest = { x: end[0], y: end[1] }; gu.route = route; gu.headingTo = best.id; return true;
}
/** The original's shouldGoOnRide, in two halves: the quick check when choosing, the full check at the queue. */
function wantsRide(g: GameState, gu: Guest, r: Ride, atQueue: boolean): boolean {
  const d = RIDE_BY_KEY[r.type]; const refuse = (t?: string) => { if (t && atQueue) think(gu, t, r.name); if (atQueue) { r.popularity = Math.max(0, r.popularity - (r.popularity >> 3)); gu.happinessTarget = Math.max(0, gu.happinessTarget - 8); } return false; };
  if (r.status !== 'open' || r.breakdown) return refuse(atQueue ? 'closed' : undefined);
  if (gu.flags.leaving) return false;
  if (r.id === gu.prevRide && rand(g) < 0.8) return false;
  if (!g.noMoney && r.price > gu.cash) return refuse(gu.cash === 0 ? 'spent_money' : 'cant_afford');
  if (r.crashes > 0 && (r as any).lastCrash && g.tick - (r as any).lastCrash < 20000 && gu.happiness < 225) return refuse('not_safe');
  if (g.weather.kind >= 3 && !d.sheltered && !gu.items.umbrella && rand(g) < 0.6) return false;
  const rt = r.ratings; if (rt) {
    const maxI = Math.min(gu.intMax * 100, 1000) + gu.happiness, minI = gu.intMin * 100 - gu.happiness;
    if (rt.i < minI) return refuse('more_thrilling'); if (rt.i > maxI) return refuse('too_intense');
    const maxN = NAUSEA_MAX[gu.nauseaTol] + gu.happiness; if (rt.n > maxN) return refuse('sickening');
    if (rt.n >= 140 && gu.nausea > 160) return false;
  }
  if (atQueue) {
    const line = queueLine(g, r); const cap = Math.max(3, line.length * 3); if (r.queue.length >= cap) return refuse('queue_long');
    if (!g.noMoney && r.value > 0) { let limit = r.value * 2; if (gu.flags.paidEntry) limit /= 4; if (r.price > limit) { think(gu, 'bad_value', r.name); r.thoughtBad++; return refuse(); } if (r.price <= r.value / 2 && rand(g) < 0.3) think(gu, 'good_value', r.name); }
  }
  return true;
}
function arriveAtRide(g: GameState, gu: Guest, r: Ride): boolean {
  if (!wantsRide(g, gu, r, true)) return false;
  r.popularity = Math.min(255, r.popularity + ((255 - r.popularity) >> 3));
  gu.state = 'queuing'; gu.rideId = r.id; gu.queueTime = 0; r.queue.push(gu.id); gu.route = null; gu.dest = null; return true;
}
function leaveQueue(g: GameState, gu: Guest) { const r = g.rides.find(x => x.id === gu.rideId); if (r) r.queue = r.queue.filter(id => id !== gu.id); gu.rideId = null; gu.state = 'walking'; gu.route = null; gu.dest = null; }
function queuing(g: GameState, gu: Guest) {
  const r = g.rides.find(x => x.id === gu.rideId); if (!r || r.status !== 'open') { if (r) think(gu, 'closed', r.name); leaveQueue(g, gu); return; }
  const idx = r.queue.indexOf(gu.id); if (idx < 0) { gu.state = 'walking'; gu.rideId = null; return; }
  gu.queueTime++; gu.walkPhase = 0;
  // stand in line
  const line = queueLine(g, r); if (line.length) { const ti = Math.min(line.length - 1, Math.floor(idx / 3)); const [lx, ly] = line[ti]; const nxt = line[Math.min(line.length - 1, ti + 1)]; const f = (idx % 3) * 0.3; gu.x = lx + 0.5 + (nxt[0] - lx) * f; gu.y = ly + 0.5 + (nxt[1] - ly) * f; gu.tx = lx; gu.ty = ly; gu.z = walkZ(g, lx, ly, 0.5, 0.5); }
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
  (gu as any).boardTick = g.tick;
}
function leaveRide(g: GameState, gu: Guest) {
  const r = g.rides.find(x => x.id === gu.rideId); gu.state = 'walking'; gu.rideId = null; gu.route = null; gu.dest = null;
  if (!r) return; const d = RIDE_BY_KEY[r.type];
  const ex = r.exit ?? r.entrance; if (ex) { const [fx, fy] = frontTile(r, ex); gu.x = fx + 0.5; gu.y = fy + 0.5; gu.tx = fx; gu.ty = fy; }
  gu.ridesTaken++; gu.prevRide = r.id;
  // satisfaction (-140..105) and nausea growth, like the original
  let sat = 0; const q = gu.queueTime; sat += q >= 4500 ? -35 : q >= 2250 ? -10 : q <= 750 ? 10 : 0;
  if (r.ratings) {
    const i = r.ratings.i / 100; sat += i >= gu.intMin && i <= gu.intMax ? 35 : (i < gu.intMin - 1 || i > gu.intMax + 1) ? -35 : 10;
    const n = r.ratings.n; sat += n <= NAUSEA_MAX[gu.nauseaTol] / 2 ? 30 : n <= NAUSEA_MAX[gu.nauseaTol] ? 10 : -35;
    sat += Math.min(40, r.ratings.e / 20);
    const mult = clamp(256 - gu.happinessTarget, 64, 200); const gen = (r.ratings.n * mult) / 512; const adj = ((gen * Math.max(128, gu.hunger)) / 128) * 2; gu.nauseaTarget = Math.min(255, gu.nauseaTarget + (adj >> gu.nauseaTol));
  }
  if (!g.noMoney && r.value > 0) { if (r.price <= r.value / 2) sat += 20; else if (r.price > r.value * 2) sat -= 30; }
  gu.happinessTarget = clamp(gu.happinessTarget + sat, 0, 255);
  r.satisfaction = Math.round((r.satisfaction * 19 + clamp(sat + 140, 0, 255)) / 20);
  if (sat >= 40) { think(gu, 'great', r.name); r.thoughtGood++; if (gu.happiness >= 160 && gu.happinessTarget >= 160) gu.favourite = r.id; if (rand(g) < 0.3 && gu.intMax < 15 && gu.happiness >= 200) gu.intMax++; }
  else if (sat < 0 && rand(g) < 0.5) think(gu, 'sickening', r.name);
  // on-ride photo
  if (d.kind === 'coaster' && r.pieces.some(p => p.type === 'photo') && !g.noMoney && r.price2 <= gu.cash && gu.happiness > 150 && rand(g) < 0.35) { gu.cash -= r.price2; gu.spent += r.price2; r.income += r.price2; r.incomeHist[0] = (r.incomeHist[0] || 0) + r.price2; earn(g, r.price2, Cat.ShopSales); spend(g, 20, Cat.ShopStock); gu.items.photo = true; }
}

// ---------- stalls ----------
function arriveAtStall(g: GameState, gu: Guest, r: Ride): boolean {
  const d = RIDE_BY_KEY[r.type]; const want = (gu as any).want as string;
  if (d.facility === 'toilet') { if (!g.noMoney && r.price > gu.cash) return false; gu.state = 'buying'; gu.sitTimer = 300; gu.rideId = r.id; return true; }
  if (d.facility === 'firstaid') { gu.state = 'buying'; gu.sitTimer = 600; gu.rideId = r.id; return true; }
  const item = want === 'umbrella' ? d.item2 : d.item; if (!item) return false;
  const price = want === 'umbrella' ? r.price2 : r.price; const cost = want === 'umbrella' ? (d.item2Cost ?? 0) : (d.itemCost ?? 0);
  if (!g.noMoney) {
    if (price > gu.cash) { think(gu, gu.cash === 0 ? 'spent_money' : 'cant_afford', r.name); return false; }
    let value = ITEM_VALUE[item] ?? 100; if (g.weather.temp >= 24 && (item === 'iceCream' || DRINKS.has(item))) value *= 1.6; if (g.weather.temp <= 10 && item === 'coffee') value *= 1.6; if (g.weather.kind >= 3 && item === 'umbrella') value *= 2;
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
function finishBuying(g: GameState, gu: Guest) {
  const r = g.rides.find(x => x.id === gu.rideId); gu.state = 'walking';
  if (r) { const d = RIDE_BY_KEY[r.type]; if (d.facility === 'toilet') { gu.toilet = 0; if (!g.noMoney && r.price) { gu.cash -= r.price; gu.spent += r.price; r.income += r.price; r.incomeHist[0] = (r.incomeHist[0] || 0) + r.price; earn(g, r.price, Cat.ShopSales); } r.customers++; r.recent[0] = (r.recent[0] || 0) + 1; }
    if (d.facility === 'firstaid') { gu.nausea = 0; gu.nauseaTarget = 0; r.customers++; } }
  gu.rideId = null;
}
function finishEating(g: GameState, gu: Guest) {
  gu.items.food = null; gu.items.drink = null;
  const t = tileAt(g, gu.tx, gu.ty); if (!t?.path) return;
  // a bin on this tile or next door takes the wrapper; otherwise it becomes litter
  const bins: Tile[] = []; if (t.path.adds.bin !== undefined && t.path.adds.bin < 8) bins.push(t);
  for (let d = 0; d < 4; d++) { const n = tileAt(g, gu.tx + DX[d], gu.ty + DY[d]); if (n?.path && n.path.adds.bin !== undefined && n.path.adds.bin < 8) bins.push(n); }
  if (bins.length) { bins[0].path!.adds.bin = (bins[0].path!.adds.bin ?? 0) + 1; return; }
  if (rand(g) < 0.75) { t.litter++; if (t.litter === 1) t.litterAge = 0; }
}
