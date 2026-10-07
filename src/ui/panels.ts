// Every window's contents. openPanel(app, id) opens or focuses a window; each window re-renders itself 4× a second.
import { money, type Dir, type GameState, type Ride, type Guest } from '../sim/types';
import { RIDE_TYPES, RIDE_BY_KEY, CATEGORY_NAMES, ratingWord, fmtRating, COLOURS, COLOUR_NAMES, BREAKDOWN_NAMES } from '../sim/rides';
import { SCENERY, SCENERY_GROUPS } from '../sim/scenery';
import { PIECE_BY_KEY } from '../sim/track';
import { cmdDemolishRide, cmdRemovePiece, pieceCost, undo, news } from '../sim/game';
import { CATEGORIES, borrow, repay, monthProfit, RESEARCH_COST } from '../sim/finance';
import { CAMPAIGNS, startCampaign } from '../sim/marketing';
import { itemName, itemCategory } from '../sim/research';
import { AWARDS } from '../sim/awards';
import { dateString, ticksToClock, longDateString, year } from '../sim/time';
import { writeSlot, readSlot, slotMeta, clearSlot, downloadFile, pickFile, serialize, deserialize } from '../sim/save';
import { openRide, testRide, closeRide, rideTestSummary } from '../sim/ridesim';
import { hireStaff, fireStaff, STAFF_WAGES, STAFF_NAMES } from '../sim/staff';
import { svg } from './icons';
import type { App } from './app';
import type { Win } from './windows';
import { audio } from './audio';
import { rideLength } from '../render/rideDraw';

const b = (label: string, a: string, on = false, extra = '') => `<span class="kbtn ${on ? 'on' : ''}" data-a="${a}" ${extra}>${label}</span>`;
const ib = (icon: string, a: string, on = false, tip = '') => `<span class="kbtn ${on ? 'on' : ''}" data-a="${a}" title="${tip}">${svg(icon)}</span>`;
const stat = (k: string, v: string, cls = '') => `<div class="stat"><span>${k}</span><b class="${cls}">${v}</b></div>`;
const bar = (pct: number, col: string) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${col}"></i></div>`;
const ratingCls = (v: number) => (v >= 600 ? 'rating-hi' : v >= 300 ? 'rating-med' : '');
const m2ft = (m: number) => Math.round(m * 3.281).toLocaleString('en-US') + ' ft';
const mph = (ms: number) => Math.round(ms * 2.237) + ' mph';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function wire(win: Win, handler: (a: string, el: HTMLElement, ev: Event) => void) {
  win.body.addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (el) { audio.unlock(); audio.click(); handler(el.dataset.a!, el, e); win.lastHtml = ''; win.update?.(); } });
  win.body.addEventListener('change', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-in]'); if (el) { handler('in:' + el.dataset.in!, el, e); win.lastHtml = ''; win.update?.(); } });
  win.body.addEventListener('keydown', e => { const el = (e.target as HTMLElement); if (e.key === 'Enter' && el.dataset.in) { handler('in:' + el.dataset.in, el, e); el.blur(); win.lastHtml = ''; win.update?.(); } });
}

export function openPanel(app: App, id: string) {
  const [kind, arg] = id.split(':'); const g = app.g;
  switch (kind) {
    case 'land': return landWin(app);
    case 'path': return pathWin(app);
    case 'scenery': return sceneryWin(app);
    case 'newride': return newRideWin(app);
    case 'build': return buildWin(app, +arg);
    case 'ride': return rideWin(app, +arg);
    case 'guest': return guestWin(app, +arg);
    case 'staff': return arg ? staffWin(app, +arg) : staffListWin(app);
    case 'finance': return financeWin(app, 0);
    case 'research': return financeWin(app, 3);
    case 'rides': return ridesListWin(app);
    case 'guests': return guestsListWin(app);
    case 'park': return parkWin(app);
    case 'options': return optionsWin(app);
    case 'save': return saveWin(app);
    case 'news': return newsWin(app);
    case 'map': return parkWin(app);
  }
  void g;
}

// ---------- land ----------
function landWin(app: App) {
  const w = app.wm.open({ id: 'land', title: 'Land and water', cls: 'land', x: 12, y: 46, w: 232 });
  w.update = () => { const t = app.tool; const T = t.kind === 'land' ? t : null;
    w.html(`<div class="sect"><div class="lab">Tool</div>${ib('up', 'raise', T?.mode === 'raise', 'Raise land')}${ib('down', 'lower', T?.mode === 'lower', 'Lower land')}${ib('water', 'water', T?.mode === 'water', 'Water: lowers a tile and floods it')}${ib('land', 'surface', T?.mode === 'surface', 'Change the ground type')}${ib('money', 'buy', T?.mode === 'buy', 'Buy land')}</div>
      <div class="sect"><div class="lab">Ground</div>${['Grass', 'Sand', 'Dirt', 'Rock'].map((n, i) => `<span class="kbtn sw ${T?.surf === i && T?.mode === 'surface' ? 'on' : ''}" data-a="surf${i}" title="${n}"><i style="background:${['#4e8a35', '#d9c88a', '#8a6a3a', '#8c8c8c'][i]}"></i></span>`).join('')}</div>
      <div class="sect"><div class="lab">Brush</div>${[1, 2, 3].map(n => b(`${n}×${n}`, 'brush' + n, T?.brush === n)).join('')}</div>
      <div class="hint">${T?.mode === 'buy' ? `Buying land costs ${money(app.g.landPrice)} a tile. Dark tiles are not yours yet.` : T?.mode === 'water' ? 'Click grass to flood it, click water to drain it ($25).' : T?.mode === 'surface' ? 'Click to paint the ground type (free).' : 'Click a tile to move it up or down one step ($20 a tile).'}</div>`); };
  wire(w, a => { const t = app.tool.kind === 'land' ? app.tool : { kind: 'land' as const, mode: 'raise' as const, brush: 1, surf: 0 }; if (a === 'raise' || a === 'lower' || a === 'water' || a === 'surface' || a === 'buy') app.setTool({ ...t, mode: a }); else if (a.startsWith('surf')) app.setTool({ ...t, mode: 'surface', surf: +a.slice(4) }); else if (a.startsWith('brush')) app.setTool({ ...t, brush: +a.slice(5) }); });
  w.onClose = () => { if (app.tool.kind === 'land') app.setTool({ kind: 'inspect' }); };
  if (app.tool.kind !== 'land') app.setTool({ kind: 'land', mode: 'raise', brush: 1, surf: 0 }); w.update();
}
// ---------- paths ----------
function pathWin(app: App) {
  const w = app.wm.open({ id: 'path', title: 'Footpaths', cls: 'path', x: 12, y: 46, w: 232 });
  w.update = () => { const t = app.tool; const T = t.kind === 'path' ? t : null; const A = t.kind === 'pathAdd' ? t : null;
    w.html(`<div class="sect"><div class="lab">Path style</div>${['Tarmac', 'Brick', 'Paving'].map((n, i) => `<span class="kbtn sw ${T?.style === i && !T.remove ? 'on' : ''}" data-a="style${i}" title="${n}"><i style="background:${['#9a9590', '#a8785a', '#a2a9a3'][i]}"></i></span>`).join('')}</div>
      <div class="sect"><div class="lab">Type</div>${b('Footpath', 'path', !!T && !T.queue && !T.remove)}${b('Queue line', 'queue', !!T && T.queue && !T.remove)}${b('Remove', 'remove', !!T && T.remove)}</div>
      <div class="sect"><div class="lab">Path items</div>${ib('bench', 'bench', A?.what === 'bench', 'Bench $15')}${ib('lamp', 'lamp', A?.what === 'lamp', 'Lamp $7')}${ib('bin', 'bin', A?.what === 'bin', 'Litter bin $9')}</div>
      <div class="hint">${A ? 'Click a path tile to add it.' : T?.remove ? 'Click or drag along paths to remove them.' : T?.queue ? 'Queue lines lead from a path to a ride entrance ($15 a tile).' : 'Click or drag to lay path ($10 a tile). A path next to a tile one step higher becomes a ramp.'}</div>`); };
  wire(w, a => { const T = app.tool.kind === 'path' ? app.tool : { kind: 'path' as const, queue: false, style: 0, remove: false }; if (a.startsWith('style')) app.setTool({ ...T, style: +a.slice(5), remove: false }); else if (a === 'path') app.setTool({ ...T, queue: false, remove: false }); else if (a === 'queue') app.setTool({ ...T, queue: true, remove: false }); else if (a === 'remove') app.setTool({ ...T, remove: true }); else if (a === 'bench' || a === 'lamp' || a === 'bin') app.setTool({ kind: 'pathAdd', what: a }); });
  w.onClose = () => { if (app.tool.kind === 'path' || app.tool.kind === 'pathAdd') app.setTool({ kind: 'inspect' }); };
  if (app.tool.kind !== 'path' && app.tool.kind !== 'pathAdd') app.setTool({ kind: 'path', queue: false, style: 0, remove: false }); w.update();
}
// ---------- scenery ----------
function sceneryWin(app: App) {
  const w = app.wm.open({ id: 'scenery', title: 'Scenery', cls: 'scenery', x: 12, y: 46, w: 300, tabs: SCENERY_GROUPS.map(gp => ({ icon: gp.key === 'trees' ? 'scenery' : gp.key === 'gardens' ? 'thrill' : 'bench', tip: gp.name })) });
  w.update = () => { const grp = SCENERY_GROUPS[w.tab]; const t = app.tool; const T = t.kind === 'scenery' ? t : null; const inv = app.g.research.invented.includes('scenery:' + grp.key);
    const items = SCENERY.filter(s => s.group === grp.key).map(s => `<span class="kbtn item ${T?.item === s.key && !T.remove ? 'on' : ''}" data-a="item:${s.key}" title="${s.name}">${s.name}<em>${money(s.cost)}</em></span>`).join('');
    w.html(`<div class="sect"><div class="lab">${grp.name}${inv ? '' : ' (not yet researched)'}</div><div class="grid">${inv ? items : '<div class="hint">Fund research to unlock this group.</div>'}</div></div>
      <div class="sect">${b('Rotate (R)', 'rotate')}${b('Remove', 'remove', !!T?.remove)}</div><div class="hint">${T?.remove ? 'Click scenery to remove it.' : 'Click a tile to place the item. Scenery near a ride makes it more exciting.'}</div>`); };
  wire(w, a => { const T = app.tool.kind === 'scenery' ? app.tool : null; if (a.startsWith('item:')) app.setTool({ kind: 'scenery', item: a.slice(5), rot: T?.rot ?? 0, remove: false }); else if (a === 'rotate') app.rotateTool(); else if (a === 'remove') app.setTool({ kind: 'scenery', item: T?.item ?? 'tree_oak', rot: 0, remove: true }); });
  w.onClose = () => { if (app.tool.kind === 'scenery') app.setTool({ kind: 'inspect' }); };
  w.update();
}
// ---------- new ride ----------
function newRideWin(app: App) {
  const cats = ['gentle', 'thrill', 'coaster', 'stall'];
  const w = app.wm.open({ id: 'newride', title: 'New rides and shops', cls: 'newride', x: 12, y: 46, w: 380, tabs: [{ icon: 'gentle', tip: 'Gentle rides' }, { icon: 'thrill', tip: 'Thrill rides' }, { icon: 'coaster', tip: 'Roller coasters' }, { icon: 'stall', tip: 'Shops and stalls' }] });
  w.update = () => { const cat = cats[w.tab]; const t = app.tool; const sel = t.kind === 'ride' || t.kind === 'coasterStart' ? t.type : null;
    const rows = RIDE_TYPES.filter(r => r.category === cat || (cat === 'coaster' && r.kind === 'coaster')).map(r => { const inv = app.g.research.invented.includes(r.key); return `<div class="row ${inv ? '' : 'dim'} ${sel === r.key ? 'on' : ''}" data-a="${inv ? 'pick:' + r.key : 'none'}"><b>${r.name}</b><span class="cost">${inv ? money(r.cost) + (r.coaster ? ' + track' : '') : 'Not researched'}</span><small>${r.description}</small></div>`; }).join('');
    w.html(`<div class="lab">${CATEGORY_NAMES[cat]}</div><div class="list">${rows}</div><div class="hint">${sel ? `Click a spot on the map to place it. Press R to rotate.${cat === 'coaster' ? ' The first station piece goes where you click.' : ' The entrance goes on the side the door faces.'}` : 'Pick a ride, then click the map.'}</div>`); };
  wire(w, a => { if (a.startsWith('pick:')) { const key = a.slice(5); const def = RIDE_BY_KEY[key]; app.setTool(def.kind === 'coaster' ? { kind: 'coasterStart', type: key, rot: 0 } : { kind: 'ride', type: key, rot: 0 }); } });
  w.onClose = () => { if (app.tool.kind === 'ride' || app.tool.kind === 'coasterStart') app.setTool({ kind: 'inspect' }); };
  w.update();
}
// ---------- coaster construction ----------
function buildWin(app: App, rideId: number) {
  const g = app.g; const ride = g.rides.find(r => r.id === rideId); if (!ride) return;
  const w = app.wm.open({ id: 'build:' + rideId, title: `${ride.name} construction`, cls: 'build', x: 12, y: 46, w: 262 });
  w.update = () => { const s = app.buildSel; const r = g.rides.find(x => x.id === rideId); if (!r) { w.close(); return; } const key = app.currentPieceKey(); const cost = key ? pieceCost(r, key) : 0;
    const len = rideLength(r); const maxZ = r.pieces.reduce((m, p) => Math.max(m, p.z), 0);
    const special = (k: string, icon: string, tip: string) => ib(icon, 'sp:' + k, s.special === k, tip);
    w.html(`<div class="sect"><div class="lab">Direction</div>${ib('curveL2', 'dir:left2', s.dir === 'left2' && !s.special, 'Large turn left')}${ib('curveL', 'dir:left', s.dir === 'left' && !s.special, 'Small turn left')}${ib('straight', 'dir:straight', s.dir === 'straight' && !s.special, 'Straight')}${ib('curveR', 'dir:right', s.dir === 'right' && !s.special, 'Small turn right')}${ib('curveR2', 'dir:right2', s.dir === 'right2' && !s.special, 'Large turn right')}</div>
      <div class="sect"><div class="lab">Slope</div>${ib('steepDown', 'slope:steepDown', s.slope === 'steepDown' && !s.special, 'Steep down')}${ib('down', 'slope:down', s.slope === 'down' && !s.special, 'Down')}${ib('level', 'slope:level', s.slope === 'level' && !s.special, 'Level')}${ib('up', 'slope:up', s.slope === 'up' && !s.special, 'Up')}${ib('steepUp', 'slope:steepUp', s.slope === 'steepUp' && !s.special, 'Steep up')}${ib('chain', 'chain', s.chain, 'Chain lift on this piece')}</div>
      <div class="sect"><div class="lab">Banking (turns)</div>${ib('bankL', 'bank:-1', s.bank === -1, 'Bank left')}${ib('level', 'bank:0', s.bank === 0, 'No banking')}${ib('bankR', 'bank:1', s.bank === 1, 'Bank right')}</div>
      <div class="sect"><div class="lab">Special pieces</div>${special('station', 'train', 'Station platform')}${special('loop', 'loop', 'Vertical loop')}${special('sbendL', 'sbendL', 'S-bend left')}${special('sbendR', 'sbendR', 'S-bend right')}${special('brakes', 'brakes', 'Brakes')}${special('booster', 'booster', 'Booster')}${special('photo', 'photo', 'On-ride photo')}</div>
      <div class="sect center">${b('◀ Remove last', 'remove')}${b(r.closedLoop ? 'Circuit complete' : 'Build this (Enter)', 'build', false, r.closedLoop ? 'style="opacity:.5"' : 'style="font-weight:700;min-width:120px"')}</div>
      <div class="sect center">${b(svg('entrance') + ' Entrance', 'entrance', r.entrance !== null)}${b(svg('exit') + ' Exit', 'exit', r.exit !== null)}${b('Ride window', 'ridewin')}</div>
      <div class="cost">${key ? `${PIECE_BY_KEY[key].name}: ${money(cost)}` : 'Turns must be level'}</div>
      <div class="hint">${r.pieces.length} pieces · ${m2ft(len)} · highest ${Math.round(maxZ * 1.5)} m${r.closedLoop ? ' · <b>circuit complete</b>' : ''}${r.closedLoop && r.entrance && r.exit ? ' · ready to test' : r.closedLoop ? ' · needs an entrance and exit next to the station' : ''}</div>`); };
  wire(w, a => { const s = app.buildSel; const r = g.rides.find(x => x.id === rideId); if (!r) return;
    if (a.startsWith('dir:')) { s.dir = a.slice(4) as any; s.special = null; } else if (a.startsWith('slope:')) { s.slope = a.slice(6) as any; s.special = null; if (s.slope !== 'level') s.dir = 'straight'; }
    else if (a.startsWith('bank:')) s.bank = +a.slice(5) as any; else if (a === 'chain') s.chain = !s.chain; else if (a.startsWith('sp:')) s.special = s.special === a.slice(3) ? null : a.slice(3);
    else if (a === 'build') app.buildPiece(); else if (a === 'remove') app.report(cmdRemovePiece(g, rideId));
    else if (a === 'entrance') { app.setTool({ kind: 'entrance', rideId, exit: false }); app.toast('Click a tile next to the station'); } else if (a === 'exit') { app.setTool({ kind: 'entrance', rideId, exit: true }); app.toast('Click a tile next to the station'); }
    else if (a === 'ridewin') rideWin(app, rideId); });
  w.onClose = () => { if (app.tool.kind === 'coaster' && app.tool.rideId === rideId) app.setTool({ kind: 'inspect' }); };
  if (!(app.tool.kind === 'coaster' && app.tool.rideId === rideId) && !(app.tool.kind === 'entrance')) app.setTool({ kind: 'coaster', rideId });
  app.overlay.selectedRide = rideId; w.update();
}
// ---------- ride window ----------
function rideWin(app: App, rideId: number) {
  const g = app.g; const ride0 = g.rides.find(r => r.id === rideId); if (!ride0) return; const def = RIDE_BY_KEY[ride0.type];
  const tabs = def.kind === 'stall' ? [{ icon: 'view', tip: 'Overview' }, { icon: 'finance', tip: 'Prices and income' }, { icon: 'paint', tip: 'Colours' }] : [{ icon: 'view', tip: 'Overview' }, { icon: 'stats', tip: 'Ratings and measurements' }, { icon: 'cog', tip: 'Operating' }, { icon: 'finance', tip: 'Income' }, { icon: 'paint', tip: 'Colours' }, { icon: 'guests', tip: 'Customers' }];
  const w = app.wm.open({ id: 'ride:' + rideId, title: ride0.name, cls: 'ride', x: window.innerWidth - 420, y: 60, w: 372, tabs });
  w.update = () => {
    const r = g.rides.find(x => x.id === rideId); if (!r) { w.close(); return; } w.setTitle(r.name); const d = RIDE_BY_KEY[r.type]; const tab = d.kind === 'stall' ? ['view', 'income', 'colours'][w.tab] : ['view', 'stats', 'operating', 'income', 'colours', 'customers'][w.tab];
    let h = '';
    if (tab === 'view') {
      const status = r.breakdown ? `<b class="bad">Broken down: ${BREAKDOWN_NAMES[r.breakdown.type]}${r.breakdown.mechanicId !== null ? ' (mechanic on the way)' : ''}</b>` : r.status === 'open' ? '<b class="good">Open</b>' : r.status === 'testing' ? '<b>Testing</b>' : '<b>Closed</b>';
      const needs = d.kind === 'coaster' ? (!r.closedLoop ? 'Track is not a complete circuit yet.' : !r.entrance || !r.exit ? 'Needs an entrance and an exit next to the station.' : !r.stats ? 'Test the ride before opening it.' : r.stats.completed ? '' : `Test failed: ${r.stats.failReason}`) : (!r.entrance || !r.exit ? 'Needs an entrance and an exit.' : '');
      h += `<div class="stat"><input data-in="name" value="${esc(r.name)}" maxlength="32" style="width:60%"><span>${d.name}</span></div><div class="stat"><span>Status:</span>${status}</div>${needs ? `<div class="hint warn">${needs}</div>` : ''}
        <div class="sect center">${b(svg('check') + ' Open', 'open', r.status === 'open')}${d.kind !== 'stall' ? b(svg('play') + ' Test', 'test', r.status === 'testing') : ''}${b('Close', 'close', r.status === 'closed')}</div>
        <div class="sect center">${d.kind === 'coaster' && !r.closedLoop ? b('Construction', 'construct') : ''}${!r.entrance ? b(svg('entrance') + ' Entrance', 'entrance') : ''}${!r.exit ? b(svg('exit') + ' Exit', 'exit') : ''}${b('Locate', 'locate')}${b('Demolish', 'demolish')}</div>
        <div class="hint">${d.description}</div>${d.kind !== 'stall' ? stat('In the queue:', String(r.queue.length)) + stat('Riding now:', d.kind === 'coaster' ? String(r.trains.reduce((a, t) => a + t.riders.length, 0)) : String(r.riders.length)) + stat('Popularity:', r.popularity === 255 ? 'Unknown' : Math.round(r.popularity / 2.55) + '%') : ''}`;
    } else if (tab === 'stats') {
      if (r.ratings) h += stat('Excitement rating:', `${fmtRating(r.ratings.e)} (${ratingWord(r.ratings.e)})`, ratingCls(r.ratings.e)) + stat('Intensity rating:', `${fmtRating(r.ratings.i)} (${ratingWord(r.ratings.i)})`, ratingCls(r.ratings.i)) + stat('Nausea rating:', `${fmtRating(r.ratings.n)} (${ratingWord(r.ratings.n)})`, ratingCls(r.ratings.n));
      else h += '<div class="hint">No ratings yet: test the ride.</div>';
      const s = r.stats;
      if (s) h += `<div class="sp"></div>${stat('Max. speed:', mph(s.maxSpeed))}${stat('Average speed:', mph(s.avgSpeed))}${stat('Ride time:', ticksToClock(s.duration))}${stat('Ride length:', m2ft(s.length))}${stat("Max. positive vertical G's:", s.maxPosG.toFixed(2) + 'g')}${stat("Max. negative vertical G's:", s.maxNegG.toFixed(2) + 'g')}${stat("Max. lateral G's:", s.maxLatG.toFixed(2) + 'g')}${stat("Total 'air' time:", (s.airTime / 40).toFixed(2) + ' secs')}${stat('Drops:', String(s.drops))}${stat('Highest drop height:', Math.round(s.highestDrop * 1.5 * 3.281) + ' ft')}${stat('Inversions:', String(s.inversions))}${s.completed ? '' : `<div class="hint warn">${s.failReason}</div>`}`;
      h += `<div class="sp"></div>${stat('Reliability:', Math.round(r.reliability / 250) + '%')}${bar(r.reliability / 250, '#2a9d2a')}${stat('Down time:', r.downtime + '%')}${bar(r.downtime, '#d33')}${stat('Age:', `${g.monthsElapsed - r.built} months`)}${stat('Breakdowns so far:', String(r.crashes))}`;
    } else if (tab === 'operating') {
      const v = r.value / 10; const verdict = !r.ratings ? '' : r.price === 0 ? 'Free' : r.price > v * 2 ? '<b class="bad">Too expensive</b>' : r.price <= v / 2 ? '<b class="good">Good value</b>' : '<b>Fair</b>';
      h += `<div class="stat"><span>Ride price:</span><span>${b('−', 'price-')}<b>${money(r.price)}</b>${b('+', 'price+')}</span></div><div class="stat"><span>Guests will pay up to about ${money(Math.max(0, r.value * 2 / 10))}${g.finance.entranceFee ? ' (less, since they paid to enter)' : ''}</span>${verdict}</div>`;
      if (r.pieces.some(p => p.type === 'photo')) h += `<div class="stat"><span>On-ride photo price:</span><span>${b('−', 'price2-')}<b>${money(r.price2)}</b>${b('+', 'price2+')}</span></div>`;
      h += `<div class="sect"><div class="lab">Inspection interval</div>${[10, 20, 30, 45, 60, 120, 0].map(n => b(n ? n + ' min' : 'Never', 'insp' + n, r.inspection === n)).join('')}</div>`;
      if (d.kind === 'coaster') h += `<div class="stat"><span>Trains:</span><span>${b('−', 'trains-')}<b>${r.numTrains}</b>${b('+', 'trains+')}</span></div><div class="stat"><span>Cars per train:</span><span>${b('−', 'cars-')}<b>${r.carsPerTrain}</b>${b('+', 'cars+')}</span></div><div class="hint">Changes take effect on the next test or opening.</div>`;
    } else if (tab === 'income') {
      const month = r.incomeHist[0] || 0;
      if (d.kind === 'stall') h += `<div class="stat"><span>${d.facility === 'toilet' ? 'Toilet fee' : d.item ? 'Price of ' + d.item : 'Price'}:</span><span>${b('−', 'price-')}<b>${money(r.price)}</b>${b('+', 'price+')}</span></div>${d.item ? stat('Cost to you per item:', money(d.itemCost!)) : ''}${d.item2 ? `<div class="stat"><span>Price of ${d.item2}:</span><span>${b('−', 'price2-')}<b>${money(r.price2)}</b>${b('+', 'price2+')}</span></div>` : ''}`;
      h += `${stat('Customers so far:', r.customers.toLocaleString('en-US'))}${stat('Customers per hour:', String(Math.round((r.recent[0] || 0) * 12)))}${stat('Income this month:', money(month))}${stat('Total income:', money(r.income))}${stat('Running cost per fortnight:', money(d.upkeep))}${stat('Ride value (for pricing):', money(r.value / 10))}`;
      const hist = r.incomeHist.slice(0, 8).reverse(); const max = Math.max(1, ...hist); h += `<div class="lab">Income, last ${hist.length} months</div><div class="bars">${hist.map(v => `<i style="height:${(v / max) * 40}px" title="${money(v)}"></i>`).join('')}</div>`;
    } else if (tab === 'colours') {
      const names = d.kind === 'coaster' ? ['Cars', 'Track', 'Station'] : ['Body', 'Trim', 'Roof'];
      h += names.map((n, i) => `<div class="sect"><div class="lab">${n}: ${COLOUR_NAMES[r.colours[i] % 16]}</div>${COLOURS.map((c, ci) => `<span class="kbtn sw ${r.colours[i] === ci ? 'on' : ''}" data-a="col${i}:${ci}" title="${COLOUR_NAMES[ci]}"><i style="background:${c}"></i></span>`).join('')}</div>`).join('');
    } else if (tab === 'customers') {
      const guests = g.guests.filter(gu => gu.rideId === rideId || gu.headingTo === rideId);
      h += `${stat('Heading here or riding:', String(guests.length))}${stat('Thought it was great:', String(r.thoughtGood))}${stat('Complained about it:', String(r.thoughtBad))}<div class="list">${guests.slice(0, 20).map(gu => `<div class="row" data-a="guest:${gu.id}"><b>${gu.name}</b><small>${gu.state}</small></div>`).join('')}</div>`;
    }
    w.html(h);
  };
  wire(w, (a, el) => { const r = g.rides.find(x => x.id === rideId); if (!r) return; const d = RIDE_BY_KEY[r.type];
    if (a === 'in:name') { const v = (el as HTMLInputElement).value.trim(); if (v) r.name = v; }
    else if (a === 'open') { const why = openRide(g, r); if (why) app.toast(why); else audio.money(); }
    else if (a === 'test') { const why = testRide(g, r); if (why) app.toast(why); }
    else if (a === 'close') closeRide(g, r);
    else if (a === 'construct') { app.setTool({ kind: 'coaster', rideId }); buildWin(app, rideId); }
    else if (a === 'entrance') { app.setTool({ kind: 'entrance', rideId, exit: false }); app.toast('Click a tile next to the ride'); }
    else if (a === 'exit') { app.setTool({ kind: 'entrance', rideId, exit: true }); app.toast('Click a tile next to the ride'); }
    else if (a === 'locate') { app.centerOn(r.x + 1, r.y + 1); app.overlay.selectedRide = rideId; }
    else if (a === 'demolish') { if (confirm(`Demolish ${r.name}? You get half the build cost back.`)) { app.report(cmdDemolishRide(g, rideId)); w.close(); app.wm.close('build:' + rideId); } }
    else if (a === 'price-') r.price = Math.max(0, r.price - 10); else if (a === 'price+') r.price = Math.min(20000, r.price + 10);
    else if (a === 'price2-') r.price2 = Math.max(0, r.price2 - 10); else if (a === 'price2+') r.price2 = Math.min(20000, r.price2 + 10);
    else if (a.startsWith('insp')) r.inspection = +a.slice(4);
    else if (a === 'trains-') r.numTrains = Math.max(1, r.numTrains - 1); else if (a === 'trains+') r.numTrains = Math.min(4, r.numTrains + 1);
    else if (a === 'cars-') r.carsPerTrain = Math.max(1, r.carsPerTrain - 1); else if (a === 'cars+') r.carsPerTrain = Math.min(8, r.carsPerTrain + 1);
    else if (a.startsWith('col')) { const [i, c] = a.slice(3).split(':'); r.colours[+i] = +c; }
    else if (a.startsWith('guest:')) guestWin(app, +a.slice(6));
    void d; });
  app.overlay.selectedRide = rideId; w.update();
}
// ---------- guest window ----------
const THOUGHT_ICON: Record<string, string> = { hungry: 'burger', thirsty: 'drink', toilet: 'sad', sick: 'sick', great: 'smile', good_value: 'money', bad_value: 'sad', too_intense: 'thrill', more_thrilling: 'thrill', sickening: 'sick', tired: 'sad', lost: 'sad', cant_find_exit: 'sad', go_home: 'sad', litter: 'sad', disgusting: 'sick', crowded: 'sad', scenery: 'smile', clean: 'smile', queue_long: 'sad', spent_money: 'money', cant_afford: 'money', not_safe: 'crash', wow: 'smile', vandalism: 'sad', broken: 'wrench', raining: 'rain', fun: 'smile', help: 'sad', bought: 'balloon', closed: 'sad', waiting: 'sad' };
export function thoughtText(t: { t: string; arg?: string }): string {
  const a = t.arg ?? ''; const map: Record<string, string> = { hungry: "I'm hungry", thirsty: "I'm thirsty", toilet: 'I need to go to the toilet', sick: "I feel sick", very_sick: "I feel very sick", great: `${a} was great!`, good_value: `${a} is really good value`, bad_value: `I'm not paying that much to go on ${a}`, too_intense: `${a} looks too intense for me`, more_thrilling: `I want to go on something more thrilling than ${a}`, sickening: `${a} looks too sickening for me`, tired: "I'm tired", lost: "I'm lost!", cant_find_exit: "I can't find the park exit", go_home: 'I want to go home', litter: 'The litter here is really bad', disgusting: 'This path is disgusting', crowded: "It's too crowded here", scenery: 'The scenery here is wonderful', clean: 'This park is very clean and tidy', queue_long: `The queue for ${a} is too long`, spent_money: "I've spent all my money", cant_afford: `I can't afford ${a}`, not_safe: `I'm not going on ${a}, it isn't safe`, wow: 'Wow!', vandalism: 'The vandalism here is really bad', broken: `${a} has broken down`, raining: "I'm getting wet", fun: "I'm having a great time!", help: 'Help! I feel ill', bought: `I'm so glad I got a ${a}`, closed: `${a} is closed`, waiting: `I've been waiting ages for ${a}`, closed_park: 'The park is closed', fee: 'The entrance fee is too high', exciting: `${a} looks exciting` };
  return map[t.t] ?? t.t;
}
function guestWin(app: App, id: number) {
  const g = app.g; const gu0 = g.guests.find(x => x.id === id); if (!gu0) return;
  const w = app.wm.open({ id: 'guest:' + id, title: gu0.name, cls: 'guest', x: 16, y: window.innerHeight - 400, w: 246, tabs: [{ icon: 'thought', tip: 'Thoughts' }, { icon: 'stats', tip: 'Needs' }, { icon: 'balloon', tip: 'Items and money' }] });
  w.update = () => { const gu = g.guests.find(x => x.id === id); if (!gu || gu.state === 'left') { w.html('<div class="hint">This guest has left the park.</div>'); return; } w.setTitle(gu.name); let h = '';
    const tab = ['thoughts', 'stats', 'items'][w.tab];
    if (tab === 'thoughts') { h += `<div class="thoughts">${gu.thoughts.slice(0, 6).map(t => `<div class="thought">${svg(THOUGHT_ICON[t.t] ?? 'thought')}<span>${thoughtText(t)}</span></div>`).join('') || '<div class="hint">Nothing on their mind.</div>'}</div><div class="sp"></div>${stat('Doing:', { entering: 'Walking in', walking: 'Walking around', queuing: 'Queuing for ' + (g.rides.find(r => r.id === gu.rideId)?.name ?? 'a ride'), riding: 'On ' + (g.rides.find(r => r.id === gu.rideId)?.name ?? 'a ride'), sitting: 'Sitting on a bench', buying: 'Buying something', leaving: 'Leaving the park', left: 'Left', watching: 'Watching a ride' }[gu.state])}${gu.headingTo !== null ? stat('Heading to:', g.rides.find(r => r.id === gu.headingTo)?.name ?? '?') : ''}<div class="sect center">${b(svg('view') + (gu.flags.tracked ? ' Stop following' : ' Follow'), 'track', gu.flags.tracked)}${b('Locate', 'locate')}</div>`; }
    else if (tab === 'stats') { const pct = (v: number) => Math.round(v / 2.55); h += `${stat('Happiness', pct(gu.happiness) + '%')}${bar(pct(gu.happiness), '#2a9d2a')}${stat('Energy', pct(gu.energy) + '%')}${bar(pct(gu.energy), '#2a9d2a')}${stat('Hunger', pct(255 - gu.hunger) + '%')}${bar(pct(255 - gu.hunger), '#d33')}${stat('Thirst', pct(255 - gu.thirst) + '%')}${bar(pct(255 - gu.thirst), '#e9c21f')}${stat('Nausea', pct(gu.nausea) + '%')}${bar(pct(gu.nausea), '#8fbf3a')}${stat('Toilet', pct(gu.toilet) + '%')}${bar(pct(gu.toilet), '#e9c21f')}<div class="sp"></div>${stat('Likes rides between:', `${gu.intMin} and ${gu.intMax} intensity`)}${stat('Nausea tolerance:', ['none', 'low', 'average', 'high'][gu.nauseaTol])}${stat('Rides taken:', String(gu.ridesTaken))}${stat('Favourite ride:', g.rides.find(r => r.id === gu.favourite)?.name ?? 'None yet')}`; }
    else { const items: string[] = []; if (gu.items.balloon !== null) items.push(COLOUR_NAMES[gu.items.balloon % 16] + ' balloon'); if (gu.items.umbrella) items.push('Umbrella'); if (gu.items.map) items.push('Park map'); if (gu.items.hat) items.push('Hat'); if (gu.items.food) items.push(gu.items.food); if (gu.items.drink) items.push(gu.items.drink); if (gu.items.photo) items.push('On-ride photo'); if (gu.vouchers) items.push(`${gu.vouchers} voucher(s)`);
      h += `${stat('Cash in pocket:', money(gu.cash))}${stat('Cash spent:', money(gu.spent))}${stat('Time in park:', ticksToClock(g.tick - gu.entered))}<div class="lab">Carrying</div><div class="hint">${items.length ? items.join(', ') : 'Nothing'}</div>`; }
    w.html(h); };
  wire(w, a => { const gu = g.guests.find(x => x.id === id); if (!gu) return; if (a === 'track') { for (const o of g.guests) if (o !== gu) o.flags.tracked = false; gu.flags.tracked = !gu.flags.tracked; app.overlay.selectedGuest = gu.flags.tracked ? gu.id : null; } else if (a === 'locate') app.centerOn(gu.x, gu.y); });
  w.update();
}
// ---------- staff ----------
function staffListWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'staff', title: 'Staff', cls: 'staff', x: 300, y: 80, w: 360 });
  w.update = () => { const counts = (t: string) => g.staff.filter(s => s.type === t).length;
    w.html(`<div class="lab">Hire</div><div class="sect">${(['handyman', 'mechanic', 'security', 'entertainer'] as const).map(t => `<span class="kbtn item" data-a="hire:${t}">${svg(t)} ${STAFF_NAMES[t]}<em>${money(STAFF_WAGES[t])}/month · ${counts(t)}</em></span>`).join('')}</div>
      <div class="hint">Handymen sweep litter and empty bins. Mechanics inspect and fix rides. Security stops vandals. Entertainers cheer up queues.</div>
      <div class="list tall">${g.staff.map(s => `<div class="row" data-a="open:${s.id}"><b>${svg(s.type)} ${s.name}</b><small>${STAFF_NAMES[s.type]} · ${s.state}</small></div>`).join('') || '<div class="hint">Nobody hired yet.</div>'}</div>`); };
  wire(w, a => { if (a.startsWith('hire:')) { const r = hireStaff(g, a.slice(5) as any); if (typeof r === 'string') app.toast(r); else { app.toast(`${r.name} hired`); audio.money(); } } else if (a.startsWith('open:')) staffWin(app, +a.slice(5)); });
  w.update();
}
function staffWin(app: App, id: number) {
  const g = app.g; const s0 = g.staff.find(x => x.id === id); if (!s0) return;
  const w = app.wm.open({ id: 'staff:' + id, title: s0.name, cls: 'staff', x: 320, y: 120, w: 250 });
  w.update = () => { const s = g.staff.find(x => x.id === id); if (!s) { w.close(); return; } const st = s.stats;
    w.html(`${stat('Job:', STAFF_NAMES[s.type])}${stat('Doing:', s.state)}${stat('Wages:', money(STAFF_WAGES[s.type]) + ' per month')}<div class="sp"></div>${s.type === 'handyman' ? stat('Litter swept:', String(st.litterSwept)) + stat('Bins emptied:', String(st.binsEmptied)) + stat('Lawns mown:', String(st.lawnsMown)) : s.type === 'mechanic' ? stat('Rides fixed:', String(st.ridesFixed)) + stat('Rides inspected:', String(st.ridesInspected)) : s.type === 'security' ? stat('Vandals stopped:', String(st.vandalsStopped)) : ''}<div class="sect center">${b('Locate', 'locate')}${b('Fire', 'fire')}</div>`); };
  wire(w, a => { const s = g.staff.find(x => x.id === id); if (!s) return; if (a === 'locate') app.centerOn(s.x, s.y); else if (a === 'fire') { fireStaff(g, id); w.close(); } });
  w.update();
}
// ---------- finance ----------
function financeWin(app: App, tab: number) {
  const g = app.g; const w = app.wm.open({ id: 'finance', title: 'Finances', cls: 'finance', x: 260, y: 70, w: 440, tabs: [{ icon: 'finance', tip: 'Summary' }, { icon: 'money', tip: 'Loan' }, { icon: 'marketing', tip: 'Marketing' }, { icon: 'research', tip: 'Research' }], tab });
  if (w.tab !== tab && !w.lastHtml) { w.tab = tab; w.renderTabs(); }
  w.update = () => { const f = g.finance; let h = '';
    if (w.tab === 0) { const months = f.expenditure.slice(0, 4); h += `<table class="tbl"><tr><th></th>${months.map((_, i) => `<th>${i === 0 ? 'This month' : i === 1 ? 'Last month' : i + ' months ago'}</th>`).join('')}</tr>${CATEGORIES.map((c, ci) => `<tr><td>${c}</td>${months.map(m => `<td class="${m[ci] < 0 ? 'neg' : ''}">${money(m[ci])}</td>`).join('')}</tr>`).join('')}<tr class="tot"><td>Net</td>${months.map((_, i) => `<td class="${monthProfit(g, i) < 0 ? 'neg' : ''}">${money(monthProfit(g, i))}</td>`).join('')}</tr></table>${stat('Cash:', money(f.cash))}${stat('Park value:', money(f.value))}${stat('Company value:', money(f.companyValue))}`; }
    else if (w.tab === 1) h += `${stat('Current loan:', money(f.loan))}${stat('Maximum loan:', money(f.maxLoan))}${stat('Interest:', f.interestRate + '% per year')}<div class="sect center">${b('Borrow $1,000', 'borrow1')}${b('Borrow $5,000', 'borrow5')}${b('Repay $1,000', 'repay1')}${b('Repay $5,000', 'repay5')}</div><div class="hint">Interest is charged every week. Company value = park value − loan + cash.</div>`;
    else if (w.tab === 2) h += `<div class="list">${CAMPAIGNS.map(c => { const running = g.campaigns.find(x => x.type === c.key); return `<div class="row"><b>${c.name}</b><span class="cost">${money(c.cost)}/week</span><small>${running ? `Running, ${running.weeksLeft} week(s) left` : [1, 2, 4, 6].map(wk => b(wk + ' wk', `camp:${c.key}:${wk}`)).join('')}</small></div>`; }).join('')}</div><div class="hint">Ride campaigns use your most popular open ride. Campaigns bring extra guests while they run.</div>`;
    else { const r = g.research; const pri = f.researchPriorities; h += `<div class="sect"><div class="lab">Funding: ${money(RESEARCH_COST[f.researchFunding])} per month</div>${['None', 'Minimum', 'Normal', 'Maximum'].map((n, i) => b(n, 'fund' + i, f.researchFunding === i)).join('')}</div><div class="sect"><div class="lab">Research into</div>${Object.keys(pri).map(k => b((pri[k] ? '☑ ' : '☐ ') + ({ gentle: 'Gentle rides', thrill: 'Thrill rides', coaster: 'Roller coasters', stall: 'Shops & stalls', scenery: 'Scenery' } as any)[k], 'pri:' + k, pri[k])).join('')}</div>${stat('Currently researching:', r.current ? itemName(r.current) + ' (' + itemCategory(r.current) + ')' : r.stage === 'done' ? 'Everything is invented' : 'Nothing (no funding)')}${stat('Stage:', { initial: 'Initial research', designing: 'Designing', completing: 'Completing design', done: 'Finished', idle: '-' }[r.stage])}${bar((r.progress / 65535) * 100, '#2b6cd9')}${stat('Last invented:', r.lastInvented ? itemName(r.lastInvented) : '-')}<div class="lab">Still to discover</div><div class="hint">${r.queue.slice(0, 12).map(itemName).join(', ')}${r.queue.length > 12 ? '…' : ''}</div>`; }
    w.html(h); };
  wire(w, a => { if (a === 'borrow1') { if (!borrow(g, 100000)) app.toast('Cannot borrow more'); } else if (a === 'borrow5') { if (!borrow(g, 500000)) app.toast('Cannot borrow more'); } else if (a === 'repay1') { if (!repay(g, 100000)) app.toast('Nothing to repay or not enough cash'); } else if (a === 'repay5') { if (!repay(g, 500000)) app.toast('Nothing to repay or not enough cash'); }
    else if (a.startsWith('camp:')) { const [, t, wk] = a.split(':'); const best = [...g.rides].filter(r => r.status === 'open' && RIDE_BY_KEY[r.type].kind !== 'stall').sort((x, y) => y.popularity - x.popularity)[0]; const err = startCampaign(g, +t, +wk, best ? best.id : null); if (err) app.toast(err); else { audio.money(); news(g, 'marketing', `${CAMPAIGNS[+t].name} has started.`); } }
    else if (a.startsWith('fund')) g.finance.researchFunding = +a.slice(4) as any; else if (a.startsWith('pri:')) g.finance.researchPriorities[a.slice(4)] = !g.finance.researchPriorities[a.slice(4)]; });
  w.update();
}
// ---------- lists ----------
function ridesListWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'rides', title: 'Rides and shops', cls: 'rides', x: 300, y: 80, w: 400 });
  w.update = () => { w.html(`<div class="list tall">${g.rides.map(r => { const d = RIDE_BY_KEY[r.type]; const st = r.breakdown ? '<span class="bad">Broken down</span>' : r.status === 'open' ? '<span class="good">Open</span>' : r.status === 'testing' ? 'Testing' : d.kind === 'coaster' && !r.closedLoop ? 'Under construction' : 'Closed'; return `<div class="row" data-a="ride:${r.id}"><b>${r.name}</b><span class="cost">${st}</span><small>${d.name}${r.ratings ? ` · E ${fmtRating(r.ratings.e)} I ${fmtRating(r.ratings.i)} N ${fmtRating(r.ratings.n)}` : ''} · ${r.customers} customers</small></div>`; }).join('') || '<div class="hint">No rides yet. Click the coaster button in the toolbar to build one.</div>'}</div>`); };
  wire(w, a => { if (a.startsWith('ride:')) { const id = +a.slice(5); const r = g.rides.find(x => x.id === id); if (r) { app.centerOn(r.x, r.y); rideWin(app, id); } } });
  w.update();
}
function guestsListWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'guests', title: 'Guests', cls: 'guests', x: 300, y: 80, w: 400 });
  w.update = () => { const gs = g.guests.filter(x => x.state !== 'left'); const avg = (f: (x: Guest) => number) => gs.length ? Math.round(gs.reduce((a, x) => a + f(x), 0) / gs.length / 2.55) : 0;
    w.html(`${stat('Guests in park:', String(gs.length))}${stat('Total admissions:', String(g.totalAdmissions))}${stat('Average happiness:', avg(x => x.happiness) + '%')}${stat('Hungry:', String(gs.filter(x => x.hunger < 60).length))}${stat('Thirsty:', String(gs.filter(x => x.thirst < 60).length))}${stat('Need the toilet:', String(gs.filter(x => x.toilet > 160).length))}${stat('Feeling sick:', String(gs.filter(x => x.nausea > 140).length))}${stat('Lost:', String(g.lostCount))}<div class="list tall">${gs.slice(0, 60).map(gu => `<div class="row" data-a="guest:${gu.id}"><b>${gu.name}</b><small>${gu.thoughts[0] ? thoughtText(gu.thoughts[0]) : gu.state}</small></div>`).join('')}</div>`); };
  wire(w, a => { if (a.startsWith('guest:')) { const gu = g.guests.find(x => x.id === +a.slice(6)); if (gu) { app.centerOn(gu.x, gu.y); guestWin(app, gu.id); } } });
  w.update();
}
// ---------- park ----------
function parkWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'park', title: g.parkName, cls: 'park', x: 260, y: 70, w: 400, tabs: [{ icon: 'park', tip: 'Park' }, { icon: 'graph', tip: 'Graphs' }, { icon: 'award', tip: 'Awards' }] });
  w.update = () => { w.setTitle(g.parkName); let h = '';
    if (w.tab === 0) h += `<div class="stat"><input data-in="name" value="${esc(g.parkName)}" maxlength="32" style="width:60%"><span>${longDateString(g)}</span></div>${stat('Park rating:', String(g.rating))}${bar(g.rating / 9.99, g.rating > 700 ? '#2a9d2a' : g.rating > 400 ? '#e9c21f' : '#d33')}${stat('Guests in park:', String(g.guestsInPark))}${stat('Guests the park can draw:', String(g.suggestedMax))}${stat('Park value:', money(g.finance.value))}${stat('Company value:', money(g.finance.companyValue))}<div class="stat"><span>Entrance fee:</span><span>${b('−', 'fee-')}<b>${g.finance.entranceFee ? money(g.finance.entranceFee) : 'Free'}</b>${b('+', 'fee+')}</span></div><div class="hint">A fee above what the rides are worth keeps guests away. Guests who paid to enter pay less for rides.</div><div class="sect center">${b(g.parkOpen ? 'Close park' : 'Open park', 'toggle', g.parkOpen)}${b('Locate entrance', 'locate')}</div>`;
    else if (w.tab === 1) { const graph = (title: string, data: number[], max: number, col: string) => { const d = data.slice(-120); return `<div class="lab">${title}</div><div class="bars">${d.map(v => `<i style="height:${Math.min(40, (v / max) * 40)}px;background:${col}"></i>`).join('')}</div>`; }; h += graph('Park rating, last 120 days', g.ratingHist, 999, '#2a9d2a') + graph('Guests in park', g.guestHist, Math.max(50, ...g.guestHist), '#2b6cd9') + graph('Cash', g.cashHist.map(v => Math.max(0, v)), Math.max(100000, ...g.cashHist), '#e9c21f'); }
    else h += `<div class="list">${g.awards.map(a => `<div class="row"><b>${svg('award')} ${AWARDS[a.type].name}</b><small>${AWARDS[a.type].positive ? 'Brings more guests' : 'Keeps guests away'} · ${a.time} month(s) left</small></div>`).join('') || '<div class="hint">No awards yet. Awards are judged at the start of each month.</div>'}</div>`;
    w.html(h); };
  wire(w, (a, el) => { if (a === 'in:name') { const v = (el as HTMLInputElement).value.trim(); if (v) g.parkName = v; } else if (a === 'fee-') g.finance.entranceFee = Math.max(0, g.finance.entranceFee - 100); else if (a === 'fee+') g.finance.entranceFee = Math.min(10000, g.finance.entranceFee + 100); else if (a === 'toggle') g.parkOpen = !g.parkOpen; else if (a === 'locate') app.centerOn(g.entrance.x, g.entrance.y - 4); });
  w.update();
}
// ---------- options / save / news ----------
function optionsWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'options', title: 'Options', cls: 'options', x: 300, y: 80, w: 300 });
  w.update = () => w.html(`<div class="sect"><div class="lab">Sound</div>${b(svg('sound') + ' On', 'snd1', audio.on)}${b(svg('mute') + ' Off', 'snd0', !audio.on)}</div><div class="sect"><div class="lab">Game speed</div>${['Pause', 'Normal', 'Fast', 'Faster', 'Fastest'].map((n, i) => b(n, 'spd' + i, g.speed === i)).join('')}</div><div class="sect"><div class="lab">View</div>${b('Reset zoom', 'zoom')}${b('Rotate', 'rot')}</div><div class="lab">Keys</div><div class="hint">Arrows / WASD pan · Q E rotate · + − zoom · P or Space pause · 1-4 speed · R rotate the item you are placing · Esc cancel · X bulldozer · F paths · T scenery · L land · N new ride · Enter build piece · Backspace remove piece · Cmd+Z undo · Cmd+S save</div><div class="hint">Autosave happens every in-game month. Right-drag or drag the map to pan, scroll to zoom.</div>`);
  wire(w, a => { if (a === 'snd1') audio.on = true; else if (a === 'snd0') audio.on = false; else if (a.startsWith('spd')) g.speed = +a.slice(3) as any; else if (a === 'zoom') app.cam.scale = 2; else if (a === 'rot') app.rotate(1); });
  w.update();
}
function saveWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'save', title: 'Save and load', cls: 'save', x: 300, y: 80, w: 380 });
  w.update = () => { const slots = ['1', '2', '3'].map(s => { const m = slotMeta(s); return `<div class="row"><b>Slot ${s}: ${m ? esc(m.name) + ' · ' + m.date : 'Empty'}</b><small>${m ? `${m.guests} guests · ${money(m.cash)} · saved ${new Date(m.savedAt).toLocaleString()}` : ''}</small><span>${b('Save here', 'save:' + s)}${m ? b('Load', 'load:' + s) + b('Delete', 'del:' + s) : ''}</span></div>`; }).join('');
    const auto = slotMeta('autosave');
    w.html(`<div class="list">${slots}<div class="row"><b>Autosave: ${auto ? esc(auto.name) + ' · ' + auto.date : 'None yet'}</b><small>Written at the start of every in-game month.</small><span>${auto ? b('Load', 'load:autosave') : ''}</span></div></div><div class="sect center">${b(svg('save') + ' Export to a file', 'export')}${b('Import a file', 'import')}</div><div class="sect center">${b('New park (title screen)', 'title')}</div>`); };
  wire(w, async a => { if (a.startsWith('save:')) { const err = writeSlot(a.slice(5), g, g.parkName, dateString(g)); app.toast(err ?? 'Saved'); } else if (a.startsWith('load:')) { const s = readSlot(a.slice(5)); if (s) { app.start(s); app.toast('Loaded'); } else app.toast('Nothing in that slot'); } else if (a.startsWith('del:')) clearSlot(a.slice(4)); else if (a === 'export') downloadFile(`${g.parkName.replace(/[^a-z0-9]+/gi, '-')}-${dateString(g).replace(/[^a-z0-9]+/gi, '-')}.json`, serialize(g)); else if (a === 'import') { const txt = await pickFile('.json'); if (txt) { try { app.start(deserialize(txt)); app.toast('Park loaded from file'); } catch (e) { app.toast(String((e as Error).message)); } } } else if (a === 'title') { app.autosave(); (window as any).__rct.showTitle(); } });
  w.update();
}
function newsWin(app: App) {
  const g = app.g; const w = app.wm.open({ id: 'news', title: 'Recent messages', cls: 'news', x: 300, y: 80, w: 420 });
  w.update = () => w.html(`<div class="list tall">${g.news.slice(0, 40).map((n, i) => `<div class="row" data-a="go:${i}"><b>${svg(n.icon === 'guest' ? 'smile' : n.icon)} ${esc(n.text)}</b><small>${Math.round((g.tick - n.tick) / 40 / 60)} min ago</small></div>`).join('') || '<div class="hint">No messages yet.</div>'}</div>`);
  wire(w, a => { if (a.startsWith('go:')) { const n = g.news[+a.slice(3)]; if (n?.subject) app.goTo(n.subject); } });
  w.update();
}
export { rideWin, guestWin, buildWin, year, undo, rideTestSummary };
