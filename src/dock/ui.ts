// The dock interface DOM: left dock, top chips, inspector, bottom rail, toasts, title screen.
import './dock.css';
import { I, ic } from './icons';
import { money, type GameState } from '../sim/types';
import { dateString, longDateString } from '../sim/time';
import { WEATHER_NAMES } from '../sim/weather';
import { newGame, type NewParkOptions } from '../sim/game';
import { readSlot, slotMeta } from '../sim/save';

export const DOCK_ITEMS: [string, string, string][] = [
  ['inspect', 'pointer', 'Select (Esc)'], ['land', 'land', 'Land & water (L)'], ['path', 'path', 'Paths (F)'], ['scenery', 'scenery', 'Scenery (T)'], ['newride', 'ride', 'New ride (N)'], ['demolish', 'demolish', 'Bulldozer (X)'],
  ['gap', '', ''], ['rides', 'rides', 'Rides list'], ['guests', 'guests', 'Guests'], ['staff', 'staff', 'Staff'], ['finance', 'money', 'Money'], ['research', 'research', 'Research'], ['park', 'park', 'Park'], ['save', 'save', 'Save & load (Cmd+S)'], ['options', 'options', 'Options'],
];
const NAMES = ['Whispering Pines', 'Silver Lake Gardens', 'Thunder Ridge', 'Bumbly Meadows', 'Crystal Cove', 'Maple Hollow', 'Sunset Heights', 'Dragon Falls'];

export class DockUI {
  root: HTMLElement; dock: HTMLElement; topbar: HTMLElement; inspector: HTMLElement; rail: HTMLElement; toasts: HTMLElement; title: HTMLElement; tip: HTMLElement; rideHint: HTMLElement;
  inspTitle = ''; inspHtml = ''; inspTabs: string[] = []; inspTab = 0; inspId = ''; onInspAction: ((a: string, el: HTMLElement) => void) | null = null; onInspTab: ((i: number) => void) | null = null; onClose: (() => void) | null = null;
  titleOpts: NewParkOptions = { name: NAMES[Math.floor(Math.random() * NAMES.length)], size: 'medium', cash: 1000000, loan: 1000000, maxLoan: 2000000, difficulty: 'normal', sandbox: false };
  constructor(root: HTMLElement, public onDock: (id: string) => void, public onStart: (g: GameState) => void) {
    this.root = root;
    root.innerHTML = `<canvas id="view3d"></canvas><div id="dock" class="glass"></div><div id="topbar" class="glass"></div><div id="inspector" class="glass"><div class="head"><h2></h2><button class="btn sq" data-x="close" title="Close">${I.close}</button></div><div class="tabs"></div><div class="body"></div></div><div id="rail" class="glass"></div><div id="toasts"></div><div id="tip" class="glass"></div><div id="ridecam-hint" class="glass">Ride camera · press <kbd>Esc</kbd> or <kbd>C</kbd> to get off</div><div id="title3d"></div>`;
    this.dock = root.querySelector('#dock')!; this.topbar = root.querySelector('#topbar')!; this.inspector = root.querySelector('#inspector')!; this.rail = root.querySelector('#rail')!; this.toasts = root.querySelector('#toasts')!; this.title = root.querySelector('#title3d')!; this.tip = root.querySelector('#tip')!; this.rideHint = root.querySelector('#ridecam-hint')!;
    this.dock.innerHTML = `<div class="logo">RCT 2026</div>` + DOCK_ITEMS.map(([id, icon, tip]) => id === 'gap' ? '<div class="gap"></div>' : `<div class="dk" data-id="${id}" title="${tip}">${ic(icon)}<span>${tip.replace(/ \(.*\)/, '').split(' ')[0] === '&' ? tip : tip.replace(/ \(.*\)/, '').split(' & ')[0]}</span></div>`).join('');
    this.dock.querySelectorAll<HTMLElement>('.dk').forEach(el => el.addEventListener('click', () => onDock(el.dataset.id!)));
    this.inspector.querySelector('[data-x="close"]')!.addEventListener('click', () => { this.closeInspector(); this.onClose?.(); });
    this.inspector.querySelector('.body')!.addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (el && this.onInspAction) this.onInspAction(el.dataset.a!, el); });
    this.inspector.querySelector('.body')!.addEventListener('change', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-in]'); if (el && this.onInspAction) this.onInspAction('in:' + el.dataset.in!, el); });
    this.inspector.querySelector('.body')!.addEventListener('keydown', e => { const el = e.target as HTMLElement; if ((e as KeyboardEvent).key === 'Enter' && el.dataset.in && this.onInspAction) { this.onInspAction('in:' + el.dataset.in, el); el.blur(); } });
    this.inspector.querySelector('.tabs')!.addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (el) { this.inspTab = +el.dataset.i!; this.renderTabs(); this.onInspTab?.(this.inspTab); } });
    this.renderTitle();
  }
  setDockActive(id: string) { this.dock.querySelectorAll<HTMLElement>('.dk').forEach(el => el.classList.toggle('on', el.dataset.id === id)); }
  // ---------- inspector ----------
  openInspector(id: string, title: string, tabs: string[] = [], tab = 0) {
    const same = this.inspId === id; this.inspId = id; this.inspTitle = title; this.inspTabs = tabs; if (!same) { this.inspTab = tab; this.inspHtml = ''; }
    this.inspector.classList.add('open'); this.inspector.querySelector('h2')!.textContent = title; this.renderTabs();
  }
  renderTabs() { const t = this.inspector.querySelector('.tabs') as HTMLElement; t.style.display = this.inspTabs.length ? '' : 'none'; t.innerHTML = this.inspTabs.map((n, i) => `<span class="tab ${i === this.inspTab ? 'on' : ''}" data-i="${i}">${n}</span>`).join(''); }
  setInspector(html: string, title?: string) { if (title && title !== this.inspTitle) { this.inspTitle = title; this.inspector.querySelector('h2')!.textContent = title; } if (html === this.inspHtml) return; const body = this.inspector.querySelector('.body') as HTMLElement; if (body.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT') return; this.inspHtml = html; body.innerHTML = html; }
  closeInspector() { this.inspector.classList.remove('open'); this.inspId = ''; this.inspHtml = ''; }
  // ---------- chrome ----------
  setTop(g: GameState, speedLabel: string) {
    const w = g.weather; const wIcon = w.kind >= 3 ? 'rain' : w.kind === 0 ? 'sun' : 'cloud';
    const html = `<span class="park" data-c="park">${esc(g.parkName)}</span><span class="chip" title="${WEATHER_NAMES[w.kind]}">${ic(wIcon)} ${w.temp} °C</span><span class="chip" data-c="park">${longDateString(g)}</span><span class="chip ${g.finance.cash < 0 ? 'neg' : ''}" data-c="finance">Cash <b>${g.noMoney ? 'sandbox' : money(g.finance.cash)}</b></span><span class="chip" data-c="guests">Guests <b>${g.guestsInPark}</b></span><span class="chip" data-c="park" title="Park rating ${g.rating} of 999">Rating <b>${g.rating}</b><span class="mini"><i style="width:${(g.rating / 999) * 100}%"></i></span></span><span class="speed"><button class="btn sq ${g.speed === 0 ? 'on' : ''}" data-s="0" title="Pause (P)">${I.pause}</button><button class="btn sq ${g.speed === 1 ? 'on' : ''}" data-s="1" title="Normal (1)">${I.play}</button><button class="btn sq ${g.speed === 2 ? 'on' : ''}" data-s="2" title="Fast (2)">${I.fast}</button><button class="btn sq ${g.speed >= 3 ? 'on' : ''}" data-s="3" title="Faster (3)">${I.fast}${I.fast}</button></span>`;
    if (this.topbar.innerHTML !== html) { this.topbar.innerHTML = html; this.topbar.querySelectorAll<HTMLElement>('[data-c]').forEach(el => el.onclick = () => this.onDock(el.dataset.c!)); this.topbar.querySelectorAll<HTMLElement>('[data-s]').forEach(el => el.onclick = () => { g.speed = +el.dataset.s! as any; }); }
    void speedLabel;
  }
  setRail(html: string) { if (this.rail.innerHTML !== html) this.rail.innerHTML = html; }
  toast(msg: string, err = false) { const t = document.createElement('div'); t.className = 't' + (err ? ' err' : ''); t.textContent = msg; this.toasts.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2200); while (this.toasts.children.length > 4) this.toasts.firstChild?.remove(); }
  showTip(x: number, y: number, text: string) { this.tip.textContent = text; this.tip.style.display = 'block'; this.tip.style.left = Math.min(window.innerWidth - 220, x + 14) + 'px'; this.tip.style.top = (y + 16) + 'px'; }
  hideTip() { this.tip.style.display = 'none'; }
  // ---------- title ----------
  showTitle() { this.title.style.display = ''; this.renderTitle(); } hideTitle() { this.title.style.display = 'none'; }
  renderTitle() {
    const o = this.titleOpts; const auto = slotMeta('autosave'); const slots = ['1', '2', '3'].map(s => ({ s, m: slotMeta(s) })).filter(x => x.m);
    const opt = (label: string, on: boolean, a: string) => `<button class="btn ${on ? 'on' : ''}" data-a="${a}">${label}</button>`;
    this.title.innerHTML = `<div class="card glass"><h1>RollerCoaster Tycoon<small>2026 remake · free play · built with three.js</small></h1>
      <div class="trow"><label>Park name</label><input type="text" id="tname" value="${esc(o.name)}" maxlength="32"></div>
      <div class="trow"><label>Map size</label><span class="opts">${opt('Small 48', o.size === 'small', 'size:small')}${opt('Medium 64', o.size === 'medium', 'size:medium')}${opt('Large 96', o.size === 'large', 'size:large')}</span></div>
      <div class="trow"><label>Starting cash</label><span class="opts">${[500000, 1000000, 2000000, 5000000].map(c => opt(money(c), o.cash === c, 'cash:' + c)).join('')}</span></div>
      <div class="trow"><label>Loan to start</label><span class="opts">${[0, 500000, 1000000, 2000000].map(c => opt(c ? money(c) : 'None', o.loan === c, 'loan:' + c)).join('')}</span></div>
      <div class="trow"><label>Difficulty</label><span class="opts">${opt('Easy', o.difficulty === 'easy', 'diff:easy')}${opt('Normal', o.difficulty === 'normal', 'diff:normal')}${opt('Hard', o.difficulty === 'hard', 'diff:hard')}</span></div>
      <div class="trow"><label>Sandbox</label><span class="opts">${opt((o.sandbox ? '☑' : '☐') + ' No money, everything free', o.sandbox, 'sandbox')}</span></div>
      <div class="hint">${o.difficulty === 'easy' ? 'Gentle hills, cheap land, 7% interest.' : o.difficulty === 'hard' ? 'Rolling land, more water, 13% interest, guests harder to attract.' : 'Rolling land, 10% interest.'} Running out of money only stops building; nothing ends the game.</div>
      <div class="acts"><button class="btn pri" data-a="start">${I.play} Start a new park</button>${auto ? `<button class="btn" data-a="load:autosave">${I.load} Continue: ${esc(auto.name)} · ${auto.date}</button>` : ''}${slots.map(x => `<button class="btn" data-a="load:${x.s}">${I.load} Slot ${x.s}: ${esc(x.m!.name)}</button>`).join('')}</div>
      <div class="foot">Drag to pan, right-drag to orbit, scroll to zoom. Lay paths from the entrance, build rides, set prices, hire staff. Press <kbd>C</kbd> on a running coaster to ride it.</div></div>`;
    this.title.querySelectorAll<HTMLElement>('[data-a]').forEach(b => b.addEventListener('click', () => this.titleAct(b.dataset.a!)));
    const name = this.title.querySelector<HTMLInputElement>('#tname')!; name.addEventListener('input', () => { this.titleOpts.name = name.value; });
  }
  titleAct(a: string) {
    const [k, v] = a.split(':'); const o = this.titleOpts;
    if (k === 'size') o.size = v as any; else if (k === 'cash') o.cash = +v; else if (k === 'loan') { o.loan = +v; o.maxLoan = Math.max(2000000, +v * 2); } else if (k === 'diff') o.difficulty = v as any; else if (k === 'sandbox') o.sandbox = !o.sandbox;
    else if (k === 'start') { const g = newGame({ ...o, name: o.name.trim() || 'My Park' }); this.hideTitle(); this.onStart(g); return; }
    else if (k === 'load') { const g = readSlot(v); if (g) { this.hideTitle(); this.onStart(g); } return; }
    this.renderTitle();
  }
}
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export { dateString };
