// Money that floats up where it is earned, and small thought bubbles over guests. Both are HTML laid over the canvas
// at points projected from the park, so they stay crisp in either look and cost nothing to draw in the 3D scene.
// Nothing here touches the rules: a sale is a ride's income going up, a thought is a guest's newest thought changing.
import * as THREE from 'three';
import { RIDE_BY_KEY } from '../sim/rides';
import { tileAt } from '../sim/map';
import { money, type GameState, type Guest, type Thought } from '../sim/types';
import { HU } from '../three/world';
import { I } from './icons';

/** The thoughts worth a bubble, and the icon each shows. */
const BUBBLE: Record<string, [string, 'good' | 'bad' | 'need']> = {
  hungry: ['burger', 'need'], thirsty: ['drink', 'need'], toilet: ['sad', 'need'], tired: ['sad', 'need'], sick: ['sick', 'bad'],
  great: ['smile', 'good'], good_value: ['money', 'good'], scenery: ['smile', 'good'], bought: ['smile', 'good'], photo: ['camera', 'good'], picnic: ['burger', 'good'], gather: ['star', 'good'],
  bad_value: ['money', 'bad'], cant_afford: ['money', 'bad'], queue_long: ['clock', 'bad'], waiting: ['clock', 'bad'], litter: ['sad', 'bad'], disgusting: ['sick', 'bad'],
  crowded: ['guests', 'bad'], lost: ['sad', 'bad'], cant_find_exit: ['sad', 'bad'], raining: ['rain', 'bad'], too_intense: ['thrill', 'bad'], broken: ['wrench', 'bad'],
};
const POP_LIFE = 1.5, BUBBLE_LIFE = 2.6, MAX_POPS = 28, MAX_BUBBLES = 26, NEAR = 48;   // NEAR: camera distance under which bubbles show
interface Float { el: HTMLElement; x: number; y: number; z: number; born: number; life: number; guest?: Guest; key?: string; amount?: number }

export class Floaters {
  el: HTMLElement; pops: Float[] = []; bubbles: Float[] = []; money = true; thoughts = true; made = { pops: 0, bubbles: 0 };   // made: counted for the tests
  private income = new Map<number, number>(); private admissions = -1; private seen = new WeakMap<Guest, Thought | undefined>(); private v = new THREE.Vector3(); private g: GameState | null = null; private scan = 0;
  constructor(root: HTMLElement) {
    this.el = document.createElement('div'); this.el.id = 'floaters'; root.insertBefore(this.el, root.querySelector('#status'));
    try { this.money = localStorage.getItem('rct.pops') !== 'off'; this.thoughts = localStorage.getItem('rct.bubbles') !== 'off'; } catch { /* defaults */ }
  }
  set(kind: 'pops' | 'bubbles', on: boolean) { if (kind === 'pops') this.money = on; else this.thoughts = on; try { localStorage.setItem('rct.' + kind, on ? 'on' : 'off'); } catch { /* ignore */ } if (!on) this.clear(kind === 'pops' ? this.pops : this.bubbles); }
  private clear(list: Float[]) { for (const f of list) f.el.remove(); list.length = 0; }
  /** A new park: forget the old one's numbers so nothing pops for money it already had. */
  reset(g: GameState) { this.g = g; this.income.clear(); this.admissions = g.totalAdmissions; this.seen = new WeakMap(); this.clear(this.pops); this.clear(this.bubbles); for (const r of g.rides) this.income.set(r.id, r.income); }

  /** Called every frame: spot new sales and thoughts (only while the clock runs), then place and fade everything. */
  update(g: GameState, camera: THREE.Camera, canvas: HTMLCanvasElement, distance: number, now: number, running: boolean) {
    if (g !== this.g) this.reset(g);
    if (running && this.money) this.spotSales(g, now);
    if (running && this.thoughts && distance < NEAR) this.spotThoughts(g, now);
    if (!this.pops.length && !this.bubbles.length) return;
    const rect = canvas.getBoundingClientRect(), root = this.el.getBoundingClientRect();
    const place = (f: Float, rise: number, fadeFrom: number) => {
      const age = (now - f.born) / 1000; const t = age / f.life; if (t >= 1) return false;
      const x = f.guest ? f.guest.x : f.x, y = f.guest ? f.guest.y : f.y, z = f.guest ? f.guest.z * HU + 1.25 : f.z;
      this.v.set(x, z, y).project(camera); const vis = this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
      const sx = (this.v.x + 1) / 2 * rect.width + rect.left - root.left, sy = (1 - this.v.y) / 2 * rect.height + rect.top - root.top - rise * age;
      f.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`; f.el.style.opacity = vis ? String(t < fadeFrom ? 1 : 1 - (t - fadeFrom) / (1 - fadeFrom)) : '0';
      return true;
    };
    this.pops = this.pops.filter(f => place(f, 26, 0.55) || (f.el.remove(), false));
    this.bubbles = this.bubbles.filter(f => (f.guest && f.guest.state !== 'left' && f.guest.state !== 'riding' && place(f, 0, 0.75)) || (f.el.remove(), false));
  }
  private spotSales(g: GameState, now: number) {
    for (const r of g.rides) {
      const before = this.income.get(r.id); this.income.set(r.id, r.income); if (before === undefined || r.income <= before) continue;
      const d = RIDE_BY_KEY[r.type]; let x = r.x + d.size / 2, y = r.y + d.size / 2, z: number;
      if (d.kind === 'coaster') { const st = r.pieces[0]; if (!st) continue; x = st.x + 0.5; y = st.y + 0.5; z = st.z * HU + 1.3; } else z = (tileAt(g, r.x, r.y)?.h ?? 0) * HU + (d.kind === 'stall' ? 1.2 : 1.6);
      this.pop('r' + r.id, x, y, z, r.income - before, now);
    }
    if (g.totalAdmissions > this.admissions && g.finance.entranceFee > 0 && !g.noMoney) this.pop('gate', g.entrance.x + 1, g.entrance.y + 0.5, 1.6, (g.totalAdmissions - this.admissions) * g.finance.entranceFee, now);
    this.admissions = g.totalAdmissions;
  }
  /** One floating amount per place: sales close together add up instead of piling on top of each other. */
  private pop(key: string, x: number, y: number, z: number, amount: number, now: number) {
    const live = this.pops.find(f => f.key === key && now - f.born < 450);
    if (live) { live.amount = (live.amount ?? 0) + amount; live.el.textContent = '+' + money(live.amount); return; }
    const el = document.createElement('div'); el.className = 'pop'; el.textContent = '+' + money(amount); this.el.appendChild(el); this.made.pops++;
    this.pops.push({ el, x, y, z, born: now, life: POP_LIFE, key, amount }); if (this.pops.length > MAX_POPS) this.pops.shift()!.el.remove();
  }
  private spotThoughts(g: GameState, now: number) {
    // a quarter of the guests each frame: a new thought shows within four frames, at a quarter of the cost
    const n = g.guests.length, step = 4, phase = this.scan++ % step;
    for (let i = phase; i < n; i += step) {
      const gu = g.guests[i]; const th = gu.thoughts[0]; const known = this.seen.has(gu), was = this.seen.get(gu); this.seen.set(gu, th);
      if (!known || !th || th === was) continue;   // the first look at a guest only learns what they already think
      const b = BUBBLE[th.t]; if (!b || th.age > 1 || this.bubbles.length >= MAX_BUBBLES || this.bubbles.some(f => f.guest === gu)) continue;
      const el = document.createElement('div'); el.className = 'bubble ' + b[1]; el.innerHTML = I[b[0]] ?? ''; this.el.appendChild(el); this.made.bubbles++;
      this.bubbles.push({ el, x: 0, y: 0, z: 0, born: now, life: BUBBLE_LIFE, guest: gu });
    }
  }
  hide(on: boolean) { this.el.style.display = on ? 'none' : ''; }
}
