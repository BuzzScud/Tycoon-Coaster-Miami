// The Space set design round, second take: the retro style they picked, at a realistic size next to the guests (tab 1)
// against the first round's size (tab 2), on one real park with riders and a ride kept broken down; same camera.
import * as THREE from 'three';
import { newGame, tick, cmdPath, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece } from '../sim/game';
import { openRide, testRide } from '../sim/ridesim';
import { hireStaff } from '../sim/staff';
import { RIDE_TYPES } from '../sim/rides';
import { TICKS_PER_SEC, type GameState, type Ride } from '../sim/types';
import { HU } from '../three/world';
import { FINE, InkCamera } from './kit';
import { InkView } from './view';
import { SPACE_BY_KEY, drawSpacePiece, type DrawnPiece } from './space';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
type Spot = { key: string; x: number; y: number };

function buildPark(): { g: GameState; broken: Ride; spots: Spot[] } {
  const g = newGame({ name: 'Orbit Park', size: 'medium', cash: 5_000_000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: true, seed: 20261014 });
  for (const r of RIDE_TYPES) if (!g.research.invented.includes(r.key)) g.research.invented.push(r.key);
  const ex = g.entrance.x, ey = g.entrance.y; const h = g.tiles[(ey - 2) * g.w + ex].h;
  for (let y = ey - 30; y <= ey - 2; y++) for (let x = ex - 12; x <= ex + 16; x++) { const t = g.tiles[y * g.w + x]; t.h = h; t.water = false; t.scenery = null; }
  for (let i = 3; i <= 24; i++) cmdPath(g, ex, ey - i, false, 0);
  // flat rides west of the main path: entrance on the east side, exit on the south side, both joined to the path
  const flat = (type: string, rx: number, ry: number) => { cmdPlaceRide(g, type, rx, ry, 0); const r = g.rides[g.rides.length - 1]; cmdPlaceEntrance(g, r.id, rx + 2, ry, false); cmdPlaceEntrance(g, r.id, rx, ry + 2, true);
    for (let x = rx + 3; x < ex; x++) cmdPath(g, x, ry, false, 0); for (let x = rx; x < ex; x++) cmdPath(g, x, ry + 3, false, 0); openRide(g, r); return r; };
  flat('merry_go_round', ex - 5, ey - 9); flat('ferris_wheel', ex - 5, ey - 14); const broken = flat('twist', ex - 5, ey - 19);
  // space rides east of the path, by the Space set
  const one = (type: string, rx: number, ry: number, ent: [number, number], exit: [number, number]) => { cmdPlaceRide(g, type, rx, ry, 0); const r = g.rides[g.rides.length - 1]; cmdPlaceEntrance(g, r.id, ent[0], ent[1], false); cmdPlaceEntrance(g, r.id, exit[0], exit[1], true); openRide(g, r); return r; };
  one('space_rings', ex + 2, ey - 6, [ex + 1, ey - 6], [ex + 2, ey - 5]); cmdPath(g, ex + 1, ey - 5, false, 0);
  one('launched_freefall', ex + 2, ey - 8, [ex + 1, ey - 8], [ex + 2, ey - 9]); cmdPath(g, ex + 1, ey - 9, false, 0);
  cmdPlaceRide(g, 'burger_bar', ex + 1, ey - 12, 2); cmdPlaceRide(g, 'balloon_stall', ex + 1, ey - 11, 2);
  // the wooden coaster, as in the browser test
  const sx = ex + 2, sy = ey - 22; cmdStartCoaster(g, 'wooden_coaster', sx, sy, 0); const c = g.rides[g.rides.length - 1]; const add = (k: string, ch = false) => cmdAddPiece(g, c.id, k, ch, 0);
  add('station'); add('station'); for (let i = 0; i < 4; i++) add('up', true); add('turnR'); add('down'); add('steepDown'); add('flat'); add('flat'); add('turnR'); for (let i = 0; i < 7; i++) add('flat'); add('turnR'); for (let i = 0; i < 4; i++) add('flat'); add('turnR');
  const s0 = c.pieces[0], s1 = c.pieces[1]; cmdPlaceEntrance(g, c.id, s0.x, s0.y - 1, false); cmdPlaceEntrance(g, c.id, s1.x, s1.y - 1, true); for (const xx of [s0.x, s1.x, ex + 1]) cmdPath(g, xx, sy - 2, false, 0); testRide(g, c); openRide(g, c);
  // a walk through the Space set
  for (let x = ex + 1; x <= ex + 13; x++) cmdPath(g, x, ey - 4, false, 2);
  // laid out for the realistic footprints: launch pad and dome 3×3; rocket, radar, satellite, saucer 2×2; the rest 1×1
  const spots: Spot[] = [
    { key: 'space_launchpad', x: ex + 5, y: ey - 10 }, { key: 'space_dome', x: ex + 10, y: ey - 10 }, { key: 'space_rocket', x: ex + 8, y: ey - 7 }, { key: 'space_radar', x: ex + 12, y: ey - 7 },
    { key: 'space_satellite', x: ex + 13, y: ey - 13 }, { key: 'space_saucer', x: ex + 8, y: ey - 13 }, { key: 'space_beacon', x: ex + 4, y: ey - 12 }, { key: 'space_plant', x: ex + 4, y: ey - 7 },
    { key: 'space_plant', x: ex + 14, y: ey - 9 }, { key: 'space_plant', x: ex + 11, y: ey - 12 }, { key: 'space_lamp', x: ex + 4, y: ey - 3 }, { key: 'space_lamp', x: ex + 8, y: ey - 3 }, { key: 'space_lamp', x: ex + 12, y: ey - 3 },
    { key: 'space_astronaut', x: ex + 6, y: ey - 6 }, { key: 'space_rocks', x: ex + 6, y: ey - 13 }, { key: 'space_rocks', x: ex + 14, y: ey - 6 }, { key: 'space_beacon', x: ex + 14, y: ey - 3 },
  ];
  hireStaff(g, 'mechanic'); hireStaff(g, 'handyman');
  return { g, broken, spots };
}

function spaceLayer(g: GameState, spots: Spot[], big: boolean): { group: THREE.Group; pieces: DrawnPiece[] } {
  const group = new THREE.Group(); const pieces: DrawnPiece[] = [];
  spots.forEach((sp, i) => { const def = SPACE_BY_KEY[sp.key]; const d = drawSpacePiece(sp.key, FINE, i * 1.7, { big }); const t = g.tiles[sp.y * g.w + sp.x];
    d.group.position.set(sp.x + def.size / 2, (t ? t.h : 0) * HU, sp.y + def.size / 2); d.group.rotation.y = def.size > 1 ? 0 : (i % 4) * Math.PI / 2; group.add(d.group); pieces.push(d); });
  return { group, pieces };
}

async function main() {
  const note = $('#loading'); const say = (s: string) => { note.textContent = s; };
  say('Building the park…'); await new Promise(r => setTimeout(r, 30));
  const { g, broken, spots } = buildPark();
  for (let i = 0; i < 8000; i += 800) { for (let j = 0; j < 800; j++) tick(g); say(`Opening the gates… ${Math.round((i / 8000) * 100)}%`); await new Promise(r => setTimeout(r, 0)); }
  // a busy day: 400 guests out on the paths
  const proto = g.guests.find(q => q.state === 'walking') ?? g.guests[0]; const paths: [number, number, number][] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const t = g.tiles[y * g.w + x]; for (const p of t.paths) if (!p.queue && t.owned) paths.push([x, y, p.z]); }
  if (proto) { let id = g.nextGuestId; while (g.guests.filter(q => q.state !== 'left').length < 400) { const [x, y, hz] = paths[(id * 7919) % paths.length]; const q = JSON.parse(JSON.stringify(proto)); Object.assign(q, { id: id++, x: x + 0.5, y: y + 0.5, z: hz, tx: x, ty: y, state: 'walking', route: null, dest: null, headingTo: null, rideId: null, shirt: id % 16, entered: g.tick }); g.guests.push(q); } g.nextGuestId = id; g.guestsInPark = g.guests.filter(q => q.state !== 'left').length; }
  for (let j = 0; j < 1500; j++) tick(g);
  const breakIt = () => { if (!broken.breakdown) { broken.breakdown = { type: 'safety_cut_out', since: g.tick, mechanicId: null, fixing: 0 }; broken.running = false; } };
  breakIt();
  const cam = new InkCamera(); const ex = g.entrance.x, ey = g.entrance.y;
  const home = () => { cam.target.set(ex + 5, 1, ey - 9); cam.heading = Math.PI / 4; cam.elevation = Math.PI / 6; cam.zoom = 1.35; cam.update(); }; home();
  say('Drawing…'); await new Promise(r => setTimeout(r, 0));
  const views = { retro: new InkView($('#c-retro') as HTMLCanvasElement, g, FINE, cam), sleek: new InkView($('#c-sleek') as HTMLCanvasElement, g, FINE, cam) };   // retro = bigger, sleek = first size (ids kept from round 1)
  const layers = { retro: spaceLayer(g, spots, true), sleek: spaceLayer(g, spots, false) }; views.retro.scene.add(layers.retro.group); views.sleek.scene.add(layers.sleek.group);
  note.style.display = 'none';
  type Tab = keyof typeof views; let tab: Tab = (new URLSearchParams(location.search).get('tab') as Tab) || 'retro'; if (!(tab in views)) tab = 'retro';
  const setTab = (t: Tab) => { tab = t; for (const k of Object.keys(views)) { $(`#c-${k}`).style.visibility = k === t ? 'visible' : 'hidden'; $(`button[data-tab="${k}"]`).classList.toggle('on', k === t); } document.body.dataset.tab = t; try { history.replaceState(null, '', `?tab=${t}`); } catch {} };
  document.querySelectorAll<HTMLElement>('button[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab as Tab)); setTab(tab);
  const resize = () => { const w = innerWidth, h = innerHeight; cam.resize(w, h); views.retro.resize(w, h); views.sleek.resize(w, h); }; addEventListener('resize', resize); resize();
  let mode: 'pan' | 'rotate' = 'pan'; const setMode = (m: typeof mode) => { mode = m; $('[data-cam="pan"]').classList.toggle('on', m === 'pan'); $('[data-cam="rotate"]').classList.toggle('on', m === 'rotate'); }; setMode('pan');
  const stage = $('#stage'); let drag: { x: number; y: number; b: number } | null = null;
  stage.addEventListener('contextmenu', e => e.preventDefault()); stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.b === 2 || (drag.b === 0 && mode === 'rotate')) cam.orbit(dx, dy); else cam.pan(dx, dy); });
  stage.addEventListener('pointerup', () => { drag = null; }); stage.addEventListener('wheel', e => { e.preventDefault(); cam.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const act: Record<string, () => void> = { pan: () => setMode('pan'), rotate: () => setMode('rotate'), left: () => cam.orbit(-Math.PI / 4 / 0.006, 0), right: () => cam.orbit(Math.PI / 4 / 0.006, 0), in: () => cam.zoomBy(1.25), out: () => cam.zoomBy(0.8), home };
  document.querySelectorAll<HTMLElement>('[data-cam]').forEach(b => b.onclick = () => act[b.dataset.cam!]());
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === '1') setTab('retro'); else if (k === '2') setTab('sleek'); else if (k === 'q') act.left(); else if (k === 'e') act.right(); else if (k === 'r') setMode(mode === 'pan' ? 'rotate' : 'pan'); else if (k === 'h') home(); });
  let last = performance.now(), acc = 0, t = 0, fixAt = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    acc += dt * TICKS_PER_SEC; let n = 0; while (acc >= 1 && n < 40) { tick(g); acc--; n++; }
    if (!broken.breakdown) { if (!fixAt) fixAt = t + 6; else if (t > fixAt) { breakIt(); fixAt = 0; } }   // fixed: break again a few seconds later, so the round always shows one
    for (const p of layers[tab].pieces) p.animate(t); views[tab].frame(t);
  };
  requestAnimationFrame(frame);
  (window as any).__space = { g, cam, views, setTab, broken };
}
main().catch(e => { $('#loading').textContent = 'Could not start: ' + (e?.message ?? e); console.error(e); });
