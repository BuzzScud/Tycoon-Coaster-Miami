// The mini-map: the whole park from above in a corner, north up. Ground, water, paths, rides and track are painted
// once into a base picture (again when the park changes); guests, staff and the camera's view go on top a few times a
// second. Click or drag on it to move the view there.
import * as THREE from 'three';
import { Surface, type GameState } from '../sim/types';
import { RIDE_BY_KEY, COLOURS } from '../sim/rides';
import { HU } from '../three/world';

const SURF: Record<number, string> = { [Surface.Grass]: '#7fb35e', [Surface.Sand]: '#ddca8c', [Surface.Dirt]: '#9a7446', [Surface.Rock]: '#9a9a9a', [Surface.GrassDark]: '#6c9f50' };
const SIZE = 184;   // css pixels across

export class MiniMap {
  el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base = document.createElement('canvas'); on = true;
  private baseSig = ''; private lastBase = 0; private last = 0; private g: GameState | null = null; private dragging = false;
  constructor(root: HTMLElement, public onJump: (x: number, y: number) => void) {
    this.el = document.createElement('div'); this.el.id = 'minimap'; this.el.className = 'glass'; this.el.title = 'Mini-map: click or drag to move the view (M hides it)';
    this.canvas = document.createElement('canvas'); this.el.appendChild(this.canvas); root.appendChild(this.el); this.ctx = this.canvas.getContext('2d')!;
    try { this.on = localStorage.getItem('rct.minimap') !== 'off'; } catch { /* default on */ } this.el.style.display = 'none';   // shown once a park is running
    const at = (e: PointerEvent) => { if (!this.g) return; const r = this.canvas.getBoundingClientRect(); this.onJump(((e.clientX - r.left) / r.width) * this.g.w, ((e.clientY - r.top) / r.height) * this.g.h); };
    this.canvas.addEventListener('pointerdown', e => { this.dragging = true; this.canvas.setPointerCapture(e.pointerId); at(e); e.stopPropagation(); });
    this.canvas.addEventListener('pointermove', e => { if (this.dragging) at(e); });
    this.canvas.addEventListener('pointerup', e => { this.dragging = false; this.canvas.releasePointerCapture(e.pointerId); });
  }
  private running = false;
  /** Only while a park runs (not over the title screen). */
  show(running: boolean) { this.running = running; this.el.style.display = this.on && running ? '' : 'none'; }
  toggle(on = !this.on) { this.on = on; this.el.style.display = on && this.running ? '' : 'none'; try { localStorage.setItem('rct.minimap', on ? 'on' : 'off'); } catch { /* ignore */ } }
  /** The park changed (built, bulldozed, a new park): paint the base again at the next update. */
  dirty() { this.baseSig = ''; }
  private paintBase(g: GameState) {
    const s = Math.max(1, Math.floor((SIZE * devicePixelRatio) / Math.max(g.w, g.h))); const b = this.base; b.width = g.w * s; b.height = g.h * s; const c = b.getContext('2d')!;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const t = g.tiles[y * g.w + x]; let col = t.water ? '#6fb7e0' : SURF[t.surf] ?? '#7fb35e';
      if (t.paths.length) col = t.paths[t.paths.length - 1].queue ? '#c9c1b2' : '#8e8a85'; else if (t.rideId !== null) { const r = g.rides.find(q => q.id === t.rideId); col = r ? COLOURS[r.colours[0] % COLOURS.length] : '#555'; } else if (t.entrance) col = t.entrance.exit ? '#555' : '#2f4639';
      else if (t.scenery && !t.water) col = t.scenery.kind.startsWith('tree') || t.scenery.kind === 'bush' ? '#4e8a3a' : '#b48ead';
      c.fillStyle = col; c.fillRect(x * s, y * s, s, s);
      if (!t.owned) { c.fillStyle = 'rgba(30,40,30,.38)'; c.fillRect(x * s, y * s, s, s); }
    }
    c.lineWidth = Math.max(1, s * 0.5); c.lineCap = 'round';
    for (const r of g.rides) { if (RIDE_BY_KEY[r.type].kind !== 'coaster' || r.pieces.length < 2) continue; c.strokeStyle = COLOURS[r.colours[1] % COLOURS.length]; c.beginPath(); r.pieces.forEach((p, i) => { const px = (p.x + 0.5) * s, py = (p.y + 0.5) * s; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); if (r.closedLoop) c.closePath(); c.stroke(); }
  }
  /** Redraw: the base when the park changed, then people and the view's outline (at most a few times a second). */
  update(g: GameState, camera: THREE.Camera, now: number) {
    if (!this.on) return; if (g !== this.g) { this.g = g; this.baseSig = ''; } if (now - this.last < 250) return; this.last = now;
    const sig = `${g.w},${g.h},${g.rides.length},${g.rides.reduce((a, r) => a + r.pieces.length, 0)}`;
    if (sig !== this.baseSig || now - this.lastBase > 3000) { this.baseSig = sig; this.lastBase = now; this.paintBase(g); }
    const dpr = devicePixelRatio, w = Math.round(SIZE * (g.w / Math.max(g.w, g.h))), h = Math.round(SIZE * (g.h / Math.max(g.w, g.h)));
    if (this.canvas.width !== w * dpr) { this.canvas.width = w * dpr; this.canvas.height = h * dpr; this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; }
    const c = this.ctx, k = this.canvas.width / g.w; c.imageSmoothingEnabled = false; c.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height);
    c.fillStyle = '#1d2a22'; let n = 0; for (const gu of g.guests) { if (gu.state === 'left' || gu.state === 'riding') continue; if (++n > 2500) break; c.fillRect(gu.x * k - dpr * 0.5, gu.y * k - dpr * 0.5, dpr * 1.2, dpr * 1.2); }
    for (const st of g.staff) { c.fillStyle = st.type === 'handyman' ? '#00a8e8' : st.type === 'mechanic' ? '#e67e22' : st.type === 'security' ? '#34495e' : '#f368a4'; c.fillRect(st.x * k - dpr, st.y * k - dpr, dpr * 2.4, dpr * 2.4); }
    // the view: the four corners of the screen, carried down to the ground the camera is looking at
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const ray = new THREE.Raycaster(); const hit = new THREE.Vector3(); const pts: [number, number][] = [];
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ray.setFromCamera(new THREE.Vector2(nx, ny), camera); if (ray.ray.intersectPlane(ground, hit)) pts.push([hit.x, hit.z]); }
    if (pts.length === 4) { c.strokeStyle = '#ffffff'; c.lineWidth = 1.5 * dpr; c.beginPath(); pts.forEach(([x, y], i) => { if (i) c.lineTo(x * k, y * k); else c.moveTo(x * k, y * k); }); c.closePath(); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.6 * dpr; c.stroke(); }
    void HU;
  }
  hide(on: boolean) { this.el.style.visibility = on ? 'hidden' : ''; }
}
