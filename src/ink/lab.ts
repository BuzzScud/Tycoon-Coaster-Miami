// The ink look preview: one real park (built with the game's own commands, guests arriving), drawn three ways —
// Today (the current renderer), 1 · Fine ink and 2 · Bold ink — with the same flat camera on the two ink tabs.
import { newGame, tick, cmdPath, cmdPlaceRide, cmdPlaceEntrance, cmdStartCoaster, cmdAddPiece, cmdScenery, cmdPathAdd } from '../sim/game';
import { openRide, testRide } from '../sim/ridesim';
import { TICKS_PER_SEC, type GameState, type Dir } from '../sim/types';
import { longDateString } from '../sim/time';
import { World } from '../three/world';
import { TerrainView } from '../three/terrain';
import { SceneryView } from '../three/scenery';
import { PeepsView } from '../three/peeps';
import { RidesView } from '../three/rides';
import { FINE, BOLD, InkCamera } from './kit';
import { InkView } from './view';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

function buildPark(): GameState {
  const g = newGame({ name: 'Ink Park', size: 'medium', cash: 5_000_000, loan: 0, maxLoan: 0, difficulty: 'normal', sandbox: true, seed: 20261013 });
  const ex = g.entrance.x, ey = g.entrance.y; const h = g.tiles[(ey - 2) * g.w + ex].h;
  for (let y = ey - 30; y <= ey - 2; y++) for (let x = ex - 12; x <= ex + 16; x++) { const t = g.tiles[y * g.w + x]; t.h = h; t.water = false; t.scenery = null; }
  for (let i = 3; i <= 24; i++) cmdPath(g, ex, ey - i, false, 0);
  cmdPlaceRide(g, 'merry_go_round', ex - 5, ey - 9, 0); const mgr = g.rides[0];
  cmdPlaceEntrance(g, mgr.id, ex - 3, ey - 9, false); cmdPlaceEntrance(g, mgr.id, ex - 5, ey - 7, true);
  for (const x of [ex - 2, ex - 1]) cmdPath(g, x, ey - 9, false, 0); for (let x = ex - 5; x <= ex - 1; x++) cmdPath(g, x, ey - 6, false, 0);
  openRide(g, mgr);
  cmdPlaceRide(g, 'burger_bar', ex + 1, ey - 12, 2); cmdPlaceRide(g, 'balloon_stall', ex + 1, ey - 11, 2); cmdPlaceRide(g, 'drink_stall', ex + 1, ey - 14, 2);
  // the wooden coaster, the same layout as the browser test
  const sx = ex + 2, sy = ey - 22; cmdStartCoaster(g, 'wooden_coaster', sx, sy, 0); const r = g.rides[g.rides.length - 1];
  const add = (k: string, chain = false) => cmdAddPiece(g, r.id, k, chain, 0);
  add('station'); add('station'); for (let i = 0; i < 4; i++) add('up', true); add('turnR'); add('down'); add('steepDown'); add('flat'); add('flat'); add('turnR'); for (let i = 0; i < 7; i++) add('flat'); add('turnR'); for (let i = 0; i < 4; i++) add('flat'); add('turnR');
  const s0 = r.pieces[0], s1 = r.pieces[1]; cmdPlaceEntrance(g, r.id, s0.x, s0.y - 1, false); cmdPlaceEntrance(g, r.id, s1.x, s1.y - 1, true);
  for (const xx of [s0.x, s1.x, ex + 1]) cmdPath(g, xx, sy - 2, false, 0);
  testRide(g, r); openRide(g, r); r.price = 150;
  // lamps, benches and bins along the main path; trees and flowers beside it
  for (let i = 4; i <= 24; i += 3) cmdPathAdd(g, ex, ey - i, (['lamp', 'bench', 'bin'] as const)[(i / 3) % 3 | 0]);
  const kinds = ['tree_oak', 'tree_pine', 'tree_cherry', 'bush', 'flowers', 'tree_oak'];
  let k = 0; for (let y = ey - 26; y <= ey - 3; y++) for (const x of [ex - 8, ex - 7, ex - 2, ex + 5, ex + 6, ex + 9]) if ((x * 5 + y * 3) % 4 === 0) { if (cmdScenery(g, x, y, kinds[k % kinds.length], 0 as Dir).ok) k++; }
  return g;
}

class Today {
  world: World; terrain: TerrainView; rides: RidesView; peeps: PeepsView;
  constructor(canvas: HTMLCanvasElement, public g: GameState) {
    this.world = new World(canvas); this.terrain = new TerrainView(this.world.scene, g); new SceneryView(this.world.scene, g); this.peeps = new PeepsView(this.world.scene, g); this.rides = new RidesView(this.world.scene, g);
  }
  frame(t: number, cam: InkCamera) {
    const c = this.world.controls; c.target.copy(cam.target); c.yaw = cam.heading; c.pitch = Math.max(0.3, cam.elevation + 0.25); c.distance = (cam.view / cam.zoom) / 0.77;
    this.terrain.update(); this.terrain.animate(t); this.rides.sync(t); this.peeps.update(t); this.world.setSky(1, 0, 0.3); this.world.render();
  }
}

async function main() {
  const note = $('#loading'); const say = (s: string) => { note.textContent = s; };
  say('Building the park…'); await new Promise(r => setTimeout(r, 30));
  const g = buildPark();
  const WARM = 9000; for (let i = 0; i < WARM; i += 600) { for (let j = 0; j < 600; j++) tick(g); say(`Opening the gates… ${Math.round((i / WARM) * 100)}%`); await new Promise(r => setTimeout(r, 0)); }
  const cam = new InkCamera(); const ex = g.entrance.x, ey = g.entrance.y; const home = () => { cam.target.set(ex + 1.5, 0, ey - 13); cam.heading = Math.PI / 4; cam.elevation = Math.PI / 6; cam.zoom = 1; cam.update(); }; home();
  say('Drawing in ink…'); await new Promise(r => setTimeout(r, 0));
  const views = { today: new Today($('#c-today') as HTMLCanvasElement, g), fine: new InkView($('#c-fine') as HTMLCanvasElement, g, FINE, cam), bold: new InkView($('#c-bold') as HTMLCanvasElement, g, BOLD, cam) };
  note.style.display = 'none';
  type Tab = keyof typeof views; let tab: Tab = (new URLSearchParams(location.search).get('tab') as Tab) || 'fine'; if (!(tab in views)) tab = 'fine';
  const setTab = (t: Tab) => { tab = t; for (const k of Object.keys(views)) { $(`#c-${k}`).style.visibility = k === t ? 'visible' : 'hidden'; $(`button[data-tab="${k}"]`).classList.toggle('on', k === t); } document.body.dataset.tab = t; try { history.replaceState(null, '', `?tab=${t}`); } catch {} };
  document.querySelectorAll<HTMLElement>('button[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab as Tab)); setTab(tab);
  const resize = () => { const w = innerWidth, h = innerHeight; cam.resize(w, h); views.fine.resize(w, h); views.bold.resize(w, h); views.today.world.resize(w, h); };
  addEventListener('resize', resize); resize();
  // camera: drag pans (or turns in Rotate mode), right-drag turns and tilts, scroll zooms
  let mode: 'pan' | 'rotate' = 'pan'; const setMode = (m: typeof mode) => { mode = m; $('[data-cam="pan"]').classList.toggle('on', m === 'pan'); $('[data-cam="rotate"]').classList.toggle('on', m === 'rotate'); }; setMode('pan');
  const stage = $('#stage'); let drag: { x: number; y: number; b: number } | null = null;
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.b === 2 || (drag.b === 0 && mode === 'rotate')) cam.orbit(dx, dy); else cam.pan(dx, dy); });
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('wheel', e => { e.preventDefault(); cam.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const act: Record<string, () => void> = { pan: () => setMode('pan'), rotate: () => setMode('rotate'), left: () => cam.orbit(-Math.PI / 4 / 0.006, 0), right: () => cam.orbit(Math.PI / 4 / 0.006, 0), in: () => cam.zoomBy(1.25), out: () => cam.zoomBy(0.8), home };
  document.querySelectorAll<HTMLElement>('[data-cam]').forEach(b => b.onclick = () => act[b.dataset.cam!]());
  let speed = 1; const setSpeed = (s: number) => { speed = s; document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed! === s)); };
  document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed!)); setSpeed(1);
  const keys = new Set<string>();
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === 't') setTab('today'); else if (k === '1') setTab('fine'); else if (k === '2') setTab('bold');
    else if (k === 'q') act.left(); else if (k === 'e') act.right(); else if (k === '+' || k === '=') act.in(); else if (k === '-') act.out(); else if (k === 'home' || k === 'h') home();
    else if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); } else if (k === 'r') setMode(mode === 'pan' ? 'rotate' : 'pan');
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); addEventListener('blur', () => keys.clear());
  // the loop: run the park, move the camera by keys, draw only the visible tab
  let last = performance.now(), acc = 0, t = 0, ui = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    if (speed) { acc += dt * TICKS_PER_SEC * speed; let n = 0; while (acc >= 1 && n < 40 * speed) { tick(g); acc--; n++; } if (n >= 40 * speed) acc = 0; }
    const px = (keys.has('a') || keys.has('arrowleft') ? -1 : 0) + (keys.has('d') || keys.has('arrowright') ? 1 : 0), py = (keys.has('w') || keys.has('arrowup') ? -1 : 0) + (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    if (px || py) cam.pan(-px * 600 * dt, -py * 600 * dt);
    if (tab === 'today') views.today.frame(t, cam); else views[tab].frame(t);
    ui += dt; if (ui > 0.5) { ui = 0; $('#stat-date').textContent = longDateString(g); $('#stat-guests').textContent = String(g.guestsInPark); }
  };
  requestAnimationFrame(frame);
  (window as any).__ink = { g, cam, views, setTab };
}
main().catch(e => { $('#loading').textContent = 'Could not start: ' + (e?.message ?? e); console.error(e); });
