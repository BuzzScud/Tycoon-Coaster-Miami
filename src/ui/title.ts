// The title / New Park screen.
import { newGame, type NewParkOptions } from '../sim/game';
import { readSlot, slotMeta } from '../sim/save';
import type { GameState } from '../sim/types';
import { money } from '../sim/types';
import { audio } from './audio';

const NAMES = ['Whispering Pines', 'Silver Lake Gardens', 'Thunder Ridge', 'Bumbly Meadows', 'Crystal Cove', 'Maple Hollow', 'Sunset Heights', 'Dragon Falls'];
export class Title {
  el: HTMLElement; opts: NewParkOptions = { name: NAMES[Math.floor(Math.random() * NAMES.length)], size: 'medium', cash: 1000000, loan: 1000000, maxLoan: 2000000, difficulty: 'normal', sandbox: false };
  constructor(root: HTMLElement, public onStart: (g: GameState) => void) {
    this.el = root.querySelector('#title')!; this.render();
  }
  show() { this.el.style.display = ''; this.render(); }
  hide() { this.el.style.display = 'none'; }
  render() {
    const o = this.opts; const auto = slotMeta('autosave'); const slots = ['1', '2', '3'].map(s => ({ s, m: slotMeta(s) })).filter(x => x.m);
    const opt = (label: string, cur: boolean, a: string) => `<span class="kbtn ${cur ? 'on' : ''}" data-a="${a}">${label}</span>`;
    this.el.innerHTML = `<div class="tcard rct">
      <div class="logo"><span>RollerCoaster</span><span>Tycoon</span><small>remake · free play</small></div>
      <div class="tform">
        <div class="trow"><label>Park name</label><input id="tname" value="${o.name.replace(/"/g, '&quot;')}" maxlength="32"></div>
        <div class="trow"><label>Map size</label><span>${opt('Small (48)', o.size === 'small', 'size:small')}${opt('Medium (64)', o.size === 'medium', 'size:medium')}${opt('Large (96)', o.size === 'large', 'size:large')}</span></div>
        <div class="trow"><label>Starting cash</label><span>${[500000, 1000000, 2000000, 5000000].map(c => opt(money(c), o.cash === c, 'cash:' + c)).join('')}</span></div>
        <div class="trow"><label>Loan to start</label><span>${[0, 500000, 1000000, 2000000].map(c => opt(c ? money(c) : 'None', o.loan === c, 'loan:' + c)).join('')}</span></div>
        <div class="trow"><label>Difficulty</label><span>${opt('Easy', o.difficulty === 'easy', 'diff:easy')}${opt('Normal', o.difficulty === 'normal', 'diff:normal')}${opt('Hard', o.difficulty === 'hard', 'diff:hard')}</span></div>
        <div class="trow"><label>Sandbox</label><span>${opt(o.sandbox ? '☑ No money, everything free' : '☐ No money, everything free', o.sandbox, 'sandbox')}</span></div>
        <div class="thint">${o.difficulty === 'easy' ? 'Gentle hills, cheap land, 7% interest.' : o.difficulty === 'hard' ? 'Rolling land, more water, 13% interest, and guests are harder to attract.' : 'Rolling land, 10% interest.'} Running out of money only stops building; nothing ends the game.</div>
        <div class="tbtns"><span class="kbtn big" data-a="start">Start a new park</span>${auto ? `<span class="kbtn" data-a="load:autosave">Continue: ${auto.name} (${auto.date})</span>` : ''}${slots.map(x => `<span class="kbtn" data-a="load:${x.s}">Load slot ${x.s}: ${x.m!.name}</span>`).join('')}</div>
      </div>
      <div class="tfoot">Lay paths from the entrance, build rides, set prices, hire staff. Guests judge every ride by its excitement, intensity and nausea.</div>
    </div>`;
    this.el.querySelectorAll<HTMLElement>('[data-a]').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.click(); this.act(b.dataset.a!); }));
    const name = this.el.querySelector<HTMLInputElement>('#tname')!; name.addEventListener('input', () => { this.opts.name = name.value; });
  }
  act(a: string) {
    const [k, v] = a.split(':'); const o = this.opts;
    if (k === 'size') o.size = v as any; else if (k === 'cash') o.cash = +v; else if (k === 'loan') { o.loan = +v; o.maxLoan = Math.max(2000000, +v * 2); } else if (k === 'diff') o.difficulty = v as any; else if (k === 'sandbox') o.sandbox = !o.sandbox;
    else if (k === 'start') { const g = newGame({ ...o, name: o.name.trim() || 'My Park' }); this.hide(); this.onStart(g); return; }
    else if (k === 'load') { const g = readSlot(v); if (g) { this.hide(); this.onStart(g); } return; }
    this.render();
  }
}
