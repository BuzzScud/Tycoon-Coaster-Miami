// The running game: loop, camera, input, tools and the always-visible chrome (toolbar, readout, news).
import { type GameState, type Dir, money, TICKS_PER_SEC, LAND_STEP } from '../sim/types';
import { tick, cmdLand, cmdWater, cmdPath, cmdRemovePath, cmdScenery, cmdRemoveScenery, cmdPlaceRide, cmdPlaceEntrance, cmdAddPiece, cmdRemovePiece, cmdStartCoaster, cmdPathAdd, cmdBuyLand, cmdSurface, checkPiece, coasterCursor, undo, type CmdResult } from '../sim/game';
import { tileAt } from '../sim/map';
import { RIDE_BY_KEY } from '../sim/rides';
import { PIECE_BY_KEY, pieceEnd } from '../sim/track';
import { dateString } from '../sim/time';
import { WEATHER_NAMES } from '../sim/weather';
import { Renderer, type Overlay, type Ghost } from '../render/renderer';
import { SCALES, type Camera } from '../render/iso';
import { WindowManager } from './windows';
import { svg, hydrateIcons } from './icons';
import { openPanel } from './panels';
import { writeSlot } from '../sim/save';
import { audio } from './audio';

export type Tool =
  | { kind: 'inspect' } | { kind: 'land'; mode: 'raise' | 'lower' | 'water' | 'buy' | 'surface'; brush: number; surf: number }
  | { kind: 'path'; queue: boolean; style: number; remove: boolean } | { kind: 'pathAdd'; what: 'bench' | 'lamp' | 'bin' }
  | { kind: 'scenery'; item: string; rot: Dir; remove: boolean } | { kind: 'ride'; type: string; rot: Dir }
  | { kind: 'coasterStart'; type: string; rot: Dir } | { kind: 'entrance'; rideId: number; exit: boolean }
  | { kind: 'coaster'; rideId: number } | { kind: 'demolish' };

export interface BuildSel { dir: 'left2' | 'left' | 'straight' | 'right' | 'right2'; slope: 'steepDown' | 'down' | 'level' | 'up' | 'steepUp'; bank: -1 | 0 | 1; chain: boolean; special: string | null; }

export class App {
  g!: GameState; renderer: Renderer; cam: Camera; wm: WindowManager; tool: Tool = { kind: 'inspect' };
  overlay: Overlay = { ghost: null, selectedRide: null, selectedGuest: null, highlightTile: null };
  buildSel: BuildSel = { dir: 'straight', slope: 'level', bank: 0, chain: false, special: null };
  hover: { x: number; y: number } | null = null; mouse = { x: 0, y: 0, down: false, button: 0, sx: 0, sy: 0, dragged: false, camX: 0, camY: 0 };
  acc = 0; last = performance.now(); uiTimer = 0; running = false; lastAutosaveMonth = -1; lastPath: { x: number; y: number } | null = null;
  keys = new Set<string>(); toastEl: HTMLElement; readout: HTMLElement; newsEl: HTMLElement; toolbar: HTMLElement; frameTimes: number[] = [];
  constructor(public root: HTMLElement, public canvas: HTMLCanvasElement) {
    this.cam = { x: 0, y: 0, scale: 2, rot: 0 };
    this.wm = new WindowManager(root.querySelector('#windows')!);
    this.renderer = new Renderer(canvas, this.cam, { w: 1, h: 1, tiles: [] } as unknown as GameState);
    this.toastEl = root.querySelector('#toast')!; this.readout = root.querySelector('#readout')!; this.newsEl = root.querySelector('#news')!; this.toolbar = root.querySelector('#toolbar')!;
    this.buildToolbar(); this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!); this.resize();
  }
  // ---------- lifecycle ----------
  start(g: GameState) {
    this.g = g; this.renderer.setGame(g); this.wm.closeAll(); this.tool = { kind: 'inspect' }; this.overlay = { ghost: null, selectedRide: null, selectedGuest: null, highlightTile: null };
    this.cam.x = g.entrance.x; this.cam.y = g.entrance.y - 6; this.cam.rot = 0; this.cam.scale = 2; this.lastAutosaveMonth = g.monthsElapsed;
    this.running = true; this.last = performance.now(); this.acc = 0; this.updateChrome();
    if (!(this as any)._loop) { (this as any)._loop = true; requestAnimationFrame(t => this.frame(t)); }
  }
  frame(now: number) {
    requestAnimationFrame(t => this.frame(t));
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; const g = this.g;
    this.moveCameraByKeys(dt);
    if (g.speed > 0) {
      const mult = [0, 1, 2, 4, 8][g.speed]; this.acc += dt * TICKS_PER_SEC * mult;
      let n = 0; const maxTicks = 40 * mult;
      while (this.acc >= 1 && n < maxTicks) { tick(g); this.acc--; n++; }
      if (n >= maxTicks) this.acc = 0;
    }
    this.overlay.ghost = this.computeGhost();
    this.renderer.draw(this.overlay, dt);
    this.uiTimer += dt; if (this.uiTimer > 0.25) { this.uiTimer = 0; this.updateChrome(); this.wm.updateAll(); }
    if (g.monthsElapsed !== this.lastAutosaveMonth) { this.lastAutosaveMonth = g.monthsElapsed; this.autosave(); }
    this.frameTimes.push(dt); if (this.frameTimes.length > 60) this.frameTimes.shift();
  }
  resize() { const p = this.canvas.parentElement!; this.renderer.resize(p.clientWidth, p.clientHeight); }
  autosave() { const err = writeSlot('autosave', this.g, this.g.parkName, dateString(this.g)); if (err) this.toast(err); }
  // ---------- chrome ----------
  buildToolbar() {
    const groups: [string, [string, string][]][] = [
      ['sys', [['pause', 'Pause (P)'], ['fast', 'Speed (1-4)'], ['save', 'Save / load (Cmd+S)'], ['options', 'Options']]],
      ['sys', [['zoomout', 'Zoom out (-)'], ['zoomin', 'Zoom in (+)'], ['rotate', 'Rotate view (Q / E)'], ['undo', 'Undo last build (Cmd+Z)']]],
      ['build', [['demolish', 'Bulldozer: remove paths and scenery (X)'], ['land', 'Land and water (L)'], ['scenery', 'Scenery (T)'], ['path', 'Footpaths (F)'], ['ride', 'New ride (N)']]],
      ['manage', [['finance', 'Finances'], ['research', 'Research'], ['rides', 'Rides list'], ['park', 'Park'], ['staff', 'Staff'], ['guests', 'Guests'], ['news', 'Recent messages']]],
    ];
    this.toolbar.innerHTML = groups.map(([cls, btns]) => `<div class="grp ${cls}">${btns.map(([i, tip]) => `<div class="btn" data-act="${i}" title="${tip}">${svg(i)}</div>`).join('')}</div>`).join('');
    this.toolbar.querySelectorAll<HTMLElement>('.btn').forEach(b => b.addEventListener('click', () => this.action(b.dataset.act!)));
  }
  action(a: string) {
    const g = this.g; audio.click();
    switch (a) {
      case 'pause': g.speed = g.speed ? 0 : 1; break;
      case 'fast': g.speed = g.speed >= 4 ? 1 : ((g.speed + 1) as GameState['speed']); break;
      case 'zoomin': this.zoom(1); break; case 'zoomout': this.zoom(-1); break;
      case 'rotate': this.rotate(1); break;
      case 'undo': { const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); break; }
      case 'demolish': this.setTool({ kind: 'demolish' }); break;
      case 'land': this.setTool({ kind: 'land', mode: 'raise', brush: 1, surf: 0 }); openPanel(this, 'land'); break;
      case 'scenery': openPanel(this, 'scenery'); break;
      case 'path': this.setTool({ kind: 'path', queue: false, style: 0, remove: false }); openPanel(this, 'path'); break;
      case 'ride': openPanel(this, 'newride'); break;
      default: openPanel(this, a);
    }
    this.updateChrome();
  }
  updateChrome() {
    const g = this.g; if (!g) return;
    const w = g.weather; const wIcon = w.kind >= 3 ? 'rain' : w.kind === 0 ? 'sun' : 'cloud';
    const html = `<div class="stat"><span class="money ${g.finance.cash < 0 ? 'neg' : ''}" data-act="finance" title="Finances">${g.noMoney ? 'Sandbox' : money(g.finance.cash)}</span><span data-act="guests" title="Guests">${g.guestsInPark} guests</span></div>
      <div class="prbar" data-act="park" title="Park rating ${g.rating}"><i style="left:${(g.rating / 999) * 100}%"></i></div>
      <div class="stat"><span data-act="park">Park rating: ${g.rating}</span><span class="wx" title="${WEATHER_NAMES[w.kind]}, ${w.temp} °C">${svg(wIcon)} ${w.temp}°</span></div>
      <div class="stat"><span>${dateString(g)}</span><span class="spd">${g.speed === 0 ? 'Paused' : '▶'.repeat(Math.min(3, g.speed)) + (g.speed === 4 ? '▶' : '')}</span></div>`;
    if (this.readout.innerHTML !== html) { this.readout.innerHTML = html; this.readout.querySelectorAll<HTMLElement>('[data-act]').forEach(el => el.onclick = () => openPanel(this, el.dataset.act!)); }
    const n = g.news[0];
    const nh = n ? `<span class="ic">${svg(n.icon === 'guest' ? 'smile' : n.icon)}</span><span class="txt">${n.text}</span>` : '';
    if (this.newsEl.innerHTML !== nh) { this.newsEl.innerHTML = nh; this.newsEl.onclick = () => { if (n?.subject) this.goTo(n.subject); else openPanel(this, 'news'); }; }
    this.newsEl.style.display = n && g.tick - n.tick < 1800 ? '' : 'none';
    this.toolbar.querySelectorAll<HTMLElement>('.btn').forEach(b => { const a = b.dataset.act; const on = (a === 'pause' && g.speed === 0) || (a === 'demolish' && this.tool.kind === 'demolish') || (a === 'land' && this.tool.kind === 'land') || (a === 'path' && (this.tool.kind === 'path' || this.tool.kind === 'pathAdd')) || (a === 'scenery' && this.tool.kind === 'scenery') || (a === 'ride' && (this.tool.kind === 'ride' || this.tool.kind === 'coasterStart' || this.tool.kind === 'coaster' || this.tool.kind === 'entrance')); b.classList.toggle('down', on); });
  }
  goTo(s: { kind: string; id?: number; x?: number; y?: number }) {
    if (s.kind === 'ride' && s.id !== undefined) { const r = this.g.rides.find(x => x.id === s.id); if (r) { this.centerOn(r.x, r.y); openPanel(this, 'ride:' + r.id); } }
    else if (s.kind === 'guest' && s.id !== undefined) { const gu = this.g.guests.find(x => x.id === s.id); if (gu) { this.centerOn(gu.x, gu.y); openPanel(this, 'guest:' + gu.id); } }
    else if (s.x !== undefined && s.y !== undefined) this.centerOn(s.x, s.y);
  }
  centerOn(x: number, y: number) { this.cam.x = x; this.cam.y = y; }
  toast(msg: string, ms = 2200) { this.toastEl.textContent = msg; this.toastEl.style.left = Math.min(window.innerWidth - 260, this.mouse.x + 14) + 'px'; this.toastEl.style.top = Math.max(50, this.mouse.y - 10) + 'px'; this.toastEl.classList.add('on'); clearTimeout((this as any)._tt); (this as any)._tt = setTimeout(() => this.toastEl.classList.remove('on'), ms); }
  setTool(t: Tool) { this.tool = t; this.lastPath = null; if (t.kind !== 'inspect') this.overlay.selectedRide = null; this.canvas.style.cursor = t.kind === 'inspect' ? 'default' : 'crosshair'; this.updateChrome(); }
  // ---------- camera ----------
  zoom(dir: number, px?: number, py?: number) {
    const i = SCALES.indexOf(this.cam.scale); const ni = Math.max(0, Math.min(SCALES.length - 1, i + dir)); if (ni === i) return;
    const before = px !== undefined ? this.worldAt(px, py!) : null;
    this.cam.scale = SCALES[ni]; this.renderer.pr.setBuffer(...this.renderer.bufSize());
    if (before) { const after = this.worldAt(px!, py!); if (after) { this.cam.x += before.x - after.x; this.cam.y += before.y - after.y; } }
    audio.click();
  }
  rotate(dir: number) { this.cam.rot = (((this.cam.rot + dir) & 3) as Dir); }
  worldAt(px: number, py: number) { const [bx, by] = this.renderer.screenToBuf(px, py); return this.renderer.pr.unproject(bx, by, 0); }
  moveCameraByKeys(dt: number) {
    const k = this.keys; let dx = 0, dy = 0; const s = (14 / this.cam.scale) * dt * 4;
    if (k.has('ArrowLeft') || k.has('a')) dx -= s; if (k.has('ArrowRight') || k.has('d')) dx += s; if (k.has('ArrowUp') || k.has('w')) dy -= s; if (k.has('ArrowDown') || k.has('s')) dy += s;
    if (dx || dy) this.panScreen(dx * 16, dy * 16);
  }
  /** pan by internal-pixel deltas (screen axes) keeping the rotation in mind */
  panScreen(dx: number, dy: number) {
    const a = this.renderer.pr.unproject(0, 0, 0), b = this.renderer.pr.unproject(dx, dy, 0);
    this.cam.x += b.x - a.x; this.cam.y += b.y - a.y;
    this.cam.x = Math.max(-10, Math.min(this.g.w + 10, this.cam.x)); this.cam.y = Math.max(-10, Math.min(this.g.h + 10, this.cam.y));
  }
  // ---------- input ----------
  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => { audio.unlock(); this.mouse.down = true; this.mouse.button = e.button; this.mouse.sx = e.clientX; this.mouse.sy = e.clientY; this.mouse.dragged = false; this.mouse.camX = this.cam.x; this.mouse.camY = this.cam.y; if (e.button === 0 && this.tool.kind !== 'inspect' && this.tool.kind !== 'coaster') { this.applyTool(e); } });
    window.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; const r = cv.getBoundingClientRect(); const inside = e.clientX >= r.left && e.clientY >= r.top && e.clientX <= r.right && e.clientY <= r.bottom;
      if (this.mouse.down) {
        const ddx = e.clientX - this.mouse.sx, ddy = e.clientY - this.mouse.sy;
        const panning = this.mouse.button === 2 || this.mouse.button === 1 || (this.mouse.button === 0 && (this.tool.kind === 'inspect' || this.tool.kind === 'coaster'));
        if (panning) { if (Math.hypot(ddx, ddy) > 3) this.mouse.dragged = true; if (this.mouse.dragged) { this.cam.x = this.mouse.camX; this.cam.y = this.mouse.camY; this.panScreen(-ddx / this.cam.scale, -ddy / this.cam.scale); } }
        else if (this.mouse.button === 0 && (this.tool.kind === 'path' || this.tool.kind === 'demolish' || (this.tool.kind === 'land' && this.tool.mode !== 'raise' && this.tool.mode !== 'lower'))) this.applyTool(e, true);
      }
      this.hover = inside ? this.tileUnder(e.clientX, e.clientY) : null;
    });
    window.addEventListener('mouseup', e => { if (!this.mouse.down) return; this.mouse.down = false; if (e.button === 0 && !this.mouse.dragged && (this.tool.kind === 'inspect' || this.tool.kind === 'coaster')) this.inspectAt(e.clientX, e.clientY); });
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoom(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    window.addEventListener('keydown', e => {
      const t = (e.target as HTMLElement); if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      this.keys.add(e.key); const g = this.g; if (!g) return; const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); const l = undo(); this.toast(l ? `Undid: ${l}` : 'Nothing to undo'); return; }
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); openPanel(this, 'save'); return; }
      switch (e.key) {
        case 'Escape': this.setTool({ kind: 'inspect' }); this.overlay.selectedRide = null; break;
        case 'p': case 'P': case ' ': e.preventDefault(); g.speed = g.speed ? 0 : 1; break;
        case '1': case '2': case '3': case '4': g.speed = +e.key as GameState['speed']; break;
        case '+': case '=': this.zoom(1); break; case '-': case '_': this.zoom(-1); break;
        case 'q': case 'Q': this.rotate(-1); break; case 'e': case 'E': this.rotate(1); break;
        case 'r': case 'R': this.rotateTool(); break;
        case 'x': case 'X': this.setTool({ kind: 'demolish' }); break;
        case 'l': case 'L': this.action('land'); break; case 't': case 'T': this.action('scenery'); break; case 'f': case 'F': this.action('path'); break; case 'n': case 'N': this.action('ride'); break;
        case 'Backspace': case 'Delete': if (this.tool.kind === 'coaster') { e.preventDefault(); this.report(cmdRemovePiece(g, this.tool.rideId)); } break;
        case 'Enter': if (this.tool.kind === 'coaster') { e.preventDefault(); this.buildPiece(); } break;
      }
      this.updateChrome();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }
  rotateTool() { const t = this.tool; if (t.kind === 'scenery' || t.kind === 'ride' || t.kind === 'coasterStart') t.rot = (((t.rot + 1) & 3) as Dir); }
  tileUnder(cx: number, cy: number) { const r = this.canvas.getBoundingClientRect(); const [bx, by] = this.renderer.screenToBuf(cx - r.left, cy - r.top); return this.renderer.pr.hitTile(bx, by); }
  report(res: CmdResult) { if (!res.ok) { this.toast(res.error); audio.error(); } else { if (res.cost > 0) audio.build(); } return res.ok; }
  applyTool(e: MouseEvent, drag = false) {
    const g = this.g; const h = this.tileUnder(e.clientX, e.clientY); if (!h) return; const t = this.tool;
    if (drag && this.lastPath && this.lastPath.x === h.x && this.lastPath.y === h.y) return; this.lastPath = h;
    switch (t.kind) {
      case 'land': {
        if (t.mode === 'raise' || t.mode === 'lower') this.report(cmdLand(g, h.x - Math.floor((t.brush - 1) / 2), h.y - Math.floor((t.brush - 1) / 2), t.mode === 'raise' ? 1 : -1, t.brush));
        else if (t.mode === 'water') this.report(cmdWater(g, h.x, h.y));
        else if (t.mode === 'buy') this.report(cmdBuyLand(g, h.x, h.y));
        else if (t.mode === 'surface') { for (let yy = 0; yy < t.brush; yy++) for (let xx = 0; xx < t.brush; xx++) cmdSurface(g, h.x + xx - Math.floor((t.brush - 1) / 2), h.y + yy - Math.floor((t.brush - 1) / 2), t.surf); }
        break; }
      case 'path': if (t.remove) this.report(cmdRemovePath(g, h.x, h.y)); else { const r = cmdPath(g, h.x, h.y, t.queue, t.style); if (!r.ok && !drag) this.toast(r.error); else if (r.ok) audio.build(); } break;
      case 'pathAdd': this.report(cmdPathAdd(g, h.x, h.y, t.what)); break;
      case 'scenery': if (t.remove) this.report(cmdRemoveScenery(g, h.x, h.y)); else this.report(cmdScenery(g, h.x, h.y, t.item, t.rot)); break;
      case 'demolish': { const tile = tileAt(g, h.x, h.y)!; if (tile.path && (tile.path.adds.bench || tile.path.adds.lamp || tile.path.adds.bin !== undefined) && !drag) { tile.path.adds = {}; audio.build(); } else if (tile.path) this.report(cmdRemovePath(g, h.x, h.y)); else if (tile.scenery) this.report(cmdRemoveScenery(g, h.x, h.y)); else if (tile.entrance && !drag) { const r = g.rides.find(x => x.id === tile.entrance!.rideId); if (r) { if (tile.entrance.exit) r.exit = null; else r.entrance = null; tile.entrance = null; } } else if (!drag) this.toast('Nothing to remove here'); break; }
      case 'ride': { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); const r = cmdPlaceRide(g, t.type, h.x - off, h.y - off, t.rot); if (this.report(r)) { const ride = g.rides[g.rides.length - 1]; if (def.kind === 'stall') { this.setTool({ kind: 'ride', type: t.type, rot: t.rot }); openPanel(this, 'ride:' + ride.id); } else { this.toast('Now place the entrance next to the ride'); this.setTool({ kind: 'entrance', rideId: ride.id, exit: false }); } } break; }
      case 'coasterStart': { const r = cmdStartCoaster(g, t.type, h.x, h.y, t.rot); if (this.report(r)) { const ride = g.rides[g.rides.length - 1]; this.setTool({ kind: 'coaster', rideId: ride.id }); this.buildSel = { dir: 'straight', slope: 'level', bank: 0, chain: false, special: 'station' }; openPanel(this, 'build:' + ride.id); } break; }
      case 'entrance': { const r = cmdPlaceEntrance(g, t.rideId, h.x, h.y, t.exit); if (this.report(r)) { const ride = g.rides.find(x => x.id === t.rideId)!; if (!t.exit) { this.toast('Now place the exit'); this.setTool({ kind: 'entrance', rideId: t.rideId, exit: true }); } else { const def = RIDE_BY_KEY[ride.type]; if (def.kind === 'coaster') { this.setTool({ kind: 'coaster', rideId: ride.id }); openPanel(this, 'build:' + ride.id); } else { this.setTool({ kind: 'inspect' }); openPanel(this, 'ride:' + ride.id); } } } break; }
    }
  }
  inspectAt(cx: number, cy: number) {
    const g = this.g; const r = this.canvas.getBoundingClientRect(); const [bx, by] = this.renderer.screenToBuf(cx - r.left, cy - r.top);
    // guests and staff first (small targets)
    let best: { kind: 'guest' | 'staff'; id: number; d: number } | null = null;
    for (const gu of g.guests) { if (gu.state === 'left') continue; const p = this.renderer.pr.project(gu.x, gu.y, gu.z); const d = Math.hypot(p.x - bx, p.y - by + 5); if (d < 7 && (!best || d < best.d)) best = { kind: 'guest', id: gu.id, d }; }
    for (const st of g.staff) { const p = this.renderer.pr.project(st.x, st.y, st.z); const d = Math.hypot(p.x - bx, p.y - by + 5); if (d < 7 && (!best || d < best.d)) best = { kind: 'staff', id: st.id, d }; }
    if (best) { audio.click(); openPanel(this, `${best.kind}:${best.id}`); return; }
    const h = this.tileUnder(cx, cy); if (!h) return; const tile = tileAt(g, h.x, h.y)!;
    let rideId: number | null = tile.rideId ?? null; if (rideId === null && tile.entrance) rideId = tile.entrance.rideId; if (rideId === null && tile.tracks.length) rideId = tile.tracks[tile.tracks.length - 1].rideId;
    if (rideId !== null) { const ride = g.rides.find(x => x.id === rideId); if (ride) { audio.click(); const def = RIDE_BY_KEY[ride.type]; if (def.kind === 'coaster' && !ride.closedLoop) { this.setTool({ kind: 'coaster', rideId: ride.id }); openPanel(this, 'build:' + ride.id); } else openPanel(this, 'ride:' + ride.id); this.overlay.selectedRide = ride.id; } return; }
    this.overlay.selectedRide = null;
  }
  // ---------- coaster building ----------
  currentPieceKey(): string | null {
    const s = this.buildSel; if (s.special) return s.special;
    if (s.dir === 'straight') return { steepDown: 'steepDown', down: 'down', level: 'flat', up: 'up', steepUp: 'steepUp' }[s.slope];
    if (s.slope !== 'level') return null;
    return { left2: 'turnL2', left: 'turnL', right: 'turnR', right2: 'turnR2' }[s.dir as 'left2' | 'left' | 'right' | 'right2'];
  }
  buildPiece() {
    const t = this.tool; if (t.kind !== 'coaster') return; const key = this.currentPieceKey(); if (!key) { this.toast('That combination is not a track piece'); return; }
    const ride = this.g.rides.find(x => x.id === t.rideId); if (!ride) return;
    const r = cmdAddPiece(this.g, t.rideId, key, this.buildSel.chain, this.buildSel.bank);
    if (this.report(r)) { if (ride.closedLoop) { this.toast('Circuit complete! Place the entrance and exit, then test it.'); audio.fanfare(); } if (key === 'station' && ride.pieces.length >= 3) { this.buildSel.special = null; } }
  }
  computeGhost(): Ghost | null {
    const g = this.g, t = this.tool, h = this.hover;
    if (t.kind === 'coaster') {
      const ride = g.rides.find(x => x.id === t.rideId); if (!ride) return null; const key = this.currentPieceKey(); if (!key) return null;
      const at = coasterCursor(g, ride) ?? { x: ride.x, y: ride.y, z: tileAt(g, ride.x, ride.y)!.h + 2, dir: ride.rot };
      const why = checkPiece(g, ride, key, at); const def = PIECE_BY_KEY[key];
      return { kind: 'piece', x: at.x, y: at.y, ok: !why, ride, piece: { type: key, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: this.buildSel.chain && !!def.chainable, bank: def.bankable ? this.buildSel.bank : 0 } };
    }
    if (!h) return null;
    switch (t.kind) {
      case 'land': return { kind: 'tile', x: h.x - Math.floor((t.brush - 1) / 2), y: h.y - Math.floor((t.brush - 1) / 2), brush: t.mode === 'raise' || t.mode === 'lower' || t.mode === 'surface' ? t.brush : 1, ok: true };
      case 'path': case 'pathAdd': case 'demolish': return { kind: 'path', x: h.x, y: h.y, ok: true };
      case 'scenery': return { kind: 'scenery', x: h.x, y: h.y, ok: !t.remove, type: t.remove ? undefined : t.item, rot: t.rot };
      case 'ride': { const def = RIDE_BY_KEY[t.type]; const off = Math.floor((def.size - 1) / 2); const x = h.x - off, y = h.y - off; const tile = tileAt(g, x, y); const ok = !!tile && cmdDry(() => cmdPlaceRide(g, t.type, x, y, t.rot), g); return { kind: 'ride', x, y, ok, type: t.type, rot: t.rot }; }
      case 'coasterStart': { const tile = tileAt(g, h.x, h.y); const ok = !!tile && tile.owned && !tile.water && !tile.path && tile.rideId === null; return { kind: 'tile', x: h.x, y: h.y, ok }; }
      case 'entrance': return { kind: 'entrance', x: h.x, y: h.y, ok: true, type: t.exit ? 'exit' : 'entrance' };
    }
    return null;
  }
}
/** Run a command's validation without side effects by checking the result and undoing on success. */
function cmdDry(fn: () => CmdResult, _g: GameState): boolean {
  const r = fn(); if (r.ok) { undo(); return true; } return false;
}
export { LAND_STEP, hydrateIcons, pieceEnd };
