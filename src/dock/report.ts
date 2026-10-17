// The park report: the verdict, headline numbers, the goals, three small charts on one time axis (guests, cash,
// rating — one measure each, never two scales on one chart), a table view, and the chronicle of every message.
import { MONTHS, MONTH_TICKS, money, type GameState } from '../sim/types';
import { clock, goalRows, verdict, sampleHistory, goalTarget, fmtGoal, type HistPoint } from '../sim/goals';
import { esc } from './ui';

const W = 640, H = 78, PL = 64, PR = 70, PT = 8, PB = 6;
const dateAt = (t: number) => { const m = Math.floor(t / MONTH_TICKS); return `${MONTHS[m % 8]}, Year ${Math.floor(m / 8) + 1}`; };
interface Series { key: 'guests' | 'cash' | 'rating'; title: string; fmt: (v: number) => string; target?: number }

function chart(h: HistPoint[], s: Series, t0: number, t1: number): string {
  const vals = h.map(p => p[s.key]); const lo = Math.min(0, ...vals, s.target ?? 0); let hi = Math.max(...vals, s.target ?? 0, s.key === 'rating' ? 999 : 1); if (hi === lo) hi = lo + 1;
  const x = (t: number) => PL + ((t - t0) / Math.max(1, t1 - t0)) * (W - PL - PR), y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const d = h.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join('');
  const years: string[] = []; for (let yr = MONTH_TICKS * 8; yr < t1; yr += MONTH_TICKS * 8) if (yr > t0) years.push(`<line x1="${x(yr)}" x2="${x(yr)}" y1="${PT}" y2="${H - PB}" class="yr"/><text x="${x(yr) + 3}" y="${PT + 8}" class="lab">Year ${Math.round(yr / (MONTH_TICKS * 8)) + 1}</text>`);
  const last = h[h.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" class="rc" data-k="${s.key}" role="img" aria-label="${s.title} over the park's life">
    <line x1="${PL}" x2="${W - PR}" y1="${y(lo)}" y2="${y(lo)}" class="base"/>${years.join('')}
    ${s.target ? `<line x1="${PL}" x2="${W - PR}" y1="${y(s.target)}" y2="${y(s.target)}" class="goal"/><text x="${W - PR + 6}" y="${y(s.target) + 3}" class="lab">goal ${s.fmt(s.target)}</text>` : ''}
    <path d="${d}" class="ln"/><circle cx="${x(last.t)}" cy="${y(last[s.key])}" r="3" class="dot"/>
    <text x="${PL - 8}" y="${PT + 10}" class="ttl" text-anchor="end">${s.title}</text><text x="${PL - 8}" y="${PT + 24}" class="lab" text-anchor="end">${s.fmt(last[s.key])}</text>
    <line class="cross" x1="0" x2="0" y1="${PT}" y2="${H - PB}" style="display:none"/><circle class="hov" r="4" style="display:none"/>
    <rect x="${PL}" y="0" width="${W - PL - PR}" height="${H}" class="hit" data-lo="${lo}" data-hi="${hi}"/></svg>`;
}

/** The report as the full overlay (goals ended), or embedded in the Park window's Report tab. */
export function reportHtml(g: GameState, embedded = false): string {
  if (!g.history?.length || g.history[g.history.length - 1].t !== g.tick) sampleHistory(g);
  const h = g.history!; const t0 = h[0].t, t1 = Math.max(h[h.length - 1].t, t0 + 1); const v = verdict(g); const o = g.goals;
  const tile = (big: string, small: string) => `<div class="tile"><b>${big}</b><span>${small}</span></div>`;
  const series: Series[] = [
    { key: 'guests', title: 'Guests', fmt: n => String(Math.round(n)), target: goalTarget(o, 'guests') },
    { key: 'cash', title: 'Cash', fmt: n => money(n), target: goalTarget(o, 'cash') },
    { key: 'rating', title: 'Rating', fmt: n => String(Math.round(n)), target: goalTarget(o, 'rating') },
  ];
  const step = Math.max(1, Math.ceil(h.length / 40));
  const rows = h.filter((_, i) => i % step === 0 || i === h.length - 1).map(p => `<tr><td>${dateAt(p.t)}</td><td>${clock(p.t)}</td><td>${p.guests}</td><td>${money(p.cash)}</td><td>${p.rating}</td></tr>`).join('');
  const chron = (g.chronicle ?? []).map(c => `<div class="ch"><span>${clock(c.tick)}</span><span>${esc(c.text)}</span></div>`).join('');
  return `${embedded ? '<div class="rep">' : `<div class="card glass rep" role="dialog" aria-label="${v.title}">`}
    <div class="rh"><div><h2>${v.title}</h2><p>${esc(g.parkName)} · ${v.line}</p></div>${embedded ? '' : '<button class="btn sq" data-r="close" title="Close (Esc)">×</button>'}</div>
    <div class="tiles">${tile(clock(g.tick), 'played')}${tile(String(g.guestsInPark), 'guests now')}${tile(String(g.totalAdmissions), 'admissions')}${tile(g.noMoney ? 'sandbox' : money(g.finance.cash), 'cash')}${tile(String(g.rating), 'rating')}${tile(String(g.rides.length), 'rides & stalls')}</div>
    ${o ? `<div class="goals">${goalRows(g, o).map(r => `<span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '·'} ${r.label}: ${fmtGoal(r.now, r.fmt)}${r.key === 'noLoan' ? '' : ` of ${fmtGoal(r.target, r.fmt)}`}</span>`).join('')}</div>` : ''}
    <div class="charts">${series.map(s => chart(h, s, t0, t1)).join('')}<div class="rtip" style="display:none"></div></div>
    <details class="tbl"><summary>Show as a table</summary><table><thead><tr><th>Date</th><th>Play</th><th>Guests</th><th>Cash</th><th>Rating</th></tr></thead><tbody>${rows}</tbody></table></details>
    <h3>Chronicle</h3><div class="chron">${chron || '<div class="ch"><span></span><span>Nothing has happened yet.</span></div>'}</div>
    <div class="acts"><button class="btn pri" data-r="close">Keep playing</button><button class="btn" data-r="new">Found a new park</button><button class="btn" data-r="look">Look at the park</button></div></div>`;
}

/** Hover: one crosshair across the three charts and a tooltip with the date and all three values. */
export function bindReport(root: HTMLElement, g: GameState, onAct: (a: string) => void) {
  root.querySelectorAll<HTMLElement>('[data-r]').forEach(b => b.onclick = () => onAct(b.dataset.r!));
  const h = g.history ?? []; if (h.length < 2) return; const t0 = h[0].t, t1 = Math.max(h[h.length - 1].t, t0 + 1); const tip = root.querySelector<HTMLElement>('.rtip')!;
  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg.rc')];
  const show = (i: number | null, ev?: MouseEvent) => {
    for (const svg of svgs) {
      const cross = svg.querySelector<SVGLineElement>('.cross')!, dot = svg.querySelector<SVGCircleElement>('.hov')!, hit = svg.querySelector<SVGRectElement>('.hit')!;
      if (i === null) { cross.style.display = dot.style.display = 'none'; continue; }
      const p = h[i], k = svg.dataset.k as 'guests' | 'cash' | 'rating', lo = +hit.dataset.lo!, hi = +hit.dataset.hi!;
      const x = PL + ((p.t - t0) / (t1 - t0)) * (W - PL - PR), y = PT + (1 - (p[k] - lo) / (hi - lo)) * (H - PT - PB);
      cross.setAttribute('x1', String(x)); cross.setAttribute('x2', String(x)); dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y)); cross.style.display = dot.style.display = '';
    }
    if (i === null || !ev) { tip.style.display = 'none'; return; }
    const p = h[i]; tip.innerHTML = `<b>${dateAt(p.t)}</b> · ${clock(p.t)}<br>Guests ${p.guests} · Cash ${money(p.cash)} · Rating ${p.rating}`; tip.style.display = '';
    const box = (root.querySelector('.charts') as HTMLElement).getBoundingClientRect(); tip.style.left = Math.min(box.width - 260, Math.max(0, ev.clientX - box.left + 12)) + 'px'; tip.style.top = (ev.clientY - box.top + 12) + 'px';
  };
  for (const svg of svgs) {
    const hit = svg.querySelector<SVGRectElement>('.hit')!;
    hit.addEventListener('mousemove', ev => { const r = svg.getBoundingClientRect(); const fx = ((ev.clientX - r.left) / r.width) * W; const t = t0 + ((fx - PL) / (W - PL - PR)) * (t1 - t0); let best = 0; for (let i = 1; i < h.length; i++) if (Math.abs(h[i].t - t) < Math.abs(h[best].t - t)) best = i; show(best, ev); });
    hit.addEventListener('mouseleave', () => show(null));
  }
}
