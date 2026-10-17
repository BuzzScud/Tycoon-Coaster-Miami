// The 3D game: world + views + dock interface + tools + input. The rules live in ../sim and are shared with the 2D fallback.
import * as THREE from 'three';
import { type GameState, type Dir, type Ride, TICKS_PER_SEC, LAND_STEP, DX, DY, money } from '../sim/types';
import { autoConnect, type ConnectResult } from '../sim/connect';
import { openRide, testRide } from '../sim/ridesim';
import { fmtRating } from '../sim/rides';
import { pieceAt, undoGroup, trial, pieceCost, tick, cmdLand, cmdWater, cmdPath, cmdRemovePath, cmdScenery, cmdRemoveScenery, cmdPlaceRide, cmdPlaceEntrance, cmdAddPiece, cmdRemovePiece, cmdStartCoaster, cmdPathAdd, cmdBuyLand, cmdSurface, pathFor, checkPiece, coasterCursor, undo, type CmdResult } from '../sim/game';
import { tileAt, landTop, waterZ, corners, CORNER_OFF } from '../sim/map';
import { RIDE_BY_KEY } from '../sim/rides';
import { PIECE_BY_KEY } from '../sim/track';
import { buildCircuit } from '../sim/autotrack';
import { cmdBuildDesign, designPieces, DESIGN_BY_KEY } from '../sim/designs';
import { monthFraction } from '../sim/time';
import { writeSlot, migrateSaves } from '../sim/save';
import type { Tool } from './shared';
import { freshSel, pieceFor, pieceName, offers, choose, canChoose, specialOk, CURVE_UI, PITCH_UI, ROLL_UI, type BuildSel } from './construct';
import { World, HU, MAT_GHOST, MAT_BLOCKED, LOOKS, isFlat, type Look } from '../three/world';
import { InkTerrainView, InkSceneryView, InkPeepsView, InkRidesView, InkPieces, drawPiece, isPieceKind } from '../ink/views';
import { SCENERY_BY_KEY, sizeOf } from '../sim/scenery';
import { FINE, RCT, RICH } from '../ink/kit';
import { TerrainView, TERRAIN } from '../three/terrain';
import { GROUND } from '../ink/terrain';
import { SceneryView, sceneryGeometry } from '../three/scenery';
import { PeepsView } from '../three/peeps';
import { RidesView } from '../three/rides';
import { WeatherFx } from '../three/weather';
import { rideModel, hutModel } from '../three/models';
import { pieceGhost, trackGhost } from '../three/coaster';
import { DockUI, TOOLS, PARK_TABS, SYS_TABS, esc } from './ui';
import { renderPanel, panelAction } from './panels3d';
import { I, ic } from './icons';
import { reportHtml, bindReport } from './report';
import { ResController } from './perf';
import { Floaters } from './floaters';
import { Lens, LENSES, type LensMode } from './lens';
import { MiniMap } from './minimap';
import { patrolCell } from '../sim/staff';
import { saveStars } from './progress';

// What the game needs from a set of views, whichever look draws them.
type CoasterLike = { group: THREE.Object3D; frameAt(s: number): { p: THREE.Vector3; up: THREE.Vector3 } | null };
type TerrainLike = { landTargets: THREE.Mesh[]; update(): void; animate(t: number): void; markDirty(x: number, y: number): void; markAllDirty(): void; setGame(g: GameState): void };
type SceneryLike = { rebuild(): void; setGame(g: GameState): void; animate?(t: number): void; pieces?: { group: THREE.Group } };
type PeepsLike = { bodies: THREE.InstancedMesh; frustum?: THREE.Frustum | null; detail?(full: boolean): void; update(t: number): void; setGame(g: GameState): void; idAt(i: number): { kind: 'guest' | 'staff'; id: number } | null };
type RidesLike = { group: THREE.Group; entries: Map<number, { coaster: CoasterLike | null }>; sync(t: number): void; setGame(g: GameState): void; coasterOf(id: number): CoasterLike | null };
const LOOK_KEY = 'rct.look';
const SIM_BUDGET_MS = 8;   // most of a frame the rules may take; the rest is for drawing
const FAR_DETAIL = 62;     // camera distance beyond which guests are drawn without their ink outline
export function savedLook(): Look { try { const l = localStorage.getItem(LOOK_KEY) as Look; return LOOKS.includes(l) ? l : 'ink'; } catch { return 'ink'; } }
/** The interface skin each look wears: the paper one, RCT's bevelled windows, or the dark glass. */
const skinOf = (l: Look) => (l === 'rct' ? 'rct' : isFlat(l) ? 'ink' : 'classic');
const styleOf = (l: Look) => (l === 'rct' ? RCT : l === 'rich' ? RICH : FINE);

export class App3D {
  g!: GameState; ui: DockUI; world: World; terrain!: TerrainLike; scenery!: SceneryLike; peeps!: PeepsLike; rides!: RidesLike; weather: WeatherFx | null = null; look: Look = savedLook();
  tool: Tool = { kind: 'inspect' }; buildSel: BuildSel = freshSel();
  hover: { x: number; y: number; fx: number; fy: number } | null = null; mouse = { x: 0, y: 0, down: false, button: 0, sx: 0, sy: 0, dragged: false, lastX: 0, lastY: 0 };
  running = false; last = performance.now(); acc = 0; uiTimer = 0; time = 0; lastAutosaveMonth = -1; lastPath: { x: number; y: number } | null = null; keys = new Set<string>();
  panelId = ''; panelTab = 0; selectedRide: number | null = null; follow: number | null = null; rideCam: { rideId: number } | null = null; camLerp = new THREE.Vector3(); camLook = new THREE.Vector3();
  wakeUntil = 0; drewLast = false; drawn = 0; frustum = new THREE.Frustum(); m4 = new THREE.Matrix4(); res = new ResController(Math.min(2, window.devicePixelRatio || 1)); resAuto = (() => { try { return localStorage.getItem('rct.res') !== 'full'; } catch { return true; } })();
  armed = '';   // a risky button waiting for its in-game confirm: 'panel id|action'
  /** Auto-connect: a placed ride gets its entrance, exit and paths, and opens; a finished coaster is connected, tested and opened. */
  autoConnect = (() => { try { return localStorage.getItem('rct.autoconnect') !== 'off'; } catch { return true; } })();
  goalState = ''; reportOpen = false; trayOpen = ''; trayTab = 0; winOpen = false; winId = 'rides'; winSub = 0; sysOpen = false; sysId = 'save'; menuOpen = false; camMode: 'pan' | 'rotate' = 'pan'; lastNews: object | null = null;
  ghost: THREE.Object3D | null = null; ghostSig = ''; designCheck = { at: '', why: '' };
  floaters: Floaters; lens: Lens; minimap: MiniMap; viewOpen = false; specialOpen = false; lensBefore: LensMode = 'off'; tileHi: THREE.Mesh; ray = new THREE.Raycaster(); ndc = new THREE.Vector2(); frameTimes: number[] = [];
  constructor(public root: HTMLElement) {
    this.ui = new DockUI(root, g => this.start(g));
    const canvas = root.querySelector('#view3d') as HTMLCanvasElement; this.world = new World(canvas); this.world.useLook(this.look); root.dataset.look = skinOf(this.look);
    this.tileHi = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.35, depthWrite: false })); this.tileHi.rotation.x = -Math.PI / 2; this.tileHi.visible = false; this.tileHi.renderOrder = 4; this.world.scene.add(this.tileHi);
    const ui = this.ui;
    ui.inspector.onAct = (id, a, el) => panelAction(this, id, a, el); ui.inspector.onTab = i => { this.panelTab = i; this.refreshInsp(true); }; ui.inspector.onClose = () => { this.panelId = ''; };
    ui.tray.onAct = (id, a, el) => this.trayAction(id, a, el); ui.tray.onTab = i => { this.trayTab = i; this.refreshTray(true); }; ui.tray.onClose = () => this.setTool({ kind: 'inspect' });
    ui.win.onAct = (id, a, el) => panelAction(this, id, a, el); ui.win.onTab = i => { this.winSub = i; this.refreshWin(true); }; ui.win.onMain = id => this.openPanel(id); ui.win.onClose = () => { this.winOpen = false; this.updateChrome(); };
    ui.sys.onAct = (id, a, el) => panelAction(this, id, a, el); ui.sys.onMain = id => this.openPanel(id); ui.sys.onClose = () => { this.sysOpen = false; };
    ui.onBar = a => this.barAction(a); ui.onMenu = a => this.menuAction(a); ui.onTop = a => this.openPanel(a); ui.onView = a => this.viewAction(a);
    this.floaters = new Floaters(root); this.lens = new Lens(root, () => this.setLens('off')); this.minimap = new MiniMap(root, (x, y) => { this.centerOn(x, y); this.wake(); }); this.world.scene.add(this.lens.mesh);
    this.ui.viewBack.onclick = () => this.viewOnly(false);
    migrateSaves().then(n => { if (n && !this.running) this.ui.renderTitle(); });   // older plain saves move into the compressed store once
    this.bindInput(); new ResizeObserver(() => this.resize()).observe(root); this.resize();
  }
  // ---------- lifecycle ----------
  start(g: GameState) {
    this.g = g; this.ui.hideTitle();
    if (!this.terrain) this.buildViews(g);
    else { this.terrain.setGame(g); this.scenery.setGame(g); this.peeps.setGame(g); this.rides.setGame(g); this.weather?.setGame(g); }
    this.tool = { kind: 'inspect' }; this.panelId = ''; this.trayOpen = ''; this.winOpen = false; this.sysOpen = false; this.menuOpen = false; this.ui.setMenu(false); for (const p of [this.ui.inspector, this.ui.tray, this.ui.win, this.ui.sys]) p.close(); this.lastNews = g.news[0] ?? null; this.rideCam = null; this.world.controls.rideCam = false; this.ui.rideHint.style.display = 'none';
    this.closeReport(); this.viewOnly(false); this.goalState = g.goals?.state ?? ''; this.floaters.reset(g); this.minimap.dirty(); this.minimap.show(true); if (this.lens.mode === 'patrol') this.lens.set('off');
    this.resetCamera(); this.wake(3000); this.lastAutosaveMonth = g.monthsElapsed; this.running = true; this.last = performance.now(); this.acc = 0; this.updateChrome();
    if (!(this as any)._loop) { (this as any)._loop = true; requestAnimationFrame(t => this.frame(t)); }
  }
  showTitle() { this.running = false; this.minimap.show(false); this.lens.set('off'); this.ui.showTitle(); }
  /** The views for the current look, in the world's current scene. */
  buildViews(g: GameState) {
    const sc = this.world.scene;
    if (isFlat(this.look)) { const s = styleOf(this.look); this.terrain = new InkTerrainView(sc, g, s); this.scenery = new InkSceneryView(sc, g, s); this.peeps = new InkPeepsView(sc, g, s); this.rides = new InkRidesView(sc, g, s); this.weather = null; }
    else { TERRAIN.mottle = this.look === 'sunny'; this.terrain = new TerrainView(sc, g); const sv = new SceneryView(sc, g), pieces = new InkPieces(sc, g, FINE); pieces.rebuild(); this.scenery = { rebuild: () => { sv.rebuild(); pieces.rebuild(); }, setGame: (g2: GameState) => { sv.setGame(g2); pieces.setGame(g2); }, animate: (t: number) => pieces.animate(t), pieces }; this.peeps = new PeepsView(sc, g); this.rides = new RidesView(sc, g); this.weather = new WeatherFx(sc, g); sc.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); }
    sc.add(this.tileHi); sc.add(this.lens.mesh); if (this.ghost) { this.ghost = null; this.ghostSig = ''; }
  }
  /** Switch between the ink and the classic look; the park and the camera stay where they are. */
  setLook(look: Look) {
    if (look === this.look) return; this.look = look; try { localStorage.setItem(LOOK_KEY, look); } catch {} this.root.dataset.look = skinOf(look); this.applyRes(this.resAuto ? this.res.reset() : this.res.max);
    const old = this.world.useLook(look); this.wake();
    if (this.g) this.buildViews(this.g); else { this.world.scene.add(this.tileHi); this.world.scene.add(this.lens.mesh); }
    old.traverse(o => { (o as THREE.Mesh).geometry?.dispose(); });
    const c = this.world.controls; if (isFlat(look)) c.pitch = Math.min(c.pitch, 1.13);
  }
  resetCamera() { const c = this.world.controls; c.target.set(this.g.entrance.x + 1, 0, this.g.entrance.y - 8); if (isFlat(this.look)) { c.distance = 30; c.yaw = Math.PI / 4; c.pitch = Math.PI / 6; } else { c.distance = 34; c.yaw = Math.PI; c.pitch = 0.85; } }
  resize() { const w = this.root.clientWidth || window.innerWidth, h = this.root.clientHeight || window.innerHeight; this.world.resize(w, h); this.wake(); }
  autosave() { writeSlot('autosave', this.g, this.g.parkName, '').then(err => { if (err) this.toast(err, true); }); }
  frame(now: number) {
    requestAnimationFrame(t => this.frame(t)); if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.time += dt; const g = this.g;
    this.moveCameraByKeys(dt);
    // The clock: as many ticks as real time asks for, but never more than SIM_BUDGET_MS of work in one frame, so a slow
    // machine keeps drawing smoothly and the park runs a little slower instead of the picture stalling.
    if (g.speed > 0) { const mult = [0, 1, 2, 4, 8][g.speed]; this.acc += dt * TICKS_PER_SEC * mult; let n = 0; const t0 = performance.now(); while (this.acc >= 1) { tick(g); this.acc--; n++; if ((n & 1) === 0 && performance.now() - t0 > SIM_BUDGET_MS) break; } this.acc = Math.min(this.acc, TICKS_PER_SEC * mult * 0.25); }
    // Draw only while something can change: the clock running, a ride camera or a followed guest, keys held, or the
    // last input under 1.5 s ago. Paused and untouched, the park rests and nothing is drawn (battery, fans).
    const awake = g.speed > 0 || !!this.rideCam || this.follow !== null || this.keys.size > 0 || now < this.wakeUntil;
    if (awake) {
      const cam = this.world.view; if ('frustum' in this.peeps) this.peeps.frustum = this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      this.peeps.detail?.(this.world.controls.distance < FAR_DETAIL);
      this.terrain.update(); this.terrain.animate(this.time); this.scenery.animate?.(this.time); this.rides.sync(this.time); this.peeps.update(this.time);
      if (!isFlat(this.look)) { const sunny = this.look === 'sunny'; const light = sunny ? 1 : this.lightLevel(); this.world.setSky(light, sunny ? 0 : g.weather.gloom, sunny ? 0.12 : monthFraction(g)); if (!sunny) this.weather?.update(dt, this.world.controls.target, light); }
      this.updateGhost(); this.updateRideCam(dt); this.updateFollow(); this.lens.update(g, now);
      this.world.controls.clampTarget(g.w, g.h); this.world.render(); this.drawn++; this.minimap.update(g, this.world.view, now);
      if (this.drewLast) { this.frameTimes.push(dt); if (this.frameTimes.length > 60) this.frameTimes.shift(); if (this.resAuto) { const r = this.res.sample(dt * 1000, now); if (r) this.applyRes(r); } }
    }
    this.drewLast = awake;
    this.floaters.update(g, this.world.view, this.world.canvas, this.world.controls.distance, now, g.speed > 0 && !this.rideCam);
    this.uiTimer += dt; if (this.uiTimer > 0.25) { this.uiTimer = 0; this.updateChrome(); this.refreshPanel(); }
    if (g.goals && g.goals.state !== this.goalState) { this.goalState = g.goals.state; if (g.goals.state !== 'running') { g.speed = 0; if (g.goals.state === 'met' && g.goals.scenario) saveStars(g.goals.scenario, g.goals.stars ?? 1); this.openReport(); } }
    if (g.monthsElapsed !== this.lastAutosaveMonth) { this.lastAutosaveMonth = g.monthsElapsed; this.autosave(); }
  }
  /** Any input keeps the park drawing for a moment, so a paused park still answers the mouse and keys. */
  wake(ms = 1500) { this.wakeUntil = Math.max(this.wakeUntil, performance.now() + ms); }
  /** Resolution: Auto steps down on slow frames and back up on quick ones; Full always draws every pixel. */
  setResMode(auto: boolean) { this.resAuto = auto; try { localStorage.setItem('rct.res', auto ? 'auto' : 'full'); } catch {} if (!auto) this.applyRes(this.res.reset()); this.wake(); }
  /** Pixels: the RCT look draws at a fraction of the screen's pixels and shows them enlarged without smoothing. */
  applyRes(r: number) { const px = isFlat(this.look) ? styleOf(this.look).pixel : 0; this.world.renderer.setPixelRatio(px ? px : r); this.world.canvas.style.imageRendering = px ? 'pixelated' : ''; this.resize(); this.wake(); }
  lightLevel(): number { const f = monthFraction(this.g); const day = 0.5 + 0.5 * Math.cos(f * Math.PI * 2); return Math.max(0.12, (0.25 + 0.75 * day)); }
  // ---------- chrome: the status bars, the bottom bar (tools or the coaster builder) and message cards ----------
  updateChrome() {
    const g = this.g; if (!g) return; this.ui.setTop(g);
    const n = g.news[0]; if (n && n !== this.lastNews) { this.lastNews = n; this.ui.newsToast(n.icon === 'guest' ? 'smile' : (I[n.icon] ? n.icon : 'info'), n.text, n.subject ? () => this.goTo(n.subject!) : undefined); }
    const t = this.tool; this.ui.setBar(t.kind === 'coaster' ? this.builderBar(t.rideId) : this.toolBar());
    this.ui.bar.classList.toggle('builder', t.kind === 'coaster');
  }
  /** Which tool button is lit: the tool in hand, or the tray being browsed before picking. */
  activeTool(): string {
    const t = this.tool;
    switch (t.kind) { case 'land': return 'land'; case 'path': case 'pathAdd': return 'path'; case 'scenery': return 'scenery'; case 'ride': case 'coasterStart': case 'entrance': case 'design': return 'newride'; case 'demolish': return 'demolish'; default: return this.trayOpen || 'inspect'; }
  }
  toolBar(): string {
    const g = this.g, act = this.activeTool();
    const tools = TOOLS.map(([id, icon, label, key]) => `<button class="tl ${act === id ? 'on' : ''}" data-b="tool:${id}" title="${label} (${key})">${ic(icon)}<span>${label}</span><kbd>${key}</kbd></button>`).join('');
    const speeds = (['‖', '1×', '2×', '4×', '8×'] as const).map((l, i) => `<button class="sp ${g.speed === i ? 'on' : ''}" data-b="speed:${i}" title="${['Pause (P or space)', 'Normal speed (1)', 'Fast (2)', 'Faster (3)', 'Fastest (4)'][i]}">${l}</button>`).join('');
    return `<button class="pk ${this.winOpen ? 'on' : ''}" data-b="park" title="Rides, guests, staff, money, research, messages and the report">${ic('park')}<span>Park</span></button><span class="sep"></span><span class="grp">${tools}</span><span class="sep"></span>${this.camGroup()}<span class="sep"></span><span class="grp">${speeds}</span><span class="sep"></span><button class="mn ${this.viewOpen || this.lens.mode !== 'off' ? 'on' : ''}" data-b="view" title="View: overlays (O), mini-map (M), money pops, thought bubbles">${ic('layers')}</button><button class="mn ${this.menuOpen ? 'on' : ''}" data-b="menu" title="Save, options, undo, new park">${ic('menu')}</button>`;
  }
  /** While a coaster is being built the bar becomes the builder: every piece control in one row, nothing duplicated. */
  builderBar(rideId: number): string {
    const r = this.g.rides.find(x => x.id === rideId); if (!r) return this.toolBar();
    const s = this.buildSel, key = this.currentPieceKey(), cost = key ? pieceCost(r, key) : 0, free = !s.special; const o = offers(RIDE_BY_KEY[r.type].coaster?.rct);
    const sq = (icon: string, a: string, on: boolean, tip: string, dis = false) => `<button class="btn sq ${on ? 'on' : ''} ${dis ? 'dis' : ''}" data-b="b:${a}" title="${tip}">${I[icon]}</button>`;
    const grp = (label: string, inner: string) => `<span class="bg"><span class="lab">${label}</span><span class="bgr">${inner}</span></span>`;
    const dir = grp('Direction', CURVE_UI.filter(([c]) => o.curves.has(c)).map(([c, icon, tip]) => sq(icon, 'curve:' + c, free && s.curve === c, tip, !canChoose(this.g, r, s, 'curve', c))).join(''));
    const slope = grp('Slope', PITCH_UI.filter(([p]) => o.pitches.has(p)).map(([p, icon, tip]) => sq(icon, 'pitch:' + p, free && s.pitch === p, tip, !canChoose(this.g, r, s, 'pitch', p))).join('') + sq('chain', 'chain', s.chain, 'Chain lift (on pieces that take one)'));
    const bank = o.rolls.size > 1 ? grp('Bank', ROLL_UI.filter(([b]) => o.rolls.has(b)).map(([b, icon, tip]) => sq(icon, 'roll:' + b, free && s.roll === b, tip, !canChoose(this.g, r, s, 'roll', b))).join('')) : '';
    const special = grp('Special', `<button class="btn ${s.special ? 'on' : ''}" data-b="b:specials" title="Stations, loops, corkscrews, helices, brakes and the other special pieces">${s.special ? pieceName(s.special) : 'Special'} ▾</button>`);
    const info = `<span class="pc"><b>${key ? pieceName(key) : 'No piece fits here'}</b><span>${r.closedLoop ? 'circuit complete' : key ? money(cost) : ''} · ${r.pieces.length} pieces</span></span>`;
    const act = (a: string, label: string, cls = '', tip = '') => `<button class="btn ${cls}" data-b="b:${a}" title="${tip}">${label}</button>`;
    const acts = act('remove', `${I.back} Remove`) + (r.closedLoop ? act('entrance', `${I.entrance} Entrance`, r.entrance ? 'on' : '') + act('exit', `${I.exit} Exit`, r.exit ? 'on' : '') + act('ridewin', `${I.eye} Details`) : (r.pieces.length >= 2 ? act('finish', `${I.wand} Finish`, '', 'Finish circuit: plan and build the track back into the station (one undo)') : '') + act('build', `${I.check} Build <kbd>⏎</kbd>`, 'pri'));
    return `<button class="btn" data-b="done" title="Finish building (Esc)">${I.check} Done</button><span class="sep"></span>${dir}${slope}${bank}${special}<span class="sep"></span>${info}${acts}<span class="sep"></span>${this.camGroup()}`;
  }
  /** Pan or Rotate (what a left drag does), turn left and right, zoom, reset: the same group in the tool bar and the builder. */
  camGroup(): string {
    const sq = (a: string, icon: string, tip: string) => `<button class="btn sq" data-b="cam:${a}" title="${tip}">${I[icon]}</button>`;
    return `<span class="grp cam"><button class="tl ${this.camMode === 'pan' ? 'on' : ''}" data-b="cam:pan" title="Left drag moves the view">Pan</button><button class="tl ${this.camMode === 'rotate' ? 'on' : ''}" data-b="cam:rotate" title="Left drag turns and tilts the view">Rotate</button>${sq('left', 'rotl', 'Turn left (Q)')}${sq('right', 'rotate', 'Turn right (E)')}${sq('out', 'zoomout', 'Zoom out (−)')}${sq('in', 'zoomin', 'Zoom in (+)')}${sq('home', 'home', 'Reset the view')}</span>`;
  }
  barAction(a: string) {
    if (a === 'park') { if (this.winOpen) this.winOpen = false; else this.openPanel(this.winId); }
    else if (a.startsWith('tool:')) this.dockAction(a.slice(5));
    else if (a.startsWith('cam:')) this.camAction(a.slice(4));
    else if (a.startsWith('speed:')) this.g.speed = +a.slice(6) as GameState['speed'];
    else if (a === 'menu') { this.menuOpen = !this.menuOpen; this.ui.setMenu(this.menuOpen); if (this.viewOpen) { this.viewOpen = false; this.ui.setViewMenu(false); } }
    else if (a === 'view') { this.viewOpen = !this.viewOpen; if (this.menuOpen) { this.menuOpen = false; this.ui.setMenu(false); } this.updateChrome(); this.ui.setViewMenu(this.viewOpen, this.viewMenuHtml()); return; }
    else if (a === 'done') this.setTool({ kind: 'inspect' });
    else if (a === 'b:specials' && this.tool.kind === 'coaster') { this.specialOpen = !this.specialOpen; if (this.viewOpen) this.viewOpen = false; this.ui.setViewMenu(this.specialOpen, this.specialMenuHtml(), 'b:specials'); }
    else if (a.startsWith('b:') && this.tool.kind === 'coaster') { panelAction(this, 'build:' + this.tool.rideId, a.slice(2), this.ui.bar); if (this.specialOpen) { this.specialOpen = false; this.ui.setViewMenu(false); } }
    this.updateChrome(); this.refreshPanel(true);
  }
  // ---------- the View menu: overlays, the mini-map, money pops, thought bubbles ----------
  viewMenuHtml(): string {
    const b = (label: string, a: string, on: boolean) => `<button class="btn ${on ? 'on' : ''}" data-v="${a}">${label}</button>`;
    return `<span class="vh">Overlay <kbd>O</kbd></span><span class="vr">${LENSES.map(([m, l]) => b(l, 'lens:' + m, this.lens.mode === m)).join('')}</span>
      <span class="vh">Show</span><span class="vr">${b(ic('map') + ' Mini-map <kbd>M</kbd>', 'mini', this.minimap.on)}${b(ic('money') + ' Money pops', 'pops', this.floaters.money)}${b(ic('thought') + ' Thought bubbles', 'bubbles', this.floaters.thoughts)}${b(ic('eye') + ' See through land <kbd>U</kbd>', 'under', GROUND.under)}</span>`;
  }
  /** The construction window's Special list: every special piece this ride type has, greyed where it does not follow on. */
  specialMenuHtml(): string {
    const t = this.tool; const r = t.kind === 'coaster' ? this.g.rides.find(x => x.id === t.rideId) : null; if (!r) return '';
    const o = offers(RIDE_BY_KEY[r.type].coaster?.rct); const s = this.buildSel;
    const items = o.specials.map(k => k === '-' ? '</span><span class="vr">' : `<button class="btn spb ${s.special === k ? 'on' : ''} ${specialOk(this.g, r, k) ? '' : 'dis'}" data-v="sp:${k}" title="${specialOk(this.g, r, k) ? pieceName(k) : pieceName(k) + ': does not follow on from the track here'}">${pieceName(k)}</button>`).join('');
    return `<span class="vh">Special pieces</span><span class="vr">${items}</span>`;
  }
  viewAction(a: string) {
    if (a.startsWith('sp:') && this.tool.kind === 'coaster') { panelAction(this, 'build:' + this.tool.rideId, a, this.ui.bar); this.specialOpen = false; this.ui.setViewMenu(false); this.updateChrome(); return; }
    if (a.startsWith('lens:')) this.setLens(a.slice(5) as LensMode); else if (a === 'mini') this.minimap.toggle(); else if (a === 'pops') this.floaters.set('pops', !this.floaters.money); else if (a === 'bubbles') this.floaters.set('bubbles', !this.floaters.thoughts); else if (a === 'under') this.setUnder(!GROUND.under);
    this.wake(); this.updateChrome(); if (this.viewOpen) this.ui.setViewMenu(true, this.viewMenuHtml());
  }
  /** RCT's underground view: the land goes faint so tunnels and what is under it show. */
  setUnder(on: boolean) { GROUND.under = TERRAIN.under = on; this.terrain.markAllDirty(); this.terrain.update(); this.wake(); }
  setLens(mode: LensMode) { if (this.tool.kind === 'patrol') this.lensBefore = mode; else this.lens.set(mode); this.lens.update(this.g, performance.now(), true); this.wake(); this.updateChrome(); if (this.viewOpen) this.ui.setViewMenu(true, this.viewMenuHtml()); }
  cycleLens() { const i = LENSES.findIndex(([m]) => m === this.lens.mode); this.setLens(LENSES[(i + 1) % LENSES.length][0]); const l = LENSES.find(([m]) => m === this.lens.mode)!; this.toast(`Overlay: ${l[1]}`); }
  camAction(a: string) {
    const c = this.world.controls;
    if (a === 'pan' || a === 'rotate') this.camMode = a; else if (a === 'left') c.yaw -= Math.PI / 2; else if (a === 'right') c.yaw += Math.PI / 2; else if (a === 'in') c.dolly(0.8); else if (a === 'out') c.dolly(1.25); else if (a === 'home') this.resetCamera();
  }
  menuAction(a: string) {
    this.menuOpen = false; this.ui.setMenu(false);
    if (a === 'save' || a === 'options') this.openPanel(a); else if (a === 'undo') { const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); this.afterAnyChange(); } else if (a === 'new') { this.autosave(); this.showTitle(); }
    this.updateChrome();
  }
  /** A tool button: the same button again puts the tool down. */
  dockAction(id: string) {
    if (id !== 'inspect' && this.activeTool() === id) id = 'inspect';
    switch (id) {
      case 'inspect': this.setTool({ kind: 'inspect' }); break;
      case 'land': this.setTool({ kind: 'land', mode: 'raise', brush: 1, surf: 0 }); break;
      case 'path': this.setTool({ kind: 'path', queue: false, style: 0, remove: false }); break;
      case 'scenery': case 'newride': this.setTool({ kind: 'inspect' }); this.trayOpen = id; this.trayTab = 0; this.refreshTray(true); break;
      case 'demolish': this.setTool({ kind: 'demolish' }); break;
      case 'report': this.openPanel('report'); break;
      default: this.openPanel(id);
    }
    this.updateChrome();
  }
  // ---------- the park report (the full-screen version, when goals end) ----------
  openReport() {
    const g = this.g; if (!g) return; const el = this.ui.report; el.innerHTML = reportHtml(g); el.classList.add('open'); this.reportOpen = true;
    bindReport(el, g, a => this.reportAct(a, () => this.closeReport()));
  }
  reportAct(a: string, close: () => void) { if (a === 'close') close(); else if (a === 'new') { close(); this.autosave(); this.showTitle(); } else if (a === 'look') { close(); this.viewOnly(true); } }
  closeReport() { this.ui.report.classList.remove('open'); this.ui.report.innerHTML = ''; this.reportOpen = false; }
  /** Hide every panel to look at the park; Esc or the button brings them back. */
  viewOnly(on: boolean) { this.root.classList.toggle('viewonly', on); }
  // ---------- where each screen opens ----------
  /** Tool settings → the tray; rides/guests/staff/money/research/park/messages/report → the Park window;
   *  save/options → the game window; a ride, guest or staff member → the inspector; the builder lives in the bar. */
  openPanel(id: string) {
    this.armed = ''; const [kind, arg] = id.split(':');
    if (kind === 'land' || kind === 'path' || kind === 'scenery' || kind === 'newride') { if (this.trayIdFor() !== kind) { this.trayOpen = kind; this.trayTab = 0; } this.refreshTray(true); return; }
    if (kind === 'build') { this.updateChrome(); return; }
    if (PARK_TABS.some(([w]) => w === kind) && !(kind === 'staff' && arg)) { if (this.winId !== kind) this.winSub = 0; this.winId = kind; this.winOpen = true; this.refreshWin(true); this.updateChrome(); return; }
    if (kind === 'save' || kind === 'options') { this.sysId = kind; this.sysOpen = true; this.panelId = ''; this.ui.inspector.close(); this.refreshSys(true); return; }
    if (this.panelId !== id) this.panelTab = 0; this.panelId = id; this.refreshInsp(true); if (id.startsWith('ride:')) this.selectedRide = +id.slice(5);
  }
  closePanel() { this.panelId = ''; this.ui.inspector.close(); }
  refreshPanel(force = false) { this.refreshInsp(force); this.refreshTray(force); this.refreshWin(force); this.refreshSys(force); }
  refreshInsp(force = false) {
    if (!this.panelId) { if (this.ui.inspector.isOpen) this.ui.inspector.close(); return; } const out = renderPanel(this, this.panelId, this.panelTab); if (!out) { this.closePanel(); return; }
    if (force || this.ui.inspector.id !== this.panelId) this.ui.inspector.open(this.panelId, out.title, out.tabs ?? [], this.panelTab);
    this.ui.inspector.setBody(out.html, out.title);
  }
  /** The tray follows the tool in hand; with nothing in hand it shows what is being browsed (scenery, rides). */
  trayIdFor(): string {
    const t = this.tool;
    switch (t.kind) { case 'land': return 'land'; case 'path': case 'pathAdd': return 'path'; case 'scenery': return 'scenery'; case 'ride': case 'coasterStart': case 'design': return 'newride'; case 'entrance': return 'place'; case 'demolish': return 'bulldoze'; case 'patrol': return 'patrol'; case 'coaster': return ''; default: return this.trayOpen; }
  }
  refreshTray(force = false) {
    const id = this.trayIdFor(); const tray = this.ui.tray; if (!id) { if (tray.isOpen) tray.close(); return; }
    let out: { title: string; tabs?: string[]; html: string } | null;
    if (id === 'place') { const t = this.tool as Extract<Tool, { kind: 'entrance' }>; const r = this.g.rides.find(x => x.id === t.rideId); out = { title: t.exit ? 'Place the exit' : 'Place the entrance', html: `<div class="hint">Click a tile next to ${r ? esc(r.name) : 'the ride'}${r && RIDE_BY_KEY[r.type].kind === 'coaster' ? ' (beside a station piece)' : ''} for the ${t.exit ? 'exit' : 'entrance'}, then join it to a path.</div><div class="acts"><button class="btn" data-a="cancel">Cancel</button></div>` }; }
    else if (id === 'patrol') { const t = this.tool as Extract<Tool, { kind: 'patrol' }>; const s = this.g.staff.find(x => x.id === t.staffId); const n = s?.patrol?.length ?? 0;
      out = { title: `Patrol area · ${s ? esc(s.name) : ''}`, html: `<div class="hint">Click or drag over the map to add 4×4 squares to the area; click a square in it to take it out. ${n ? `${n} square${n === 1 ? '' : 's'}: they stay inside it (a mechanic still answers a breakdown nobody else has).` : 'No squares: the whole park.'}</div><div class="acts"><button class="btn pri" data-a="done">${I.check} Done</button><button class="btn" data-a="clear">Whole park</button></div>` }; }
    else if (id === 'bulldoze') out = { title: 'Bulldoze', html: `<div class="hint">Click paths, scenery, path items or ride huts to remove them; drag to clear a row. To remove a ride, open it and choose Demolish.</div>` };
    else out = renderPanel(this, id, this.trayTab);
    if (!out) return;
    if (force || tray.id !== id) tray.open(id, out.title, out.tabs ?? [], this.trayTab);
    tray.setHead(id === 'place' || id === 'patrol' ? '' : `<button class="btn" data-a="undo" title="Undo (Cmd+Z)">${I.undo} Undo</button>`); tray.setBody(out.html, out.title);
  }
  trayAction(id: string, a: string, el: HTMLElement) {
    if (a === 'undo') { const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); this.afterAnyChange(); }
    else if (a === 'cancel') this.setTool({ kind: 'inspect' });
    else if (id === 'patrol' && this.tool.kind === 'patrol') { const sid = this.tool.staffId; const s = this.g.staff.find(x => x.id === sid); if (a === 'clear' && s) { s.patrol = []; this.lens.update(this.g, performance.now(), true); } if (a === 'done') { this.setTool({ kind: 'inspect' }); this.openPanel('staff:' + sid); } }
    else if (id !== 'place' && id !== 'bulldoze') panelAction(this, id, a, el);
    this.updateChrome(); this.refreshPanel(true);
  }
  refreshWin(force = false) {
    const win = this.ui.win; if (!this.winOpen) { if (win.isOpen) win.close(); return; }
    const id = this.winId;
    if (id === 'report') { if (force || win.id !== 'report') { win.open('report', this.g.parkName); win.setMain(PARK_TABS, id); win.setBody(reportHtml(this.g, true)); bindReport(win.body(), this.g, a => this.reportAct(a, () => { this.winOpen = false; this.refreshWin(); this.updateChrome(); })); } return; }
    // Money has its own tabs; Research is its own tab here, so it is not repeated under Money
    let out = id === 'research' ? renderPanel(this, 'finance', 3) : renderPanel(this, id, this.winSub); if (!out) return;
    if (id === 'research') out = { ...out, tabs: undefined }; else if (id === 'finance') out = { ...out, tabs: out.tabs?.slice(0, 3) };
    if (force || win.id !== id) { win.open(id, this.g.parkName, out.tabs ?? [], this.winSub); win.setMain(PARK_TABS, id); }
    win.setBody(out.html);
  }
  refreshSys(force = false) {
    const sys = this.ui.sys; if (!this.sysOpen) { if (sys.isOpen) sys.close(); return; }
    const out = renderPanel(this, this.sysId, 0); if (!out) return;
    if (force || sys.id !== this.sysId) { sys.open(this.sysId, 'Game', [], 0); sys.setMain(SYS_TABS, this.sysId); }
    sys.setBody(out.html);
  }
  toast(msg: string, err = false) { this.ui.toast(msg, err); }
  report(res: CmdResult): boolean { if (!res.ok) { this.toast(res.error, true); return false; } return true; }
  goTo(s: { kind: string; id?: number; x?: number; y?: number }) { if (s.kind === 'ride' && s.id !== undefined) { const r = this.g.rides.find(x => x.id === s.id); if (r) { this.centerOn(r.x, r.y); this.openPanel('ride:' + r.id); } } else if (s.kind === 'guest' && s.id !== undefined) { const gu = this.g.guests.find(x => x.id === s.id); if (gu) { this.centerOn(gu.x, gu.y); this.openPanel('guest:' + gu.id); } } else if (s.x !== undefined && s.y !== undefined) this.centerOn(s.x, s.y); }
  centerOn(x: number, y: number) { const t = tileAt(this.g, Math.floor(x), Math.floor(y)); this.world.controls.target.set(x, (t ? t.h : 0) * HU, y); }
  setTool(t: Tool) {
    if (this.specialOpen) { this.specialOpen = false; this.ui.setViewMenu(false); }
    // the patrol tool shows the area being painted; putting it down brings back the overlay that was on before
    if (t.kind === 'patrol' && this.tool.kind !== 'patrol') { this.lensBefore = this.lens.mode; this.lens.set('patrol', this.g.staff.find(s => s.id === t.staffId) ?? null); }
    else if (t.kind !== 'patrol' && this.tool.kind === 'patrol') this.lens.set(this.lensBefore);
    this.tool = t; this.lastPath = null; this.trayOpen = ''; this.wake(); if (t.kind !== 'inspect' && t.kind !== 'coaster') this.selectedRide = null; this.world.canvas.style.cursor = t.kind === 'inspect' ? 'default' : 'crosshair'; this.ghostSig = ''; this.updateChrome(); this.refreshPanel(true); }
  rotateTool() { const t = this.tool; if (t.kind === 'scenery' || t.kind === 'ride' || t.kind === 'coasterStart' || t.kind === 'design') { t.rot = (((t.rot + 1) & 3) as Dir); this.ghostSig = ''; } }
  afterTrackChange() { this.wake(); this.refreshPanel(true); this.updateChrome(); this.ghostSig = ''; }
  afterAnyChange() { this.wake(); this.terrain.markAllDirty(); this.scenery.rebuild(); this.ghostSig = ''; this.minimap.dirty(); }
  // ---------- camera ----------
  moveCameraByKeys(dt: number) { const k = this.keys; let dx = 0, dz = 0; const s = 900 * dt; if (k.has('ArrowLeft') || k.has('a')) dx -= s; if (k.has('ArrowRight') || k.has('d')) dx += s; if (k.has('ArrowUp') || k.has('w')) dz -= s; if (k.has('ArrowDown') || k.has('s')) dz += s; if (dx || dz) this.world.controls.pan(dx, dz); }
  canRideCam(rideId: number) { const r = this.g.rides.find(x => x.id === rideId); return !!r && RIDE_BY_KEY[r.type].kind === 'coaster' && r.closedLoop && r.trains.length > 0; }
  toggleRideCam(rideId: number) { if (this.rideCam) { this.rideCam = null; this.world.controls.rideCam = false; this.ui.rideHint.style.display = 'none'; return; } if (!this.canRideCam(rideId)) { this.toast('Open or test the coaster first', true); return; } this.rideCam = { rideId }; this.world.controls.rideCam = true; this.ui.rideHint.style.display = ''; const c = this.world.camera; this.camLerp.copy(c.position); this.camLook.copy(this.world.controls.target); }
  updateRideCam(dt: number) {
    if (!this.rideCam) return; const r = this.g.rides.find(x => x.id === this.rideCam!.rideId); const cv = this.rides.coasterOf(this.rideCam.rideId); if (!r || !cv || !r.trains.length) { this.toggleRideCam(this.rideCam.rideId); return; }
    const tr = r.trains[0]; const f = cv.frameAt(tr.pos + 0.6); const f2 = cv.frameAt(tr.pos + 3.5); if (!f || !f2) return;
    const eye = f.p.clone().addScaledVector(f.up, 0.55); const look = f2.p.clone().addScaledVector(f2.up, 0.45);
    const k = 1 - Math.exp(-dt * 14); this.camLerp.lerp(eye, k); this.camLook.lerp(look, k);
    this.world.camera.position.copy(this.camLerp); this.world.camera.up.copy(f.up).lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize(); this.world.camera.lookAt(this.camLook);
  }
  updateFollow() { if (this.follow === null) return; const gu = this.g.guests.find(x => x.id === this.follow); if (!gu || gu.state === 'left') { this.follow = null; return; } this.world.controls.target.lerp(new THREE.Vector3(gu.x, gu.z * HU, gu.y), 0.1); }
  // ---------- input ----------
  bindInput() {
    const cv = this.world.canvas;
    const wake = () => this.wake(); for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => { if (this.menuOpen) { this.menuOpen = false; this.ui.setMenu(false); this.updateChrome(); } if (this.viewOpen) { this.viewOpen = false; this.ui.setViewMenu(false); this.updateChrome(); } this.mouse.down = true; this.mouse.button = e.button; this.mouse.sx = e.clientX; this.mouse.sy = e.clientY; this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY; this.mouse.dragged = false; if (e.button === 0 && this.tool.kind !== 'inspect' && this.tool.kind !== 'coaster') { if (this.paintable()) this.startPaint(e); else this.applyTool(e); } });
    window.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; const r = cv.getBoundingClientRect(); const inside = e.clientX >= r.left && e.clientY >= r.top && e.clientX <= r.right && e.clientY <= r.bottom && !(e.target as HTMLElement).closest?.('.glass');
      if (this.mouse.down) {
        const dx = e.clientX - this.mouse.lastX, dy = e.clientY - this.mouse.lastY; this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY; if (Math.hypot(e.clientX - this.mouse.sx, e.clientY - this.mouse.sy) > 3) this.mouse.dragged = true;
        const free = this.mouse.button === 0 && (this.tool.kind === 'inspect' || this.tool.kind === 'coaster'); const panning = free && this.camMode === 'pan'; const orbiting = this.mouse.button === 2 || this.mouse.button === 1 || (free && this.camMode === 'rotate');
        if (orbiting) this.world.controls.orbit(dx, dy); else if (panning) { if (this.mouse.dragged) { this.world.controls.pan(-dx, -dy); this.follow = null; } }
        else if (this.paint) this.stretchPaint(e);
        else if (this.mouse.button === 0 && (this.tool.kind === 'path' || this.tool.kind === 'demolish' || this.tool.kind === 'patrol' || (this.tool.kind === 'land' && this.tool.mode !== 'raise' && this.tool.mode !== 'lower'))) this.applyTool(e, true);
      }
      this.hover = inside ? this.tileUnder(e.clientX, e.clientY) : null; if (!inside) this.ui.hideTip(); else this.hoverTip(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', e => { if (!this.mouse.down) return; this.mouse.down = false; if (this.tool.kind === 'patrol') this.tool.add = null; if (this.paint) { this.commitPaint(); return; } if (e.button === 0 && !this.mouse.dragged && (this.tool.kind === 'inspect' || this.tool.kind === 'coaster') && !(e.target as HTMLElement).closest?.('.glass')) this.inspectAt(e.clientX, e.clientY); });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.world.controls.dolly(e.deltaY > 0 ? 1.12 : 0.9); }, { passive: false });
    window.addEventListener('keydown', e => {
      const t = e.target as HTMLElement; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; this.keys.add(e.key); const g = this.g; if (!g || !this.running) return; const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); this.afterAnyChange(); this.refreshPanel(true); return; }
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); this.openPanel('save'); return; }
      switch (e.key) {
        case 'Escape':   // one step back at a time: a question, report, look-only, ride camera, menu, tool, selection, windows
          if (this.armed) { this.armed = ''; this.refreshPanel(true); } else if (this.reportOpen) this.closeReport(); else if (this.root.classList.contains('viewonly')) this.viewOnly(false); else if (this.rideCam) this.toggleRideCam(this.rideCam.rideId);
          else if (this.menuOpen) { this.menuOpen = false; this.ui.setMenu(false); } else if (this.viewOpen) { this.viewOpen = false; this.ui.setViewMenu(false); } else if (this.tool.kind !== 'inspect' || this.trayOpen) this.setTool({ kind: 'inspect' });
          else if (this.panelId) { this.closePanel(); this.selectedRide = null; } else if (this.sysOpen) { this.sysOpen = false; this.refreshSys(); } else if (this.winOpen) { this.winOpen = false; this.refreshWin(); }
          break;
        case 'p': case 'P': case ' ': e.preventDefault(); g.speed = g.speed ? 0 : 1; break;
        case 'o': case 'O': this.cycleLens(); break; case 'u': case 'U': this.setUnder(!GROUND.under); this.toast(GROUND.under ? 'Seeing through the land' : 'Land back'); if (this.viewOpen) this.ui.setViewMenu(true, this.viewMenuHtml()); break; case 'm': case 'M': this.minimap.toggle(); this.wake(); if (this.viewOpen) this.ui.setViewMenu(true, this.viewMenuHtml()); break;
        case '1': case '2': case '3': case '4': g.speed = +e.key as GameState['speed']; break;
        case '+': case '=': this.world.controls.dolly(0.8); break; case '-': case '_': this.world.controls.dolly(1.25); break;
        case 'q': case 'Q': this.world.controls.yaw -= Math.PI / 2; break; case 'e': case 'E': this.world.controls.yaw += Math.PI / 2; break;
        case 'r': case 'R': this.rotateTool(); break;
        case 'c': case 'C': { const id = this.rideCam ? this.rideCam.rideId : this.selectedRide; if (id !== null) this.toggleRideCam(id); else this.toast('Select a coaster first'); break; }
        case 'x': case 'X': this.dockAction('demolish'); break; case 'l': case 'L': this.dockAction('land'); break; case 't': case 'T': this.dockAction('scenery'); break; case 'f': case 'F': this.dockAction('path'); break; case 'n': case 'N': this.dockAction('newride'); break;
        case 'Backspace': case 'Delete': if (this.tool.kind === 'coaster') { e.preventDefault(); this.report(cmdRemovePiece(g, this.tool.rideId)); this.afterTrackChange(); } break;
        case 'Enter': if (this.tool.kind === 'coaster') { e.preventDefault(); this.buildPiece(); } break;
      }
      this.updateChrome();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key)); window.addEventListener('blur', () => this.keys.clear());
  }
  setRay(cx: number, cy: number) { const r = this.world.canvas.getBoundingClientRect(); this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.ndc, this.world.view); }
  tileUnder(cx: number, cy: number): { x: number; y: number; fx: number; fy: number } | null {
    if (!this.terrain) return null; this.setRay(cx, cy); const hits = this.ray.intersectObjects(this.terrain.landTargets, false); if (!hits.length) return null; const p = hits[0].point; const x = Math.floor(p.x + 0.0001), y = Math.floor(p.z + 0.0001);
    if (x < 0 || y < 0 || x >= this.g.w || y >= this.g.h) return null; return { x, y, fx: p.x - x, fy: p.z - y };
  }
  hoverTip(cx: number, cy: number) {
    if (this.tool.kind !== 'inspect') { this.ui.hideTip(); return; } const pick = this.pickAt(cx, cy); if (!pick) { this.ui.hideTip(); return; }
    if (pick.kind === 'ride') { const r = this.g.rides.find(x => x.id === pick.id); if (r) this.ui.showTip(cx, cy, `${r.name}${r.ratings ? ` · E ${(r.ratings.e / 100).toFixed(2)}` : ''}${r.status === 'open' ? '' : ' · ' + r.status}`); }
    else if (pick.kind === 'guest') { const gu = this.g.guests.find(x => x.id === pick.id); if (gu) this.ui.showTip(cx, cy, `${gu.name} · ${gu.state}`); }
    else if (pick.kind === 'staff') { const s = this.g.staff.find(x => x.id === pick.id); if (s) this.ui.showTip(cx, cy, `${s.name} · ${s.state}`); }
    else if (pick.kind === 'scenery') { const t = this.g.tiles[pick.id]; const d = t?.scenery ? SCENERY_BY_KEY[t.scenery.kind] : null; if (d) this.ui.showTip(cx, cy, `${d.name} · lifts nearby rides +${d.value ?? d.excitement}`); }
    else this.ui.hideTip();
  }
  pickAt(cx: number, cy: number): { kind: 'ride' | 'guest' | 'staff' | 'scenery'; id: number } | null {
    this.setRay(cx, cy);
    const ph = this.ray.intersectObject(this.peeps.bodies, false); if (ph.length && ph[0].instanceId !== undefined) { const who = this.peeps.idAt(ph[0].instanceId); if (who) return who; }
    const pg = this.scenery.pieces?.group; if (pg) { const hit = this.ray.intersectObject(pg, true).find(h => h.object.userData.scenery); if (hit) { const [x, y] = hit.object.userData.scenery as [number, number]; return { kind: 'scenery', id: y * this.g.w + x }; } }
    const targets: THREE.Object3D[] = [this.rides.group]; for (const e of this.rides.entries.values()) if (e.coaster) targets.push(e.coaster.group);
    const rh = this.ray.intersectObjects(targets, true); for (const h of rh) { let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.rideId !== undefined) return { kind: 'ride', id: o.userData.rideId }; o = o.parent; } }
    return null;
  }
  inspectAt(cx: number, cy: number) {
    const pick = this.pickAt(cx, cy);
    if (pick?.kind === 'scenery') { this.openPanel(`scen:${pick.id % this.g.w},${Math.floor(pick.id / this.g.w)}`); return; }
    if (pick && pick.kind !== 'ride') { this.openPanel(`${pick.kind}:${pick.id}`); return; }
    let rideId = pick ? pick.id : null;
    if (rideId === null) { const h = this.tileUnder(cx, cy); if (h) { const tile = tileAt(this.g, h.x, h.y)!; rideId = tile.rideId ?? (tile.entrance ? tile.entrance.rideId : tile.tracks.length ? tile.tracks[tile.tracks.length - 1].rideId : null); } }
    if (rideId !== null) { const ride = this.g.rides.find(x => x.id === rideId); if (ride) { const def = RIDE_BY_KEY[ride.type]; this.selectedRide = ride.id; if (def.kind === 'coaster' && !ride.closedLoop) { this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } else this.openPanel('ride:' + ride.id); } return; }
    { const h = this.tileUnder(cx, cy); const p = h ? pieceAt(this.g, h.x, h.y) : null; if (p) { this.selectedRide = null; this.openPanel(`scen:${p.root[0]},${p.root[1]}`); return; } }
    this.selectedRide = null; if (this.tool.kind === 'inspect' && (this.panelId.startsWith('ride:') || this.panelId.startsWith('scen:') || this.panelId.startsWith('guest:') || this.panelId.startsWith('staff:'))) this.closePanel();
  }
  // ---------- painting scenery: a row of hedges or fences, an area of flowers or trees ----------
  paint: { x0: number; y0: number; x1: number; y1: number } | null = null;
  paintable() { const t = this.tool; return t.kind === 'scenery' && !t.remove && sizeOf(t.item) === 1; }
  startPaint(e: MouseEvent) { const h = this.tileUnder(e.clientX, e.clientY); if (h) this.paint = { x0: h.x, y0: h.y, x1: h.x, y1: h.y }; }
  stretchPaint(e: MouseEvent) { const h = this.tileUnder(e.clientX, e.clientY); if (h && this.paint) { this.paint.x1 = h.x; this.paint.y1 = h.y; } }
  /** Hedges and fences go in a line along the longer side of the drag; everything else fills the rectangle. */
  paintTiles(): [number, number][] {
    const p = this.paint, t = this.tool; if (!p || t.kind !== 'scenery') return []; const out: [number, number][] = [];
    if (t.item === 'hedge' || t.item === 'fence_wood') { const horiz = Math.abs(p.x1 - p.x0) >= Math.abs(p.y1 - p.y0); const n = horiz ? Math.abs(p.x1 - p.x0) : Math.abs(p.y1 - p.y0); const sx = Math.sign(p.x1 - p.x0), sy = Math.sign(p.y1 - p.y0); for (let i = 0; i <= n; i++) out.push(horiz ? [p.x0 + i * sx, p.y0] : [p.x0, p.y0 + i * sy]); }
    else for (let y = Math.min(p.y0, p.y1); y <= Math.max(p.y0, p.y1); y++) for (let x = Math.min(p.x0, p.x1); x <= Math.max(p.x0, p.x1); x++) out.push([x, y]);
    return out.slice(0, 400);
  }
  commitPaint() {
    const t = this.tool, tiles = this.paintTiles(); this.paint = null; if (t.kind !== 'scenery') return; const g = this.g; const p0 = tiles[0], p1 = tiles[tiles.length - 1];
    const rot = (t.item === 'hedge' || t.item === 'fence_wood') && tiles.length > 1 ? (p0[1] === p1[1] ? 0 : 1) as Dir : t.rot;
    let placed = 0, cost = 0, why = '';
    undoGroup(() => { for (const [x, y] of tiles) { const r = cmdScenery(g, x, y, t.item, rot, t.colour); if (r.ok) { placed++; cost += r.cost; } else why = r.error; } }, () => `${placed} × ${SCENERY_BY_KEY[t.item]?.name ?? 'scenery'}`);
    if (placed) { this.scenery.rebuild(); if (tiles.length > 1) this.toast(`Placed ${placed} × ${SCENERY_BY_KEY[t.item]?.name.toLowerCase()}${g.noMoney ? '' : ` · ${money(cost)}`}${placed < tiles.length ? ` (${tiles.length - placed} tiles were in the way)` : ''}`); } else if (why) this.toast(why, true);
    this.ui.hideTip();
  }
  closeScenPanel() { if (this.panelId.startsWith('scen:')) this.closePanel(); }
  applyTool(e: MouseEvent, drag = false) {
    const g = this.g; const h = this.tileUnder(e.clientX, e.clientY); if (!h) return; const t = this.tool;
    if (drag && this.lastPath && this.lastPath.x === h.x && this.lastPath.y === h.y) return; this.lastPath = h;
    const dirty = () => this.terrain.markDirty(h.x, h.y);
    switch (t.kind) {
      case 'land': { let ok = false; const off = Math.floor((t.brush - 1) / 2); if (t.mode === 'raise' || t.mode === 'lower') { const corner = t.brush === 1 ? nearCorner(h) : -1; ok = this.report(cmdLand(g, h.x - off, h.y - off, t.mode === 'raise' ? 1 : -1, t.brush, { corner: corner >= 0 ? corner : undefined, cliffs: t.cliffs })); } else if (t.mode === 'water' || t.mode === 'drain') ok = this.report(cmdWater(g, h.x - off, h.y - off, t.mode === 'water' ? 1 : -1, t.brush)); else if (t.mode === 'buy') ok = this.report(cmdBuyLand(g, h.x, h.y)); else if (t.mode === 'surface') { for (let yy = 0; yy < t.brush; yy++) for (let xx = 0; xx < t.brush; xx++) cmdSurface(g, h.x + xx - Math.floor((t.brush - 1) / 2), h.y + yy - Math.floor((t.brush - 1) / 2), t.surf); ok = true; }
        if (ok) { const m = t.mode === 'raise' || t.mode === 'lower' ? 15 : 1; /* a slope can spread up to 14 tiles */ for (let yy = -m; yy < t.brush + m; yy += 2) for (let xx = -m; xx < t.brush + m; xx += 2) this.terrain.markDirty(h.x + xx - off, h.y + yy - off); for (let yy = -1; yy <= t.brush; yy++) for (let xx = -1; xx <= t.brush; xx++) this.terrain.markDirty(h.x + xx - off, h.y + yy - off); this.scenery.rebuild(); } break; }
      case 'path': { if (t.remove) { if (this.report(cmdRemovePath(g, h.x, h.y))) dirty(); break; }
        const L = t.level;
        if (L && L.z === null) { const p = pathFor(tileAt(g, h.x, h.y)); if (!p) { if (!drag) this.toast('Click a path to build from its height', true); break; } L.z = p.z + (p.slope === -1 ? 0 : LAND_STEP); L.last = { x: h.x, y: h.y }; this.refreshTray(true); break; }
        let at: { z: number; slope: Dir | -1 } | undefined; let next = L?.z ?? 0;
        if (L && L.z !== null) { const d = L.last ? DX.findIndex((dx, i) => L.last!.x + dx === h.x && L.last!.y + DY[i] === h.y) : -1;
          if (d >= 0 && L.ramp === 1) { at = { z: L.z, slope: d as Dir }; next = L.z + LAND_STEP; } else if (d >= 0 && L.ramp === -1) { at = { z: L.z - LAND_STEP, slope: ((d + 2) & 3) as Dir }; next = L.z - LAND_STEP; } else at = { z: L.z, slope: -1 }; }
        const r = cmdPath(g, h.x, h.y, t.queue, t.style, at); if (!r.ok && !drag) this.toast(r.error, true); else if (r.ok) { if (L) { L.z = next; L.last = { x: h.x, y: h.y }; this.refreshTray(true); } dirty(); this.scenery.rebuild(); } break; }
      case 'pathAdd': if (this.report(cmdPathAdd(g, h.x, h.y, t.what))) dirty(); break;
      case 'patrol': { const s = g.staff.find(x => x.id === t.staffId); if (!s) { this.setTool({ kind: 'inspect' }); break; } const c = patrolCell(g, h.x, h.y); const has = (s.patrol ?? []).includes(c); if (t.add === null) t.add = !has;
        if (t.add && !has) s.patrol = [...(s.patrol ?? []), c]; else if (!t.add && has) s.patrol = (s.patrol ?? []).filter(x => x !== c); this.lens.update(g, performance.now(), true); this.refreshTray(true); break; }
      case 'scenery': { if (t.remove) { if (this.report(cmdRemoveScenery(g, h.x, h.y))) { this.scenery.rebuild(); this.closeScenPanel(); } } else { const off = Math.floor((sizeOf(t.item) - 1) / 2); if (this.report(cmdScenery(g, h.x - off, h.y - off, t.item, t.rot, t.colour))) this.scenery.rebuild(); } break; }
      case 'demolish': { const tile = tileAt(g, h.x, h.y)!; const top = pathFor(tile); if (top && (top.adds.bench || top.adds.lamp || top.adds.bin !== undefined) && !drag) { top.adds = {}; dirty(); } else if (top) { if (this.report(cmdRemovePath(g, h.x, h.y))) dirty(); } else if (tile.scenery) { if (this.report(cmdRemoveScenery(g, h.x, h.y))) this.scenery.rebuild(); } else if (tile.entrance && !drag) { const r = g.rides.find(x => x.id === tile.entrance!.rideId); if (r) { if (tile.entrance.exit) r.exit = null; else r.entrance = null; tile.entrance = null; } } else if (!drag) this.toast('Nothing to remove here'); break; }
      case 'ride': { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); const out: { ride?: Ride; conn?: ConnectResult } = {};
        undoGroup(() => { if (!this.report(cmdPlaceRide(g, t.type, h.x - off, h.y - off, t.rot))) return; out.ride = g.rides[g.rides.length - 1]; if (this.autoConnect) out.conn = autoConnect(g, out.ride.id); }, () => 'place ' + def.name);
        const ride = out.ride, conn = out.conn; if (!ride) break; this.selectedRide = ride.id; if (conn?.ok) this.afterAnyChange();
        if (def.kind === 'stall') { this.openPanel('ride:' + ride.id); if (conn && !conn.ok) this.toast(`${conn.why}. Join the counter to a path by hand.`, true); }
        else if (conn?.ok) { openRide(g, ride); this.toast(`${ride.name} is open${conn.paths ? ` · ${conn.paths} path tile${conn.paths === 1 ? '' : 's'} laid` : ''}${g.noMoney ? '' : ` · ${money(conn.cost)}`}`); this.setTool({ kind: 'inspect' }); this.openPanel('ride:' + ride.id); }
        else { this.toast(conn ? `${conn.why}. Place the entrance by hand.` : 'Now place the entrance next to the ride', !!conn); this.setTool({ kind: 'entrance', rideId: ride.id, exit: false }); }
        break; }
      case 'design': { const d = DESIGN_BY_KEY[t.key]; const res = cmdBuildDesign(g, t.key, h.x, h.y, t.rot); if (!res.ok) { this.toast(`${d?.name ?? 'Design'}: ${res.why}`, true); break; }
        const ride = g.rides.find(x => x.id === res.rideId)!; this.selectedRide = ride.id; this.toast(`${ride.name} built${g.noMoney ? '' : ` · ${money(res.cost)}`}`); this.afterTrackChange(); this.finishCoaster(ride);
        if (!this.autoConnect) { this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } break; }
      case 'coasterStart': { const r = cmdStartCoaster(g, t.type, h.x, h.y, t.rot); if (this.report(r)) { const ride = g.rides[g.rides.length - 1]; this.selectedRide = ride.id; this.buildSel = { ...freshSel(), special: 'endStation' }; this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } break; }
      case 'entrance': { const r = cmdPlaceEntrance(g, t.rideId, h.x, h.y, t.exit); if (this.report(r)) { const ride = g.rides.find(x => x.id === t.rideId)!; if (!t.exit) { this.toast('Now place the exit'); this.setTool({ kind: 'entrance', rideId: t.rideId, exit: true }); } else { const def = RIDE_BY_KEY[ride.type]; if (def.kind === 'coaster') { this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } else { this.setTool({ kind: 'inspect' }); this.openPanel('ride:' + ride.id); } } } break; }
    }
  }
  // ---------- coaster building ----------
  /** The piece the construction choices build where the track ends (RCT's choice, transitions included). */
  currentPieceKey(): string | null {
    const t = this.tool; if (t.kind !== 'coaster') return null; const r = this.g.rides.find(x => x.id === t.rideId); return r ? pieceFor(this.g, r, this.buildSel) : null;
  }
  /** Finish circuit: plan and build the rest of the track; then connect, test and open as when the last piece goes on by hand. */
  finishCircuit(rideId: number) {
    const ride = this.g.rides.find(x => x.id === rideId); if (!ride) return; const res = buildCircuit(this.g, rideId);
    if (!res.ok) { this.toast(res.why ?? 'Could not finish the circuit', true); return; }
    this.toast(`Circuit finished · ${res.pieces} pieces${this.g.noMoney ? '' : ` · ${money(res.cost)}`}`); this.afterTrackChange(); this.finishCoaster(ride);
  }
  buildPiece() {
    const t = this.tool; if (t.kind !== 'coaster') return; const key = this.currentPieceKey(); if (!key) { this.toast('That combination is not a track piece', true); return; }
    const ride = this.g.rides.find(x => x.id === t.rideId); if (!ride) return;
    const r = cmdAddPiece(this.g, t.rideId, key, this.buildSel.chain);
    if (this.report(r)) {
      if (ride.closedLoop) this.finishCoaster(ride);
      // after a special piece the window goes back to the plain choices, keeping the pitch and bank the track now has
      const s = this.buildSel; if (s.special && !(PIECE_BY_KEY[key].station && ride.pieces.length < 3)) { const end = coasterCursor(this.g, ride); this.buildSel = { ...s, special: null, curve: 'none', pitch: end?.pitch ?? 'none', roll: end?.roll ?? 'none' }; if (!pieceFor(this.g, ride, this.buildSel)) this.buildSel = choose(this.g, ride, this.buildSel, 'curve', 'none'); }
    }
    this.afterTrackChange();
  }
  /** The circuit is complete: with auto-connect on, the coaster gets its huts and paths, is tested and opens. */
  finishCoaster(ride: Ride) {
    const g = this.g; if (!this.autoConnect) { this.toast('Circuit complete! Place the entrance and exit, then test it.'); return; }
    const conn = autoConnect(g, ride.id); if (conn.ok) this.afterAnyChange();
    if (!conn.ok) { this.toast(`Circuit complete. ${conn.why}: place the entrance and exit by hand.`, true); return; }
    testRide(g, ride);
    if (ride.stats?.completed && openRide(g, ride) === null) { this.toast(`${ride.name} tested and open · excitement ${ride.ratings ? fmtRating(ride.ratings.e) : '?'}`); this.setTool({ kind: 'inspect' }); this.selectedRide = ride.id; this.openPanel('ride:' + ride.id); }
    else this.toast(`Connected, but the test failed: ${ride.stats?.failReason ?? 'unknown'}`, true);
  }
  setAutoConnect(on: boolean) { this.autoConnect = on; try { localStorage.setItem('rct.autoconnect', on ? 'on' : 'off'); } catch {} }
  // ---------- ghosts ----------
  updateGhost() {
    const g = this.g, t = this.tool, h = this.hover; let sig = ''; let want: (() => THREE.Object3D) | null = null; let hiTile: { x: number; y: number; n: number; ok: boolean } | null = null;
    if (t.kind === 'coaster') { const ride = g.rides.find(x => x.id === t.rideId); const key = this.currentPieceKey(); if (ride && key) { const at = coasterCursor(g, ride) ?? { x: ride.x, y: ride.y, z: tileAt(g, ride.x, ride.y)!.h + 2, dir: ride.rot }; const why = checkPiece(g, ride, key, at); const def = PIECE_BY_KEY[key]; const piece = { type: key, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: this.buildSel.chain && !!def.chainable, bank: 0 as const }; sig = `piece:${key}:${at.x},${at.y},${at.z},${at.dir},${why ? 0 : 1}`; want = () => pieceGhost(g, ride, piece, !why); } }
    else if (h) {
      if (t.kind === 'land') hiTile = { x: h.x - Math.floor((t.brush - 1) / 2), y: h.y - Math.floor((t.brush - 1) / 2), n: (t.mode === 'raise' || t.mode === 'lower' || t.mode === 'surface') ? t.brush : 1, ok: true };
      else if (t.kind === 'path' || t.kind === 'pathAdd' || t.kind === 'demolish' || t.kind === 'coasterStart') hiTile = { x: h.x, y: h.y, n: 1, ok: true };
      else if (t.kind === 'patrol') hiTile = { x: Math.floor(h.x / 4) * 4, y: Math.floor(h.y / 4) * 4, n: 4, ok: true };
      else if (t.kind === 'scenery' && !t.remove) { const n = sizeOf(t.item), off = Math.floor((n - 1) / 2); hiTile = { x: h.x - off, y: h.y - off, n, ok: true }; sig = `scen:${t.item}:${t.rot}:${t.colour ?? ''}`; const item = t.item, rot = t.rot, colour = t.colour;
        want = () => { if (isPieceKind(item)) { const d = drawPiece(item, FINE, 0, colour).group; d.traverse(o => { if ((o as any).isLineSegments2) o.visible = false; else if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = MAT_GHOST; }); d.rotation.y = -rot * Math.PI / 2; return d; } const m = new THREE.Mesh(sceneryGeometry(item), MAT_GHOST); m.rotation.y = -rot * Math.PI / 2; return m; }; }
      else if (t.kind === 'scenery') hiTile = { x: h.x, y: h.y, n: 1, ok: false };
      else if (t.kind === 'ride') { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); const x = h.x - off, y = h.y - off; const ok = dryRun(g, () => dry(() => cmdPlaceRide(g, t.type, x, y, t.rot))); hiTile = { x, y, n: def.size, ok }; sig = `ride:${t.type}:${t.rot}:${ok ? 1 : 0}`; const type = t.type, rot = t.rot; want = () => { const fake = { id: -1, type, name: '', x: 0, y: 0, rot, colours: [0, 1, 2], running: true, pieces: [], trains: [] } as any; const m = rideModel(fake); m.group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ok ? MAT_GHOST : MAT_BLOCKED; }); return m.group; }; }
      else if (t.kind === 'design') { const at = `design:${t.key}:${t.rot}:${h.x},${h.y}`;
        if (this.designCheck.at !== at) { let why = ''; dryRun(g, () => trial(() => { const r = cmdBuildDesign(g, t.key, h.x, h.y, t.rot); why = r.ok ? '' : r.why ?? 'blocked'; return false; })); this.designCheck = { at, why }; }
        const why = this.designCheck.why; hiTile = { x: h.x, y: h.y, n: 1, ok: !why }; sig = at + (why ? ':0' : ':1');
        if (sig !== this.ghostSig) { const pieces = designPieces(g, t.key, h.x, h.y, t.rot), ok = !why; want = () => trackGhost(g, pieces, ok); if (why) this.ui.showTip(this.mouse.x, this.mouse.y, why); else this.ui.hideTip(); } }
      else if (t.kind === 'entrance') { hiTile = { x: h.x, y: h.y, n: 1, ok: true }; sig = `hut:${t.exit ? 1 : 0}`; const exit = t.exit; want = () => { const m = hutModel(exit); m.material = MAT_GHOST; return m; }; }
    }
    // tile highlight
    let hw = hiTile?.n ?? 1, hd = hiTile?.n ?? 1;
    if (this.paint && t.kind === 'scenery') { const tiles = this.paintTiles(); const xs = tiles.map(p => p[0]), ys = tiles.map(p => p[1]); hiTile = { x: Math.min(...xs), y: Math.min(...ys), n: 1, ok: true }; hw = Math.max(...xs) - hiTile.x + 1; hd = Math.max(...ys) - hiTile.y + 1;
      const d = SCENERY_BY_KEY[t.item]; this.ui.showTip(this.mouse.x, this.mouse.y, `${tiles.length} × ${d?.name.toLowerCase()}${g.noMoney ? '' : ` · ${money((d?.cost ?? 0) * tiles.length)}`}`); }
    if (hiTile) { const tile = tileAt(g, hiTile.x, hiTile.y); const L = t.kind === 'path' && !t.remove ? t.level : undefined; const corner = t.kind === 'land' && (t.mode === 'raise' || t.mode === 'lower') && t.brush === 1 && h ? nearCorner(h) : -1;
      let hh = tile ? Math.max(landTop(tile), waterZ(tile) ?? 0) * HU : 0; if (L && L.z !== null) hh = L.z * HU; else if (t.kind === 'pathAdd' || t.kind === 'demolish') { const p = pathFor(tile); if (p) hh = (p.z + (p.slope === -1 ? 0 : LAND_STEP / 2)) * HU; }
      this.tileHi.visible = true; this.tileHi.position.set(hiTile.x + hw / 2, hh + 0.06, hiTile.y + hd / 2); this.tileHi.scale.set(hw, hd, 1);
      if (corner >= 0 && tile) { const [ox, oy] = CORNER_OFF[corner]; this.tileHi.position.set(hiTile.x + 0.15 + ox * 0.7, corners(tile)[corner] * HU + 0.06, hiTile.y + 0.15 + oy * 0.7); this.tileHi.scale.set(0.3, 0.3, 1); } (this.tileHi.material as THREE.MeshBasicMaterial).color.setHex(hiTile.ok ? 0xffe14d : 0xff4d4d); } else this.tileHi.visible = false;
    // model ghost
    if (sig !== this.ghostSig) { if (this.ghost) { this.world.scene.remove(this.ghost); this.ghost = null; } this.ghostSig = sig; if (want) { this.ghost = want(); this.world.scene.add(this.ghost); } }
    if (this.ghost && h && t.kind !== 'coaster' && t.kind !== 'design') { const tile = tileAt(g, h.x, h.y); const hh = tile ? tile.h * HU : 0; if (t.kind === 'ride') { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); this.ghost.position.set(h.x - off + def.size / 2, hh, h.y - off + def.size / 2); } else if (t.kind === 'scenery') { const n = sizeOf(t.item), off = Math.floor((n - 1) / 2); this.ghost.position.set(h.x - off + n / 2, hh, h.y - off + n / 2); } else this.ghost.position.set(h.x + 0.5, hh, h.y + 0.5); if (t.kind === 'entrance') this.ghost.rotation.y = 0; }
    if (this.ghost && !h && t.kind !== 'coaster' && t.kind !== 'design') this.ghost.visible = false; else if (this.ghost) this.ghost.visible = true;
  }
}
/** The corner (0–3) the pointer is near, for raising one corner of a tile; -1 in the middle. */
function nearCorner(h: { fx: number; fy: number }): number { const i = CORNER_OFF.findIndex(([ox, oy]) => Math.hypot(h.fx - ox, h.fy - oy) < 0.3); return i; }
/** Run a check that builds and takes it back, leaving the park exactly as it was: the dice and the next ride number too. */
function dryRun<T>(g: GameState, fn: () => T): T { const rng = g.rng, next = g.nextRideId; try { return fn(); } finally { g.rng = rng; g.nextRideId = next; } }
function dry(fn: () => CmdResult): boolean { const r = fn(); if (r.ok) { undo(); return true; } return false; }
