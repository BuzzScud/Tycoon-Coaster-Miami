// The 3D game: world + views + dock interface + tools + input. The rules live in ../sim and are shared with the 2D fallback.
import * as THREE from 'three';
import { type GameState, type Dir, TICKS_PER_SEC, LAND_STEP } from '../sim/types';
import { tick, cmdLand, cmdWater, cmdPath, cmdRemovePath, cmdScenery, cmdRemoveScenery, cmdPlaceRide, cmdPlaceEntrance, cmdAddPiece, cmdRemovePiece, cmdStartCoaster, cmdPathAdd, cmdBuyLand, cmdSurface, checkPiece, coasterCursor, undo, type CmdResult } from '../sim/game';
import { tileAt } from '../sim/map';
import { RIDE_BY_KEY } from '../sim/rides';
import { PIECE_BY_KEY } from '../sim/track';
import { monthFraction } from '../sim/time';
import { writeSlot } from '../sim/save';
import type { Tool, BuildSel } from '../ui/app';
import { World, HU, MAT_GHOST, MAT_BLOCKED } from '../three/world';
import { TerrainView } from '../three/terrain';
import { SceneryView, sceneryGeometry } from '../three/scenery';
import { PeepsView } from '../three/peeps';
import { RidesView } from '../three/rides';
import { WeatherFx } from '../three/weather';
import { rideModel, hutModel } from '../three/models';
import { pieceGhost } from '../three/coaster';
import { DockUI } from './ui';
import { renderPanel, panelAction } from './panels3d';
import { I } from './icons';

export class App3D {
  g!: GameState; ui: DockUI; world: World; terrain!: TerrainView; scenery!: SceneryView; peeps!: PeepsView; rides!: RidesView; weather!: WeatherFx;
  tool: Tool = { kind: 'inspect' }; buildSel: BuildSel = { dir: 'straight', slope: 'level', bank: 0, chain: false, special: null };
  hover: { x: number; y: number } | null = null; mouse = { x: 0, y: 0, down: false, button: 0, sx: 0, sy: 0, dragged: false, lastX: 0, lastY: 0 };
  running = false; last = performance.now(); acc = 0; uiTimer = 0; time = 0; lastAutosaveMonth = -1; lastPath: { x: number; y: number } | null = null; keys = new Set<string>();
  panelId = ''; panelTab = 0; selectedRide: number | null = null; follow: number | null = null; rideCam: { rideId: number } | null = null; camLerp = new THREE.Vector3(); camLook = new THREE.Vector3();
  ghost: THREE.Object3D | null = null; ghostSig = ''; tileHi: THREE.Mesh; ray = new THREE.Raycaster(); ndc = new THREE.Vector2(); frameTimes: number[] = [];
  constructor(public root: HTMLElement) {
    this.ui = new DockUI(root, id => this.dockAction(id), g => this.start(g));
    const canvas = root.querySelector('#view3d') as HTMLCanvasElement; this.world = new World(canvas);
    this.tileHi = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.35, depthWrite: false })); this.tileHi.rotation.x = -Math.PI / 2; this.tileHi.visible = false; this.tileHi.renderOrder = 4; this.world.scene.add(this.tileHi);
    this.ui.onInspAction = (a, el) => { panelAction(this, this.panelId, a, el); }; this.ui.onInspTab = i => { this.panelTab = i; this.refreshPanel(true); }; this.ui.onClose = () => { this.panelId = ''; if (this.tool.kind !== 'inspect' && this.tool.kind !== 'demolish') this.setTool({ kind: 'inspect' }); };
    this.bindInput(); new ResizeObserver(() => this.resize()).observe(root); this.resize();
  }
  // ---------- lifecycle ----------
  start(g: GameState) {
    this.g = g; this.ui.hideTitle();
    if (!this.terrain) { this.terrain = new TerrainView(this.world.scene, g); this.scenery = new SceneryView(this.world.scene, g); this.peeps = new PeepsView(this.world.scene, g); this.rides = new RidesView(this.world.scene, g); this.weather = new WeatherFx(this.world.scene, g); }
    else { this.terrain.setGame(g); this.scenery.setGame(g); this.peeps.setGame(g); this.rides.setGame(g); this.weather.setGame(g); }
    this.tool = { kind: 'inspect' }; this.panelId = ''; this.ui.closeInspector(); this.rideCam = null; this.world.controls.rideCam = false; this.ui.rideHint.style.display = 'none';
    this.resetCamera(); this.lastAutosaveMonth = g.monthsElapsed; this.running = true; this.last = performance.now(); this.acc = 0; this.updateChrome();
    if (!(this as any)._loop) { (this as any)._loop = true; requestAnimationFrame(t => this.frame(t)); }
  }
  showTitle() { this.running = false; this.ui.showTitle(); }
  resetCamera() { const c = this.world.controls; c.target.set(this.g.entrance.x + 1, 0, this.g.entrance.y - 8); c.distance = 34; c.yaw = Math.PI; c.pitch = 0.85; }
  resize() { const w = this.root.clientWidth || window.innerWidth, h = this.root.clientHeight || window.innerHeight; this.world.resize(w, h); }
  autosave() { const err = writeSlot('autosave', this.g, this.g.parkName, ''); if (err) this.toast(err, true); }
  frame(now: number) {
    requestAnimationFrame(t => this.frame(t)); if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.time += dt; const g = this.g;
    this.moveCameraByKeys(dt);
    if (g.speed > 0) { const mult = [0, 1, 2, 4, 8][g.speed]; this.acc += dt * TICKS_PER_SEC * mult; let n = 0; const maxTicks = 40 * mult; while (this.acc >= 1 && n < maxTicks) { tick(g); this.acc--; n++; } if (n >= maxTicks) this.acc = 0; }
    // views
    this.terrain.update(); this.terrain.animate(this.time); this.rides.sync(this.time); this.peeps.update(this.time);
    const light = this.lightLevel(); this.world.setSky(light, g.weather.gloom, monthFraction(g)); this.weather.update(dt, this.world.controls.target, light);
    this.updateGhost(); this.updateRideCam(dt); this.updateFollow();
    this.world.controls.clampTarget(g.w, g.h); this.world.render();
    this.uiTimer += dt; if (this.uiTimer > 0.25) { this.uiTimer = 0; this.updateChrome(); this.refreshPanel(); }
    if (g.monthsElapsed !== this.lastAutosaveMonth) { this.lastAutosaveMonth = g.monthsElapsed; this.autosave(); }
    this.frameTimes.push(dt); if (this.frameTimes.length > 60) this.frameTimes.shift();
  }
  lightLevel(): number { const f = monthFraction(this.g); const day = 0.5 + 0.5 * Math.cos(f * Math.PI * 2); return Math.max(0.12, (0.25 + 0.75 * day)); }
  // ---------- chrome ----------
  updateChrome() {
    const g = this.g; this.ui.setTop(g, ''); const t = this.tool;
    this.ui.setDockActive(t.kind === 'inspect' ? 'inspect' : t.kind === 'land' ? 'land' : t.kind === 'path' || t.kind === 'pathAdd' ? 'path' : t.kind === 'scenery' ? 'scenery' : t.kind === 'demolish' ? 'demolish' : 'newride');
    let rail = '';
    if (t.kind === 'coaster') { const r = g.rides.find(x => x.id === t.rideId); const s = this.buildSel; const key = this.currentPieceKey();
      const sq = (icon: string, a: string, on: boolean, tip: string) => `<button class="btn sq ${on ? 'on' : ''}" data-ra="${a}" title="${tip}">${I[icon]}</button>`;
      rail = `<div class="g"><span class="lab">Direction</span>${sq('curveL2', 'dir:left2', s.dir === 'left2' && !s.special, 'Large left')}${sq('curveL', 'dir:left', s.dir === 'left' && !s.special, 'Small left')}${sq('straight', 'dir:straight', s.dir === 'straight' && !s.special, 'Straight')}${sq('curveR', 'dir:right', s.dir === 'right' && !s.special, 'Small right')}${sq('curveR2', 'dir:right2', s.dir === 'right2' && !s.special, 'Large right')}</div><div class="g"><span class="lab">Slope</span>${sq('steepDown', 'slope:steepDown', s.slope === 'steepDown' && !s.special, 'Steep down')}${sq('down', 'slope:down', s.slope === 'down' && !s.special, 'Down')}${sq('level', 'slope:level', s.slope === 'level' && !s.special, 'Level')}${sq('up', 'slope:up', s.slope === 'up' && !s.special, 'Up')}${sq('steepUp', 'slope:steepUp', s.slope === 'steepUp' && !s.special, 'Steep up')}${sq('chain', 'chain', s.chain, 'Chain lift')}</div><div class="g"><span class="lab">Bank</span>${sq('bankL', 'bank:-1', s.bank === -1, 'Left')}${sq('level', 'bank:0', s.bank === 0, 'None')}${sq('bankR', 'bank:1', s.bank === 1, 'Right')}</div><div class="g"><span class="lab">Special</span>${sq('station', 'sp:station', s.special === 'station', 'Station')}${sq('loop', 'sp:loop', s.special === 'loop', 'Loop')}${sq('sbendL', 'sp:sbendL', s.special === 'sbendL', 'S-bend L')}${sq('sbendR', 'sp:sbendR', s.special === 'sbendR', 'S-bend R')}${sq('brakes', 'sp:brakes', s.special === 'brakes', 'Brakes')}${sq('booster', 'sp:booster', s.special === 'booster', 'Booster')}${sq('photo', 'sp:photo', s.special === 'photo', 'Photo')}</div><div class="right"><span>${key ? PIECE_BY_KEY[key].name : 'turns must be level'}${r ? ` · ${r.pieces.length} pieces` : ''}</span><button class="btn" data-ra="remove" title="Backspace">${I.back} Remove</button><button class="btn pri" data-ra="build" title="Enter">${I.check} Build piece</button>${r?.closedLoop ? `<button class="btn" data-ra="ridewin">${I.eye} Details</button>` : ''}</div>`;
    } else {
      const n = g.news[0]; const fresh = n && g.tick - n.tick < 2400;
      const hint = t.kind === 'inspect' ? 'Click a ride, guest or staff member to inspect it. Drag to pan, right-drag to orbit, scroll to zoom.' : t.kind === 'land' ? 'Click tiles to shape the land.' : t.kind === 'path' ? 'Click or drag to lay path.' : t.kind === 'scenery' ? 'Click a tile to place scenery. R rotates.' : t.kind === 'ride' || t.kind === 'coasterStart' ? 'Click the map to place it. R rotates.' : t.kind === 'entrance' ? `Click a tile next to the ride for the ${t.exit ? 'exit' : 'entrance'}.` : t.kind === 'demolish' ? 'Click paths, scenery or huts to remove them.' : t.kind === 'pathAdd' ? 'Click a path tile.' : '';
      rail = `<div class="news" data-ra="news">${fresh ? `<span class="ic">${I[n!.icon === 'guest' ? 'smile' : (I[n!.icon] ? n!.icon : 'info')]}</span><span>${n!.text}</span>` : `<span>${hint}</span>`}</div><div class="right"><button class="btn sq" data-ra="undo" title="Undo (Cmd+Z)">${I.undo}</button><button class="btn sq" data-ra="rotcam" title="Rotate view (Q / E)">${I.rotate}</button><button class="btn sq" data-ra="zoomin" title="Zoom in (+)">${I.zoomin}</button><button class="btn sq" data-ra="zoomout" title="Zoom out (−)">${I.zoomout}</button>${this.selectedRide !== null && this.canRideCam(this.selectedRide) ? `<button class="btn" data-ra="ridecam">${I.camera} Ride it</button>` : ''}<button class="btn" data-ra="news">${I.news} Messages</button></div>`;
    }
    if (this.ui.setRail(rail)) this.ui.rail.querySelectorAll<HTMLElement>('[data-ra]').forEach(el => { el.onclick = () => this.railAction(el.dataset.ra!); });
  }
  railAction(a: string) {
    const s = this.buildSel;
    if (a.startsWith('dir:')) { s.dir = a.slice(4) as any; s.special = null; if (s.dir !== 'straight') s.slope = 'level'; } else if (a.startsWith('slope:')) { s.slope = a.slice(6) as any; s.special = null; if (s.slope !== 'level') s.dir = 'straight'; } else if (a.startsWith('bank:')) s.bank = +a.slice(5) as any; else if (a === 'chain') s.chain = !s.chain; else if (a.startsWith('sp:')) s.special = a.slice(3);
    else if (a === 'build') this.buildPiece(); else if (a === 'remove') { if (this.tool.kind === 'coaster') { this.report(cmdRemovePiece(this.g, this.tool.rideId)); this.afterTrackChange(); } } else if (a === 'ridewin') { if (this.tool.kind === 'coaster') this.openPanel('ride:' + this.tool.rideId); }
    else if (a === 'undo') { const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); this.afterAnyChange(); } else if (a === 'rotcam') this.world.controls.yaw += Math.PI / 2; else if (a === 'zoomin') this.world.controls.dolly(0.8); else if (a === 'zoomout') this.world.controls.dolly(1.25); else if (a === 'ridecam') { if (this.selectedRide !== null) this.toggleRideCam(this.selectedRide); } else if (a === 'news') this.openPanel('news');
    this.updateChrome(); this.refreshPanel(true);
  }
  dockAction(id: string) {
    switch (id) {
      case 'inspect': this.setTool({ kind: 'inspect' }); this.closePanel(); break;
      case 'land': this.setTool({ kind: 'land', mode: 'raise', brush: 1, surf: 0 }); this.openPanel('land'); break;
      case 'path': this.setTool({ kind: 'path', queue: false, style: 0, remove: false }); this.openPanel('path'); break;
      case 'scenery': this.openPanel('scenery'); break;
      case 'newride': this.openPanel('newride'); break;
      case 'demolish': this.setTool({ kind: 'demolish' }); this.closePanel(); break;
      default: this.openPanel(id);
    }
  }
  openPanel(id: string) { if (this.panelId !== id) this.panelTab = 0; this.panelId = id; this.refreshPanel(true); if (id.startsWith('ride:')) this.selectedRide = +id.slice(5); }
  closePanel() { this.panelId = ''; this.ui.closeInspector(); }
  refreshPanel(force = false) {
    if (!this.panelId) return; const out = renderPanel(this, this.panelId, this.panelTab); if (!out) { this.closePanel(); return; }
    if (force || this.ui.inspId !== this.panelId) this.ui.openInspector(this.panelId, out.title, out.tabs ?? [], this.panelTab);
    this.ui.setInspector(out.html, out.title);
  }
  toast(msg: string, err = false) { this.ui.toast(msg, err); }
  report(res: CmdResult): boolean { if (!res.ok) { this.toast(res.error, true); return false; } return true; }
  goTo(s: { kind: string; id?: number; x?: number; y?: number }) { if (s.kind === 'ride' && s.id !== undefined) { const r = this.g.rides.find(x => x.id === s.id); if (r) { this.centerOn(r.x, r.y); this.openPanel('ride:' + r.id); } } else if (s.kind === 'guest' && s.id !== undefined) { const gu = this.g.guests.find(x => x.id === s.id); if (gu) { this.centerOn(gu.x, gu.y); this.openPanel('guest:' + gu.id); } } else if (s.x !== undefined && s.y !== undefined) this.centerOn(s.x, s.y); }
  centerOn(x: number, y: number) { const t = tileAt(this.g, Math.floor(x), Math.floor(y)); this.world.controls.target.set(x, (t ? t.h : 0) * HU, y); }
  setTool(t: Tool) { this.tool = t; this.lastPath = null; if (t.kind !== 'inspect' && t.kind !== 'coaster') this.selectedRide = null; this.world.canvas.style.cursor = t.kind === 'inspect' ? 'default' : 'crosshair'; this.ghostSig = ''; this.updateChrome(); this.refreshPanel(true); }
  rotateTool() { const t = this.tool; if (t.kind === 'scenery' || t.kind === 'ride' || t.kind === 'coasterStart') { t.rot = (((t.rot + 1) & 3) as Dir); this.ghostSig = ''; } }
  afterTrackChange() { this.refreshPanel(true); this.updateChrome(); this.ghostSig = ''; }
  afterAnyChange() { this.terrain.markAllDirty(); this.scenery.rebuild(); this.ghostSig = ''; }
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
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => { this.mouse.down = true; this.mouse.button = e.button; this.mouse.sx = e.clientX; this.mouse.sy = e.clientY; this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY; this.mouse.dragged = false; if (e.button === 0 && this.tool.kind !== 'inspect' && this.tool.kind !== 'coaster') this.applyTool(e); });
    window.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; const r = cv.getBoundingClientRect(); const inside = e.clientX >= r.left && e.clientY >= r.top && e.clientX <= r.right && e.clientY <= r.bottom && !(e.target as HTMLElement).closest?.('.glass');
      if (this.mouse.down) {
        const dx = e.clientX - this.mouse.lastX, dy = e.clientY - this.mouse.lastY; this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY; if (Math.hypot(e.clientX - this.mouse.sx, e.clientY - this.mouse.sy) > 3) this.mouse.dragged = true;
        const panning = this.mouse.button === 0 && (this.tool.kind === 'inspect' || this.tool.kind === 'coaster'); const orbiting = this.mouse.button === 2 || this.mouse.button === 1;
        if (orbiting) this.world.controls.orbit(dx, dy); else if (panning) { if (this.mouse.dragged) { this.world.controls.pan(-dx, -dy); this.follow = null; } }
        else if (this.mouse.button === 0 && (this.tool.kind === 'path' || this.tool.kind === 'demolish' || (this.tool.kind === 'land' && this.tool.mode !== 'raise' && this.tool.mode !== 'lower'))) this.applyTool(e, true);
      }
      this.hover = inside ? this.tileUnder(e.clientX, e.clientY) : null; if (!inside) this.ui.hideTip(); else this.hoverTip(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', e => { if (!this.mouse.down) return; this.mouse.down = false; if (e.button === 0 && !this.mouse.dragged && (this.tool.kind === 'inspect' || this.tool.kind === 'coaster') && !(e.target as HTMLElement).closest?.('.glass')) this.inspectAt(e.clientX, e.clientY); });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.world.controls.dolly(e.deltaY > 0 ? 1.12 : 0.9); }, { passive: false });
    window.addEventListener('keydown', e => {
      const t = e.target as HTMLElement; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; this.keys.add(e.key); const g = this.g; if (!g || !this.running) return; const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); this.afterAnyChange(); this.refreshPanel(true); return; }
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); this.openPanel('save'); return; }
      switch (e.key) {
        case 'Escape': if (this.rideCam) { this.toggleRideCam(this.rideCam.rideId); break; } this.setTool({ kind: 'inspect' }); this.closePanel(); this.selectedRide = null; break;
        case 'p': case 'P': case ' ': e.preventDefault(); g.speed = g.speed ? 0 : 1; break;
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
  setRay(cx: number, cy: number) { const r = this.world.canvas.getBoundingClientRect(); this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(this.ndc, this.world.camera); }
  tileUnder(cx: number, cy: number): { x: number; y: number } | null {
    if (!this.terrain) return null; this.setRay(cx, cy); const hits = this.ray.intersectObjects(this.terrain.landTargets, false); if (!hits.length) return null; const p = hits[0].point; const x = Math.floor(p.x + 0.0001), y = Math.floor(p.z + 0.0001);
    if (x < 0 || y < 0 || x >= this.g.w || y >= this.g.h) return null; return { x, y };
  }
  hoverTip(cx: number, cy: number) {
    if (this.tool.kind !== 'inspect') { this.ui.hideTip(); return; } const pick = this.pickAt(cx, cy); if (!pick) { this.ui.hideTip(); return; }
    if (pick.kind === 'ride') { const r = this.g.rides.find(x => x.id === pick.id); if (r) this.ui.showTip(cx, cy, `${r.name}${r.ratings ? ` · E ${(r.ratings.e / 100).toFixed(2)}` : ''}${r.status === 'open' ? '' : ' · ' + r.status}`); }
    else if (pick.kind === 'guest') { const gu = this.g.guests.find(x => x.id === pick.id); if (gu) this.ui.showTip(cx, cy, `${gu.name} · ${gu.state}`); }
    else if (pick.kind === 'staff') { const s = this.g.staff.find(x => x.id === pick.id); if (s) this.ui.showTip(cx, cy, `${s.name} · ${s.state}`); }
    else this.ui.hideTip();
  }
  pickAt(cx: number, cy: number): { kind: 'ride' | 'guest' | 'staff'; id: number } | null {
    this.setRay(cx, cy);
    const ph = this.ray.intersectObject(this.peeps.bodies, false); if (ph.length && ph[0].instanceId !== undefined) { const who = this.peeps.idAt(ph[0].instanceId); if (who) return who; }
    const targets: THREE.Object3D[] = [this.rides.group]; for (const e of this.rides.entries.values()) if (e.coaster) targets.push(e.coaster.group);
    const rh = this.ray.intersectObjects(targets, true); for (const h of rh) { let o: THREE.Object3D | null = h.object; while (o) { if (o.userData.rideId !== undefined) return { kind: 'ride', id: o.userData.rideId }; o = o.parent; } }
    return null;
  }
  inspectAt(cx: number, cy: number) {
    const pick = this.pickAt(cx, cy);
    if (pick && pick.kind !== 'ride') { this.openPanel(`${pick.kind}:${pick.id}`); return; }
    let rideId = pick ? pick.id : null;
    if (rideId === null) { const h = this.tileUnder(cx, cy); if (h) { const tile = tileAt(this.g, h.x, h.y)!; rideId = tile.rideId ?? (tile.entrance ? tile.entrance.rideId : tile.tracks.length ? tile.tracks[tile.tracks.length - 1].rideId : null); } }
    if (rideId !== null) { const ride = this.g.rides.find(x => x.id === rideId); if (ride) { const def = RIDE_BY_KEY[ride.type]; this.selectedRide = ride.id; if (def.kind === 'coaster' && !ride.closedLoop) { this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } else this.openPanel('ride:' + ride.id); } return; }
    this.selectedRide = null; if (this.tool.kind === 'inspect' && (this.panelId.startsWith('ride:') || this.panelId.startsWith('guest:') || this.panelId.startsWith('staff:'))) this.closePanel();
  }
  applyTool(e: MouseEvent, drag = false) {
    const g = this.g; const h = this.tileUnder(e.clientX, e.clientY); if (!h) return; const t = this.tool;
    if (drag && this.lastPath && this.lastPath.x === h.x && this.lastPath.y === h.y) return; this.lastPath = h;
    const dirty = () => this.terrain.markDirty(h.x, h.y);
    switch (t.kind) {
      case 'land': { let ok = false; if (t.mode === 'raise' || t.mode === 'lower') ok = this.report(cmdLand(g, h.x - Math.floor((t.brush - 1) / 2), h.y - Math.floor((t.brush - 1) / 2), t.mode === 'raise' ? 1 : -1, t.brush)); else if (t.mode === 'water') ok = this.report(cmdWater(g, h.x, h.y)); else if (t.mode === 'buy') ok = this.report(cmdBuyLand(g, h.x, h.y)); else if (t.mode === 'surface') { for (let yy = 0; yy < t.brush; yy++) for (let xx = 0; xx < t.brush; xx++) cmdSurface(g, h.x + xx - Math.floor((t.brush - 1) / 2), h.y + yy - Math.floor((t.brush - 1) / 2), t.surf); ok = true; }
        if (ok) { for (let yy = -1; yy <= t.brush; yy++) for (let xx = -1; xx <= t.brush; xx++) this.terrain.markDirty(h.x + xx - Math.floor((t.brush - 1) / 2), h.y + yy - Math.floor((t.brush - 1) / 2)); this.scenery.rebuild(); } break; }
      case 'path': { if (t.remove) { if (this.report(cmdRemovePath(g, h.x, h.y))) dirty(); } else { const r = cmdPath(g, h.x, h.y, t.queue, t.style); if (!r.ok && !drag) this.toast(r.error, true); else if (r.ok) { dirty(); this.scenery.rebuild(); } } break; }
      case 'pathAdd': if (this.report(cmdPathAdd(g, h.x, h.y, t.what))) dirty(); break;
      case 'scenery': { if (t.remove) { if (this.report(cmdRemoveScenery(g, h.x, h.y))) this.scenery.rebuild(); } else if (this.report(cmdScenery(g, h.x, h.y, t.item, t.rot))) this.scenery.rebuild(); break; }
      case 'demolish': { const tile = tileAt(g, h.x, h.y)!; if (tile.path && (tile.path.adds.bench || tile.path.adds.lamp || tile.path.adds.bin !== undefined) && !drag) { tile.path.adds = {}; dirty(); } else if (tile.path) { if (this.report(cmdRemovePath(g, h.x, h.y))) dirty(); } else if (tile.scenery) { if (this.report(cmdRemoveScenery(g, h.x, h.y))) this.scenery.rebuild(); } else if (tile.entrance && !drag) { const r = g.rides.find(x => x.id === tile.entrance!.rideId); if (r) { if (tile.entrance.exit) r.exit = null; else r.entrance = null; tile.entrance = null; } } else if (!drag) this.toast('Nothing to remove here'); break; }
      case 'ride': { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); const r = cmdPlaceRide(g, t.type, h.x - off, h.y - off, t.rot); if (this.report(r)) { const ride = g.rides[g.rides.length - 1]; this.selectedRide = ride.id; if (def.kind === 'stall') { this.openPanel('ride:' + ride.id); } else { this.toast('Now place the entrance next to the ride'); this.setTool({ kind: 'entrance', rideId: ride.id, exit: false }); } } break; }
      case 'coasterStart': { const r = cmdStartCoaster(g, t.type, h.x, h.y, t.rot); if (this.report(r)) { const ride = g.rides[g.rides.length - 1]; this.selectedRide = ride.id; this.buildSel = { dir: 'straight', slope: 'level', bank: 0, chain: false, special: 'station' }; this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } break; }
      case 'entrance': { const r = cmdPlaceEntrance(g, t.rideId, h.x, h.y, t.exit); if (this.report(r)) { const ride = g.rides.find(x => x.id === t.rideId)!; if (!t.exit) { this.toast('Now place the exit'); this.setTool({ kind: 'entrance', rideId: t.rideId, exit: true }); } else { const def = RIDE_BY_KEY[ride.type]; if (def.kind === 'coaster') { this.setTool({ kind: 'coaster', rideId: ride.id }); this.openPanel('build:' + ride.id); } else { this.setTool({ kind: 'inspect' }); this.openPanel('ride:' + ride.id); } } } break; }
    }
  }
  // ---------- coaster building ----------
  currentPieceKey(): string | null { const s = this.buildSel; if (s.special) return s.special; if (s.dir === 'straight') return { steepDown: 'steepDown', down: 'down', level: 'flat', up: 'up', steepUp: 'steepUp' }[s.slope]; if (s.slope !== 'level') return null; return { left2: 'turnL2', left: 'turnL', right: 'turnR', right2: 'turnR2' }[s.dir as 'left2' | 'left' | 'right' | 'right2']; }
  buildPiece() {
    const t = this.tool; if (t.kind !== 'coaster') return; const key = this.currentPieceKey(); if (!key) { this.toast('That combination is not a track piece', true); return; }
    const ride = this.g.rides.find(x => x.id === t.rideId); if (!ride) return;
    const r = cmdAddPiece(this.g, t.rideId, key, this.buildSel.chain, this.buildSel.bank);
    if (this.report(r)) { if (ride.closedLoop) this.toast('Circuit complete! Place the entrance and exit, then test it.'); if (key === 'station' && ride.pieces.length >= 3) this.buildSel.special = null; }
    this.afterTrackChange();
  }
  // ---------- ghosts ----------
  updateGhost() {
    const g = this.g, t = this.tool, h = this.hover; let sig = ''; let want: (() => THREE.Object3D) | null = null; let hiTile: { x: number; y: number; n: number; ok: boolean } | null = null;
    if (t.kind === 'coaster') { const ride = g.rides.find(x => x.id === t.rideId); const key = this.currentPieceKey(); if (ride && key) { const at = coasterCursor(g, ride) ?? { x: ride.x, y: ride.y, z: tileAt(g, ride.x, ride.y)!.h + 2, dir: ride.rot }; const why = checkPiece(g, ride, key, at); const def = PIECE_BY_KEY[key]; const piece = { type: key, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: this.buildSel.chain && !!def.chainable, bank: (def.bankable ? this.buildSel.bank : 0) as -1 | 0 | 1 }; sig = `piece:${key}:${at.x},${at.y},${at.z},${at.dir},${piece.bank},${why ? 0 : 1}`; want = () => pieceGhost(g, ride, piece, !why); } }
    else if (h) {
      if (t.kind === 'land') hiTile = { x: h.x - Math.floor((t.brush - 1) / 2), y: h.y - Math.floor((t.brush - 1) / 2), n: (t.mode === 'raise' || t.mode === 'lower' || t.mode === 'surface') ? t.brush : 1, ok: true };
      else if (t.kind === 'path' || t.kind === 'pathAdd' || t.kind === 'demolish' || t.kind === 'coasterStart') hiTile = { x: h.x, y: h.y, n: 1, ok: true };
      else if (t.kind === 'scenery' && !t.remove) { hiTile = { x: h.x, y: h.y, n: 1, ok: true }; sig = `scen:${t.item}:${t.rot}`; const item = t.item, rot = t.rot; want = () => { const m = new THREE.Mesh(sceneryGeometry(item), MAT_GHOST); m.rotation.y = -rot * Math.PI / 2; return m; }; }
      else if (t.kind === 'scenery') hiTile = { x: h.x, y: h.y, n: 1, ok: false };
      else if (t.kind === 'ride') { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); const x = h.x - off, y = h.y - off; const ok = dry(() => cmdPlaceRide(g, t.type, x, y, t.rot)); hiTile = { x, y, n: def.size, ok }; sig = `ride:${t.type}:${t.rot}:${ok ? 1 : 0}`; const type = t.type, rot = t.rot; want = () => { const fake = { id: -1, type, name: '', x: 0, y: 0, rot, colours: [0, 1, 2], running: true, pieces: [], trains: [] } as any; const m = rideModel(fake); m.group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ok ? MAT_GHOST : MAT_BLOCKED; }); return m.group; }; }
      else if (t.kind === 'entrance') { hiTile = { x: h.x, y: h.y, n: 1, ok: true }; sig = `hut:${t.exit ? 1 : 0}`; const exit = t.exit; want = () => { const m = hutModel(exit); m.material = MAT_GHOST; return m; }; }
    }
    // tile highlight
    if (hiTile) { const tile = tileAt(g, hiTile.x, hiTile.y); const hh = tile ? (tile.water ? tile.h + LAND_STEP : tile.h) * HU : 0; this.tileHi.visible = true; this.tileHi.position.set(hiTile.x + hiTile.n / 2, hh + 0.06, hiTile.y + hiTile.n / 2); this.tileHi.scale.set(hiTile.n, hiTile.n, 1); (this.tileHi.material as THREE.MeshBasicMaterial).color.setHex(hiTile.ok ? 0xffe14d : 0xff4d4d); } else this.tileHi.visible = false;
    // model ghost
    if (sig !== this.ghostSig) { if (this.ghost) { this.world.scene.remove(this.ghost); this.ghost = null; } this.ghostSig = sig; if (want) { this.ghost = want(); this.world.scene.add(this.ghost); } }
    if (this.ghost && h && t.kind !== 'coaster') { const tile = tileAt(g, h.x, h.y); const hh = tile ? tile.h * HU : 0; if (t.kind === 'ride') { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); this.ghost.position.set(h.x - off + def.size / 2, hh, h.y - off + def.size / 2); } else this.ghost.position.set(h.x + 0.5, hh, h.y + 0.5); if (t.kind === 'entrance') this.ghost.rotation.y = 0; }
    if (this.ghost && !h && t.kind !== 'coaster') this.ghost.visible = false; else if (this.ghost) this.ghost.visible = true;
  }
}
function dry(fn: () => CmdResult): boolean { const r = fn(); if (r.ok) { undo(); return true; } return false; }
