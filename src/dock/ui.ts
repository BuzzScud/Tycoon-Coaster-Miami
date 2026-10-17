// The dock interface DOM: left dock, top chips, inspector, bottom rail, toasts, title screen.
import './dock.css';
import './ink.css';
import './rct.css';
import { I, ic } from './icons';
import { money, type GameState } from '../sim/types';
import { dateString, longDateString, TEMPOS } from '../sim/time';
import { WEATHER_NAMES } from '../sim/weather';
import { newGame, type NewParkOptions } from '../sim/game';
import { readSlot, slotMeta } from '../sim/save';
import { GOAL_LENGTHS, goalRows, makeGoals, monthsFor, monthsLeft, deadline, deadlineText, deadlineShort } from '../sim/goals';
import { EVENT_NAMES } from '../sim/events';
import { SCENARIOS, SCENARIO_BY_KEY, TIERS, newScenario } from '../sim/scenarios';
import { objectiveText } from '../sim/goals';
import { readStars, unlocked, starText } from './progress';

/** The building tools along the bottom bar: id, icon, label, key. */
export const TOOLS: [string, string, string, string][] = [['inspect', 'pointer', 'Select', 'Esc'], ['land', 'land', 'Land', 'L'], ['path', 'path', 'Paths', 'F'], ['scenery', 'scenery', 'Scenery', 'T'], ['newride', 'ride', 'Rides', 'N'], ['demolish', 'demolish', 'Bulldoze', 'X']];
/** The Park window's tabs, and the system window's. */
export const PARK_TABS: [string, string][] = [['rides', 'Rides'], ['guests', 'Guests'], ['staff', 'Staff'], ['finance', 'Money'], ['research', 'Research'], ['park', 'Park'], ['news', 'Messages'], ['report', 'Report']];
export const SYS_TABS: [string, string][] = [['save', 'Save & load'], ['options', 'Options']];
const NAMES = ['Whispering Pines', 'Silver Lake Gardens', 'Thunder Ridge', 'Bumbly Meadows', 'Crystal Cove', 'Maple Hollow', 'Sunset Heights', 'Dragon Falls'];

/** One card of controls: a title, an optional row of main tabs (fixed list), an optional row of sub-tabs, and a body.
 *  Clicks on [data-a] inside the body go to onAct with the pane's current id. */
export class Pane {
  id = ''; title = ''; tabs: string[] = []; tab = 0; html = ''; main: [string, string][] = [];
  onAct: ((id: string, a: string, el: HTMLElement) => void) | null = null; onTab: ((i: number) => void) | null = null; onMain: ((id: string) => void) | null = null; onClose: (() => void) | null = null;
  constructor(public el: HTMLElement) {
    el.innerHTML = `<div class="head"><h2></h2><span class="headx"></span><button class="btn sq" data-x="close" title="Close (Esc)">${I.close}</button></div><div class="mtabs"></div><div class="tabs"></div><div class="body"></div>`;
    el.querySelector('[data-x="close"]')!.addEventListener('click', () => { this.close(); this.onClose?.(); });
    const body = el.querySelector('.body')!;
    const act = (a: string, t: HTMLElement) => { if (this.onAct) this.onAct(this.id, a, t); };
    body.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (t) act(t.dataset.a!, t); });
    el.querySelector('.headx')!.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (t) act(t.dataset.a!, t); });
    body.addEventListener('change', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-in]'); if (t) act('in:' + t.dataset.in!, t); });
    body.addEventListener('keydown', e => { const t = e.target as HTMLElement; if ((e as KeyboardEvent).key === 'Enter' && t.dataset.in) { act('in:' + t.dataset.in, t); t.blur(); } });
    el.querySelector('.tabs')!.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('.tab'); if (t) { this.tab = +t.dataset.i!; this.renderTabs(); this.onTab?.(this.tab); } });
    el.querySelector('.mtabs')!.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('.mtab'); if (t) this.onMain?.(t.dataset.w!); });
  }
  /** RCT's windows: drag one by its title bar to anywhere on the screen; it stays there (also after a reload) until its
   *  title is double-clicked. Wide screens only: on a phone the windows keep their places. */
  movable() {
    const el = this.el, head = el.querySelector('.head') as HTMLElement, key = `rct.pos.${el.id}`;
    const place = (x: number, y: number) => {
      const w = el.offsetWidth, vw = window.innerWidth, vh = window.innerHeight; x = Math.max(8, Math.min(vw - Math.min(w, vw - 16) - 8, x)); y = Math.max(8, Math.min(vh - 80, y));
      Object.assign(el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', transform: 'none', maxHeight: `calc(100% - ${y + 12}px)` }); return [x, y];
    };
    const saved = (() => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as [number, number] | null; } catch { return null; } })();
    const wide = () => window.innerWidth >= 900; if (saved && wide()) place(saved[0], saved[1]);
    head.style.cursor = 'grab'; head.title = 'Drag to move · double-click to put it back';
    head.addEventListener('pointerdown', e => {
      if (!wide() || (e.target as HTMLElement).closest('button,input,[data-a]')) return; e.preventDefault();
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; head.setPointerCapture(e.pointerId); head.style.cursor = 'grabbing';
      const move = (ev: PointerEvent) => place(ev.clientX - dx, ev.clientY - dy);
      const up = (ev: PointerEvent) => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.style.cursor = 'grab'; const p = place(ev.clientX - dx, ev.clientY - dy); try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* private window */ } };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
    head.addEventListener('dblclick', () => { for (const k of ['left', 'top', 'right', 'bottom', 'transform', 'maxHeight'] as const) el.style[k] = ''; try { localStorage.removeItem(key); } catch { /* private window */ } });
    window.addEventListener('resize', () => { if (el.style.left && wide()) place(parseFloat(el.style.left), parseFloat(el.style.top)); });
  }
  get isOpen() { return this.el.classList.contains('open'); }
  open(id: string, title: string, tabs: string[] = [], tab = 0) {
    const same = this.id === id; this.id = id; this.title = title; this.tabs = tabs; this.tab = tab; if (!same) this.html = '';   // the caller's tab is the one in use (it may have been set without a click)
    this.el.classList.add('open'); this.el.querySelector('h2')!.textContent = title; this.renderTabs();
  }
  setMain(list: [string, string][], on: string) { this.main = list; const m = this.el.querySelector('.mtabs') as HTMLElement; m.style.display = list.length ? '' : 'none'; m.innerHTML = list.map(([id, label]) => `<button class="mtab ${id === on ? 'on' : ''}" data-w="${id}">${label}</button>`).join(''); }
  setHead(html: string) { const h = this.el.querySelector('.headx') as HTMLElement; if (h.innerHTML !== html) h.innerHTML = html; }
  renderTabs() { const t = this.el.querySelector('.tabs') as HTMLElement; t.style.display = this.tabs.length ? '' : 'none'; t.innerHTML = this.tabs.map((n, i) => `<span class="tab ${i === this.tab ? 'on' : ''}" data-i="${i}">${n}</span>`).join(''); }
  setBody(html: string, title?: string) {
    if (title && title !== this.title) { this.title = title; this.el.querySelector('h2')!.textContent = title; } if (html === this.html) return;
    const body = this.el.querySelector('.body') as HTMLElement; if (body.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT') return;
    this.html = html; body.innerHTML = html;
  }
  body() { return this.el.querySelector('.body') as HTMLElement; }
  close() { this.el.classList.remove('open'); this.id = ''; this.html = ''; }
}

export class DockUI {
  root: HTMLElement; status: HTMLElement; stats: HTMLElement; bar: HTMLElement; menu: HTMLElement; vmenu: HTMLElement; toasts: HTMLElement; title: HTMLElement; tip: HTMLElement; rideHint: HTMLElement; report: HTMLElement; viewBack: HTMLElement;
  inspector: Pane; tray: Pane; win: Pane; sys: Pane; lastTop = ''; lastBar = '';
  onBar: ((a: string) => void) | null = null; onMenu: ((a: string) => void) | null = null; onView: ((a: string) => void) | null = null; onTop: ((a: string) => void) | null = null;
  titleTab: 'scen' | 'free' = (() => { try { return localStorage.getItem('rct.titleTab') === 'free' ? 'free' : 'scen'; } catch { return 'scen'; } })(); scenSel = SCENARIOS[0].key;
  titleOpts: NewParkOptions = { name: NAMES[Math.floor(Math.random() * NAMES.length)], size: 'medium', cash: 1000000, loan: 1000000, maxLoan: 2000000, difficulty: 'normal', sandbox: false, goalMinutes: 0, tempo: 0 };
  constructor(root: HTMLElement, public onStart: (g: GameState) => void) {
    this.root = root;
    root.innerHTML = `<canvas id="view3d"></canvas><div id="status" class="glass"></div><div id="stats" class="glass"></div>
      <div id="inspector" class="glass pane"></div><div id="win" class="glass pane"></div><div id="sys" class="glass pane"></div><div id="tray" class="glass pane"></div>
      <div id="bar" class="glass"></div><div id="menu" class="glass"></div><div id="vmenu" class="glass"></div>
      <div id="toasts"></div><div id="ticker" class="glass"></div><div id="tip" class="glass"></div><div id="ridecam-hint" class="glass">Ride camera · press <kbd>Esc</kbd> or <kbd>C</kbd> to get off</div><div id="title3d"></div><div id="report"></div><button id="viewonly-back" class="btn glass">Back to the park · <kbd>Esc</kbd></button>`;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.status = q('#status'); this.stats = q('#stats'); this.bar = q('#bar'); this.menu = q('#menu'); this.vmenu = q('#vmenu');
    this.vmenu.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (t) this.onView?.(t.dataset.v!); }); this.toasts = q('#toasts'); this.title = q('#title3d'); this.tip = q('#tip'); this.rideHint = q('#ridecam-hint'); this.report = q('#report'); this.viewBack = q('#viewonly-back');
    this.inspector = new Pane(q('#inspector')); this.tray = new Pane(q('#tray')); this.win = new Pane(q('#win')); this.sys = new Pane(q('#sys')); this.inspector.movable(); this.win.movable(); this.sys.movable();
    this.bar.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-b]'); if (t) this.onBar?.(t.dataset.b!); });
    this.menu.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-m]'); if (t) this.onMenu?.(t.dataset.m!); });
    for (const el of [this.status, this.stats]) el.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-c]'); if (t) this.onTop?.(t.dataset.c!); });
    this.menu.innerHTML = `<button data-m="save">${ic('save')}<span>Save &amp; load</span><kbd>⌘S</kbd></button><button data-m="options">${ic('options')}<span>Options</span></button><button data-m="undo">${ic('undo')}<span>Undo</span><kbd>⌘Z</kbd></button><span class="sep"></span><button data-m="new">${ic('park')}<span>Found a new park</span></button>`;
    this.renderTitle();
  }
  /** The menu opens above its button at the right end of the bar. */
  setMenu(open: boolean) {
    this.menu.classList.toggle('open', open); if (!open) return; const b = this.bar.querySelector('[data-b="menu"]')?.getBoundingClientRect(); const box = this.root.getBoundingClientRect();
    if (b) { this.menu.style.left = Math.max(12, Math.min(box.width - 242, b.right - box.left - 230)) + 'px'; this.menu.style.bottom = (box.bottom - b.top + 8) + 'px'; }
  }
  /** The View menu opens above its button, like the main menu. */
  setViewMenu(open: boolean, html = '', anchor = 'view') {
    this.vmenu.classList.toggle('open', open); this.vmenu.classList.toggle('wide', anchor !== 'view'); if (!open) return; if (this.vmenu.innerHTML !== html) this.vmenu.innerHTML = html;
    const b = this.bar.querySelector(`[data-b="${anchor}"]`)?.getBoundingClientRect(); const box = this.root.getBoundingClientRect(); const w = this.vmenu.offsetWidth || 250;
    if (b) { this.vmenu.style.left = Math.max(12, Math.min(box.width - w - 12, b.right - box.left - w)) + 'px'; this.vmenu.style.bottom = (box.bottom - b.top + 8) + 'px'; }
  }
  // ---------- chrome ----------
  /** Top left: the park, the day and the money. Top right: guests, rating and goals. */
  setTop(g: GameState) {
    const w = g.weather; const wIcon = w.kind >= 3 ? 'rain' : w.kind === 0 ? 'sun' : 'cloud';
    const left = `<span class="park" data-c="park">${esc(g.parkName)}</span><span class="it" data-c="park" title="${WEATHER_NAMES[w.kind]}, ${w.temp} °C">${ic(wIcon)} ${longDateString(g)}</span><span class="it ${g.finance.cash < 0 ? 'neg' : ''}" data-c="finance" title="Money">${ic('money')} <b>${g.noMoney ? 'sandbox' : money(g.finance.cash)}</b></span>`;
    const right = `<span class="it" data-c="guests" title="Guests in the park">${ic('guests')} <b>${g.guestsInPark}</b> guests</span><span class="it" data-c="park" title="Park rating ${g.rating} of 999">${ic('star')} <b>${g.rating}</b><span class="mini"><i style="width:${(g.rating / 999) * 100}%"></i></span></span>${g.event ? `<span class="it evchip" data-c="news" title="A park event: ${EVENT_NAMES[g.event.type]}">${ic('spark')} ${EVENT_NAMES[g.event.type]}${g.event.type === 'vip' ? '' : ` · ${g.event.weeksLeft} wk`}</span>` : ''}${g.goals ? goalChip(g) : ''}`;
    const html = left + '|' + right; if (this.lastTop === html) return; this.lastTop = html; this.status.innerHTML = left; this.stats.innerHTML = right;
  }
  setBar(html: string) { if (this.lastBar === html) return false; this.lastBar = html; this.bar.innerHTML = html; return true; }
  /** A message from the park, as a card under the top bar; click it to go there. */
  /** RCT's news ticker: the newest message types itself out above the tool bar, then fades; the next one waits its
   *  turn. Show goes to what it is about; the list button opens every message. */
  private tickerQ: { icon: string; text: string; onClick?: () => void }[] = []; private tickerBusy = false; onMessages: (() => void) | null = null;
  newsTicker(icon: string, text: string, onClick?: () => void) {
    this.tickerQ.push({ icon, text, onClick }); if (this.tickerQ.length > 3) this.tickerQ.splice(0, this.tickerQ.length - 3); if (!this.tickerBusy) this.nextTicker();
  }
  private nextTicker() {
    const t = this.root.querySelector('#ticker') as HTMLElement; const n = this.tickerQ.shift();
    if (!n) { this.tickerBusy = false; t.classList.remove('on'); return; }
    this.tickerBusy = true; t.style.bottom = (this.bar.offsetHeight + 22) + 'px';
    t.innerHTML = `${ic(n.icon)}<span class="tt"></span>${n.onClick ? `<button class="btn sq" data-t="go" title="Show">${ic('locate')}</button>` : ''}<button class="btn sq" data-t="all" title="All messages">${ic('news')}</button>`;
    const span = t.querySelector('.tt') as HTMLElement; t.classList.add('on');
    t.querySelector('[data-t="go"]')?.addEventListener('click', () => n.onClick?.()); t.querySelector('[data-t="all"]')!.addEventListener('click', () => this.onMessages?.());
    let i = 0; const type = () => { if (!t.isConnected) return; i = Math.min(n.text.length, i + 2); span.textContent = n.text.slice(0, i); if (i < n.text.length) setTimeout(type, 28); else setTimeout(() => this.nextTicker(), this.tickerQ.length ? 1800 : 5000); };
    type();
  }
  newsToast(icon: string, text: string, onClick?: () => void) {
    const t = document.createElement('div'); t.className = 't news' + (onClick ? ' go' : ''); t.innerHTML = `${ic(icon)}<span>${esc(text)}</span>`; if (onClick) { t.style.pointerEvents = 'auto'; t.onclick = () => { onClick(); t.remove(); }; }
    this.toasts.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 4500); while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
  }
  toast(msg: string, err = false) { const t = document.createElement('div'); t.className = 't' + (err ? ' err' : ''); t.textContent = msg; this.toasts.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2200); while (this.toasts.children.length > 4) this.toasts.firstChild?.remove(); }
  showTip(x: number, y: number, text: string) { this.tip.textContent = text; this.tip.style.display = 'block'; this.tip.style.left = Math.min(window.innerWidth - 220, x + 14) + 'px'; this.tip.style.top = (y + 16) + 'px'; }
  hideTip() { this.tip.style.display = 'none'; }
  // ---------- title ----------
  showTitle() { this.title.style.display = ''; this.renderTitle(); } hideTitle() { this.title.style.display = 'none'; }
  renderTitle() {
    const o = this.titleOpts; const auto = slotMeta('autosave'); const slots = ['1', '2', '3'].map(s => ({ s, m: slotMeta(s) })).filter(x => x.m);
    const opt = (label: string, on: boolean, a: string) => `<button class="btn ${on ? 'on' : ''}" data-a="${a}">${label}</button>`;
    const resume = `${auto ? `<button class="btn" data-a="load:autosave">${I.load} Continue: ${esc(auto.name)} · ${auto.date}</button>` : ''}${slots.map(x => `<button class="btn" data-a="load:${x.s}">${I.load} Slot ${x.s}: ${esc(x.m!.name)}</button>`).join('')}`;
    const tabs = `<div class="ttabs">${opt('Scenarios', this.titleTab === 'scen', 'ttab:scen')}${opt('Free play', this.titleTab === 'free', 'ttab:free')}</div>`;
    const tempoRow = `<div class="trow"><label>Tempo</label><span class="opts">${TEMPOS.map((t, i) => opt(t.name, (o.tempo ?? 0) === i, 'tempo:' + i)).join('')}</span></div>`;
    if (this.titleTab === 'scen') {
      const stars = readStars(); const sel = SCENARIO_BY_KEY[this.scenSel] ?? SCENARIOS[0]; const open = unlocked(sel, stars);
      const cards = SCENARIOS.map(s => { const lock = !unlocked(s, stars); const n = stars[s.key] ?? 0;
        return `<div class="scard ${s.key === sel.key ? 'on' : ''} ${lock ? 'locked' : ''}" data-a="scen:${s.key}"><b>${esc(s.name)}</b><span class="tier">${TIERS[s.tier]} · by ${deadlineShort(monthsFor(s.minutes))}</span><span class="stars ${n ? 'got' : ''}">${lock ? 'locked' : starText(n)}</span></div>`; }).join('');
      this.title.innerHTML = `<div class="card glass wide"><h1>RollerCoaster Tycoon<small>2026 remake · drawn in ink · built with three.js</small></h1>${tabs}
        <div class="sgrid">${cards}</div>
        <div class="sdet"><b>${esc(sel.name)}</b> · ${TIERS[sel.tier]} · ${sel.size} map · ${money(sel.cash)} to start${sel.loan ? ` and a ${money(sel.loan)} loan` : ''}<p>${esc(sel.blurb)}</p><p class="goals">Goals by ${deadlineText(monthsFor(sel.minutes))} (about ${sel.minutes} minutes at normal tempo): ${sel.objectives.map(objectiveText).join(', ')}. Hold them all for two minutes. Three stars with half the time to spare, two with a quarter.</p>${open ? '' : `<p class="warn">Finish any ${TIERS[sel.tier - 1]} park to open this one.</p>`}</div>
        ${tempoRow}
        <div class="acts"><button class="btn pri" data-a="play" ${open ? '' : 'disabled'}>${open ? `${I.play} Play ${esc(sel.name)}` : `Locked: finish a ${TIERS[sel.tier - 1]} park first`}</button>${resume}</div>
        <div class="foot">Every scenario starts with a few rides; research brings the rest. Drag to pan, right-drag to orbit, scroll to zoom.</div></div>`;
      this.title.querySelectorAll<HTMLElement>('[data-a]').forEach(b => b.addEventListener('click', () => this.titleAct(b.dataset.a!)));
      return;
    }
    this.title.innerHTML = `<div class="card glass"><h1>RollerCoaster Tycoon<small>2026 remake · drawn in ink · built with three.js</small></h1>${tabs}
      <div class="trow"><label>Park name</label><input type="text" id="tname" value="${esc(o.name)}" maxlength="32"></div>
      <div class="trow"><label>Map size</label><span class="opts">${opt('Small 48', o.size === 'small', 'size:small')}${opt('Medium 64', o.size === 'medium', 'size:medium')}${opt('Large 96', o.size === 'large', 'size:large')}${opt('Huge 128', o.size === 'huge', 'size:huge')}</span></div>
      <div class="trow"><label>Starting cash</label><span class="opts">${[500000, 1000000, 2000000, 5000000].map(c => opt(money(c), o.cash === c, 'cash:' + c)).join('')}</span></div>
      <div class="trow"><label>Loan to start</label><span class="opts">${[0, 500000, 1000000, 2000000].map(c => opt(c ? money(c) : 'None', o.loan === c, 'loan:' + c)).join('')}</span></div>
      <div class="trow"><label>Difficulty</label><span class="opts">${opt('Easy', o.difficulty === 'easy', 'diff:easy')}${opt('Normal', o.difficulty === 'normal', 'diff:normal')}${opt('Hard', o.difficulty === 'hard', 'diff:hard')}</span></div>
      <div class="trow"><label>Goals</label><span class="opts">${opt('Off · free play', !o.goalMinutes, 'goals:0')}${GOAL_LENGTHS.map(m => opt(`By ${deadlineShort(monthsFor(m))}`, o.goalMinutes === m, 'goals:' + m)).join('')}</span></div>
      <div class="trow"><label>Tempo</label><span class="opts">${TEMPOS.map((t, i) => opt(t.name, (o.tempo ?? 0) === i, 'tempo:' + i)).join('')}</span></div>
      <div class="trow"><label>Sandbox</label><span class="opts">${opt((o.sandbox ? '☑' : '☐') + ' No money, everything free', o.sandbox, 'sandbox')}</span></div>
      <div class="hint">${o.difficulty === 'easy' ? 'Gentle hills, cheap land, 7% interest.' : o.difficulty === 'hard' ? 'Rolling land, more water, 13% interest, guests harder to attract.' : 'Rolling land, 10% interest.'} Running out of money only stops building.${o.sandbox ? ' Sandbox: no money, and every ride and scenery set is available.' : ''}</div>
      <div class="hint">${goalHint(o)} ${TEMPOS[o.tempo ?? 0].hint}</div>
      <div class="acts"><button class="btn pri" data-a="start">${I.play} Start a new park</button>${resume}</div>
      <div class="foot">Drag to pan, right-drag to orbit, scroll to zoom. Lay paths from the entrance, build rides, set prices, hire staff. Press <kbd>C</kbd> on a running coaster to ride it.</div></div>`;
    this.title.querySelectorAll<HTMLElement>('[data-a]').forEach(b => b.addEventListener('click', () => this.titleAct(b.dataset.a!)));
    const name = this.title.querySelector<HTMLInputElement>('#tname')!; name.addEventListener('input', () => { this.titleOpts.name = name.value; });
  }
  titleAct(a: string) {
    const [k, v] = a.split(':'); const o = this.titleOpts;
    if (k === 'size') o.size = v as any; else if (k === 'cash') o.cash = +v; else if (k === 'loan') { o.loan = +v; o.maxLoan = Math.max(2000000, +v * 2); } else if (k === 'diff') o.difficulty = v as any; else if (k === 'sandbox') o.sandbox = !o.sandbox; else if (k === 'goals') o.goalMinutes = +v; else if (k === 'tempo') o.tempo = +v;
    else if (k === 'start') { const g = newGame({ ...o, name: o.name.trim() || 'My Park' }); this.hideTitle(); this.onStart(g); return; }
    else if (k === 'ttab') { this.titleTab = v === 'free' ? 'free' : 'scen'; try { localStorage.setItem('rct.titleTab', this.titleTab); } catch { /* ignore */ } }
    else if (k === 'scen') this.scenSel = v;
    else if (k === 'play') { const s = SCENARIO_BY_KEY[this.scenSel]; if (!s || !unlocked(s)) return; const g = newScenario(s.key, o.tempo ?? 0); this.hideTitle(); this.onStart(g); return; }
    else if (k === 'load') { readSlot(v).then(g => { if (g) { this.hideTitle(); this.onStart(g); } }); return; }
    this.renderTitle();
  }
}
function goalChip(g: GameState): string {
  const o = g.goals!; const rows = goalRows(g, o); const met = rows.filter(r => r.ok).length; const left = monthsLeft(g, o); const by = deadline(g, o).by;
  const state = o.state === 'met' ? 'Goals met' : o.state === 'timeup' ? 'Time is up' : `by ${deadlineShort(by)} · ${left >= 1 ? `${Math.floor(left)} mo` : `${Math.max(1, Math.ceil(left * 4))} wk`} left`;
  return `<span class="chip goalchip" data-c="report" title="Goals by ${deadlineText(by)}: ${rows.map(r => r.label).join(', ')}">${ic('clock')} ${state} · <b>${met}/${rows.length}</b> goals</span>`;
}
function goalHint(o: NewParkOptions): string {
  if (!o.goalMinutes) return 'Free play: no clock, the park never ends, and every ride and scenery set is available from the start. Open the Report any time to see how it is going.';
  const gl = makeGoals({ noMoney: o.sandbox, tick: 0 } as GameState, o.goalMinutes, o.size, o.difficulty);
  return `By ${deadlineText(gl.byMonth!)} (about ${o.goalMinutes} minutes at normal tempo): ${gl.guests} guests in the park, a rating of ${gl.rating}${gl.cash ? `, ${money(gl.cash)} on hand` : ''}. Hold them all for two minutes to win; you can keep playing after.`;
}
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export { dateString };
