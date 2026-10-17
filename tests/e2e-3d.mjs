// The game in a real browser: start a park, build, open a ride, build a coaster, ride it, the report, both looks, goals, and that nothing errors.
// usage: node tests/e2e-3d.mjs [chromium|webkit] [W H] [shots-dir]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const require = createRequire(path.join(os.homedir(), 'Desktop/MAIN2026/package.json')); const pw = require('playwright');
const engine = process.argv[2] || 'chromium'; const W = +(process.argv[3] || 1803), H = +(process.argv[4] || 890); const shots = process.argv[5] || 'test-output'; fs.mkdirSync(shots, { recursive: true });
const browser = await pw[engine].launch({ args: engine === 'chromium' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); }); page.on('console', m => { if (m.type() === 'error' && !/WebGL|GPU stall|swiftshader/i.test(m.text())) errors.push('console: ' + m.text()); });
let fails = 0; const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); if (!ok) fails++; };
await page.goto('file://' + path.resolve('dist/index.html')); await page.waitForTimeout(900);
const mode = await page.evaluate(() => window.__rct.mode); check('3D mode chosen', mode === '3d', mode);
check('title shows', await page.isVisible('#title3d'));
await page.screenshot({ path: `${shots}/${engine}-3d-00-title.png` });
await page.click('#title3d [data-a="ttab:free"]'); await page.waitForTimeout(100); await page.click('#title3d [data-a="start"]'); await page.waitForTimeout(1200);
check('title hidden', !(await page.isVisible('#title3d')));
await page.screenshot({ path: `${shots}/${engine}-3d-01-park.png` });
const setup = await page.evaluate(() => {
  const R = window.__rct, a = R.app, g = a.g, C = R.cmds; const ex = g.entrance.x, ey = g.entrance.y; const h = g.tiles[(ey - 2) * g.w + ex].h;
  for (let y = ey - 30; y <= ey - 2; y++) for (let x = ex - 12; x <= ex + 16; x++) { const t = g.tiles[y * g.w + x]; t.h = h; delete t.slope; t.water = false; delete t.wz; t.scenery = null; for (const p of t.paths) p.z = h; }
  for (let i = 3; i <= 24; i++) C.cmdPath(g, ex, ey - i, false, 0);
  const r1 = C.cmdPlaceRide(g, 'merry_go_round', ex - 5, ey - 9, 0); const ride = g.rides[0];
  const e1 = C.cmdPlaceEntrance(g, ride.id, ex - 3, ey - 9, false); const x1 = C.cmdPlaceEntrance(g, ride.id, ex - 5, ey - 7, true);
  for (const x of [ex - 2, ex - 1]) C.cmdPath(g, x, ey - 9, false, 0); for (let x = ex - 5; x <= ex - 1; x++) C.cmdPath(g, x, ey - 6, false, 0);
  const o1 = R.openRide(g, ride);
  const s1 = C.cmdPlaceRide(g, 'burger_bar', ex + 1, ey - 12, 2); const s2 = C.cmdPlaceRide(g, 'balloon_stall', ex + 1, ey - 11, 2);
  a.afterAnyChange();
  return { ex, ey, r1, e1, x1, o1, s1, s2 };
});
check('flat ride placed and opened', setup.r1.ok && setup.e1.ok && setup.x1.ok && setup.o1 === null, JSON.stringify(setup));
// coaster through the hook commands + the app's own build path
const co = await page.evaluate(() => {
  const R = window.__rct, a = R.app, g = a.g, C = R.cmds; const ex = g.entrance.x, ey = g.entrance.y; const sx = ex + 2, sy = ey - 22;
  const st = C.cmdStartCoaster(g, 'wooden_coaster', sx, sy, 0); if (!st.ok) return { st };
  const r = g.rides[g.rides.length - 1]; const add = (k, chain = false) => { const x = C.cmdAddPiece(g, r.id, k, chain, 0); if (!x.ok) throw new Error(k + ': ' + x.error); };
  add('station'); add('station'); for (let i = 0; i < 4; i++) add('up', true); add('turnR'); add('down'); add('steepDown'); add('flat'); add('flat'); add('turnR'); for (let i = 0; i < 7; i++) add('flat'); add('turnR'); for (let i = 0; i < 4; i++) add('flat'); add('turnR');
  const s0 = r.pieces[0], s1 = r.pieces[1]; const e = C.cmdPlaceEntrance(g, r.id, s0.x, s0.y - 1, false); const x = C.cmdPlaceEntrance(g, r.id, s1.x, s1.y - 1, true);
  for (const xx of [s0.x, s1.x, ex + 1]) C.cmdPath(g, xx, sy - 2, false, 0);
  const t = R.testRide(g, r); const o = R.openRide(g, r); r.price = 150; a.afterAnyChange(); a.selectedRide = r.id;
  return { st, closed: r.closedLoop, e: e.ok, x: x.ok, t, o, stats: r.stats && { completed: r.stats.completed, speed: Math.round(r.stats.maxSpeed * 2.237), drops: r.stats.drops, fail: r.stats.failReason }, ratings: r.ratings };
});
check('coaster built, tested and opened', co.closed && co.e && co.x && co.t === null && co.o === null && co.stats && co.stats.completed, JSON.stringify(co));
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 12000; i++) window.__rct.tick(a.g); a.centerOn(a.g.entrance.x + 2, a.g.entrance.y - 12); a.world.controls.distance = 30; });
await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${engine}-3d-02-built.png` });
const after = await page.evaluate(() => { const g = window.__rct.app.g; const r = g.rides.find(x => x.type === 'wooden_coaster'); const m = g.rides[0]; return { guests: g.guestsInPark, admissions: g.totalAdmissions, coasterCustomers: r.customers, coasterRiding: r.trains.reduce((a, t) => a + t.riders.length, 0), carouselCustomers: m.customers, rating: g.rating, cash: g.finance.cash }; });
check('guests arrived', after.admissions > 0, JSON.stringify(after));
check('guests rode something', after.coasterCustomers + after.carouselCustomers + after.coasterRiding > 0);
// the interface: click the coaster to open its page, then the ride camera
const clickWorld = async (x, y, z) => { const p = await page.evaluate(([x, y, z]) => { const a = window.__rct.app; const v = new (a.world.camera.position.constructor)(x, y, z); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }, [x, y, z]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); return p; };
const rp = await page.evaluate(() => { const g = window.__rct.app.g; const r = g.rides[0]; const t = g.tiles[r.y * g.w + r.x]; return { x: r.x + 1, y: t.h * 0.25 + 1.2, z: r.y + 1 }; });
await clickWorld(rp.x, rp.y, rp.z);
check('inspector opened for the carousel', await page.evaluate(() => window.__rct.app.panelId === 'ride:' + window.__rct.app.g.rides[0].id), await page.evaluate(() => window.__rct.app.panelId));
await page.screenshot({ path: `${shots}/${engine}-3d-03-inspector.png` });
await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides.find(x => x.type === 'wooden_coaster'); a.openPanel('ride:' + r.id); a.toggleRideCam(r.id); let n = 0; while (n++ < 4000 && !(r.trains[0].state === 'running' && r.trains[0].pos > 30)) window.__rct.tick(a.g); for (let i = 0; i < 40; i++) { window.__rct.tick(a.g); a.updateRideCam(1 / 60); } });
await page.waitForTimeout(600); await page.screenshot({ path: `${shots}/${engine}-3d-04-ridecam.png` });
check('ride camera on', await page.evaluate(() => !!window.__rct.app.rideCam));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('ride camera off with Esc', await page.evaluate(() => !window.__rct.app.rideCam));
// build a second coaster through the real interface: New ride → Coasters → pick → click the map → rail buttons
await page.click('#bar [data-b="tool:newride"]'); await page.waitForTimeout(150); await page.click('#tray .tab[data-i="2"]'); await page.waitForTimeout(100); await page.click('#tray [data-a="pick:junior_coaster"]'); await page.waitForTimeout(100);
const spot = await page.evaluate(() => { const a = window.__rct.app; const g = a.g; const x = g.entrance.x - 9, y = g.entrance.y - 16; const t = g.tiles[y * g.w + x]; const v = new (a.world.camera.position.constructor)(x + 0.5, t.h * 0.25, y + 0.5); a.centerOn(x, y); a.world.controls.pan(0, 230); a.world.render(); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; });
await page.waitForTimeout(200); await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(300);
const started = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[a.g.rides.length - 1]; return { tool: a.tool.kind, type: r.type, pieces: r.pieces.length, panel: a.panelId }; });
check('junior coaster started by clicking the map', started.tool === 'coaster' && started.type === 'junior_coaster' && started.pieces === 1, JSON.stringify(started));
check('the builder takes over the bottom bar', await page.evaluate(() => document.getElementById('bar').classList.contains('builder') && !!document.querySelector('#bar [data-b="b:build"]')));
for (const a of ['build', 'pitch:up25', 'chain', 'build', 'build', 'curve:rightSmall', 'build']) await page.click(`#bar [data-b="b:${a}"]`); await page.waitForTimeout(150);
const built = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides[a.g.rides.length - 1]; return r.pieces.map(p => p.type + (p.chain ? '*' : '')).join(' '); });
check('construction buttons build RCT pieces: the transition to a climb first, and a turn while climbing is a climbing turn', built === 'endStation endStation flatToUp25* up25* rightQuarterTurn3TilesUp25*', built);
await page.click('#bar [data-b="b:specials"]'); await page.waitForTimeout(150);
const sp = await page.evaluate(() => ({ open: document.getElementById('vmenu').classList.contains('open'), items: document.querySelectorAll('#vmenu .spb').length, ok: document.querySelectorAll('#vmenu .spb:not(.dis)').length }));
check('Special opens the list of special pieces, those that cannot follow on greyed', sp.open && sp.items > 4 && sp.ok < sp.items, JSON.stringify(sp));
await page.click('#bar [data-b="b:specials"]'); await page.waitForTimeout(100);
await page.click('#bar [data-b="b:remove"]'); await page.waitForTimeout(100);
check('rail remove works', await page.evaluate(() => window.__rct.app.g.rides[window.__rct.app.g.rides.length - 1].pieces.length === 4));
await page.screenshot({ path: `${shots}/${engine}-3d-07-building.png` });
await page.click('#bar [data-b="done"]'); await page.waitForTimeout(100);
check('Done gives the toolbar back', await page.evaluate(() => !document.getElementById('bar').classList.contains('builder') && !!document.querySelector('#bar [data-b="tool:path"]')));
// every icon in the bar and the camera cluster has a size (Safari drew sizeless icons as nothing)
check('the camera controls are in the bar', await page.evaluate(() => !document.getElementById('cam') && !!document.querySelector('#bar [data-b="cam:rotate"]') && !!document.querySelector('#bar [data-b="cam:home"]')));
check('bar icons are drawn', await page.evaluate(() => [...document.querySelectorAll('#bar svg')].every(s => s.getBoundingClientRect().width >= 10)));
// tools: the tray follows the tool in hand; the same button again puts it down
await page.click('#bar [data-b="tool:path"]'); await page.waitForTimeout(150); check('paths tray opens with the tool', await page.evaluate(() => window.__rct.app.ui.tray.id === 'path' && window.__rct.app.tool.kind === 'path'));
await page.click('#bar [data-b="tool:land"]'); await page.waitForTimeout(150); check('land tray replaces it', await page.evaluate(() => window.__rct.app.ui.tray.id === 'land'));
await page.click('#bar [data-b="tool:land"]'); await page.waitForTimeout(150); check('the same tool button puts the tool down', await page.evaluate(() => window.__rct.app.tool.kind === 'inspect' && !window.__rct.app.ui.tray.isOpen));
await page.click('#bar [data-b="tool:newride"]'); await page.waitForTimeout(150); await page.click('#tray .tab[data-i="2"]'); await page.waitForTimeout(150);
check('rides tray shows coasters', (await page.textContent('#tray .body')).includes('Wooden Roller Coaster'));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('Esc closes the tray', await page.evaluate(() => !window.__rct.app.ui.tray.isOpen));
// the Park window: one window, a tab per screen
await page.click('#bar [data-b="park"]'); await page.waitForTimeout(150);
for (const id of ['finance', 'research', 'rides', 'guests', 'staff', 'park', 'news']) { await page.click(`#win .mtab[data-w="${id}"]`); await page.waitForTimeout(80); const ok = await page.evaluate(id => window.__rct.app.winId === id && window.__rct.app.ui.win.id === id && window.__rct.app.ui.win.isOpen, id); if (!ok) check('park window tab ' + id, false); }
check('park window tabs all open', true);
// save & load and options through the menu
for (const m of ['save', 'options']) { await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click(`#menu [data-m="${m}"]`); await page.waitForTimeout(100); if (!(await page.evaluate(m => window.__rct.app.ui.sys.id === m, m))) check('menu opens ' + m, false); }
check('menu opens save and options', true); await page.keyboard.press('Escape');
await page.click('#win .mtab[data-w="staff"]'); await page.waitForTimeout(100); for (const t of ['handyman', 'mechanic', 'security', 'entertainer']) await page.click(`#win [data-a="hire:${t}"]`);
await page.evaluate(() => { const a = window.__rct.app; for (let i = 0; i < 2000; i++) window.__rct.tick(a.g); });
check('four staff hired', await page.evaluate(() => window.__rct.app.g.staff.length === 4));
await page.evaluate(() => { const a = window.__rct.app; a.world.controls.yaw += 1.2; a.world.controls.pitch = 0.5; a.world.controls.distance = 22; });
await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${engine}-3d-05-angle.png` });
// night: jump the clock to mid-month
await page.evaluate(() => { const a = window.__rct.app; a.g.monthTick = 8192; a.g.weather.kind = 4; a.g.weather.rainLevel = 0.8; });
await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${engine}-3d-06-night-rain.png` });
// the park report: open it from the dock, hover a chart, close it; then look at the park with every panel hidden
await page.click('#bar [data-b="park"]'); await page.waitForTimeout(100); if (!(await page.evaluate(() => window.__rct.app.winOpen))) { await page.click('#bar [data-b="park"]'); await page.waitForTimeout(100); }
await page.click('#win .mtab[data-w="report"]'); await page.waitForTimeout(200);
const rep = await page.evaluate(() => ({ open: window.__rct.app.ui.win.id === 'report', charts: document.querySelectorAll('#win svg.rc').length, title: document.querySelector('#win .rep h2')?.textContent, chron: document.querySelectorAll('#win .ch').length, news: window.__rct.app.g.news.length }));
check('report opens with three charts and a chronicle', rep.open && rep.charts === 3 && rep.chron >= Math.max(1, rep.news), JSON.stringify(rep));
const hb = await page.locator('#win svg.rc .hit').first().boundingBox(); await page.mouse.move(hb.x + hb.width * 0.6, hb.y + hb.height / 2); await page.waitForTimeout(120);
check('chart hover shows the tooltip', await page.evaluate(() => getComputedStyle(document.querySelector('#win .rtip')).display !== 'none'));
await page.screenshot({ path: `${shots}/${engine}-3d-08-report.png` });
await page.click('#win [data-r="look"]'); await page.waitForTimeout(150);
check('look at the park hides the panels', await page.evaluate(() => document.getElementById('app3d').classList.contains('viewonly') && getComputedStyle(document.getElementById('bar')).display === 'none'));
await page.screenshot({ path: `${shots}/${engine}-3d-09-look.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(100); check('Esc brings the panels back', await page.evaluate(() => !document.getElementById('app3d').classList.contains('viewonly')));
// the look switch: classic 3D and back, picking still works in each
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(120); await page.click('#sys [data-a="look:classic"]'); await page.waitForTimeout(400);
check('switched to the classic look', await page.evaluate(() => window.__rct.app.look === 'classic' && window.__rct.app.world.look === 'classic' && document.getElementById('app3d').dataset.look === 'classic'));
await page.evaluate(() => window.__rct.app.resetCamera()); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/${engine}-3d-10-classic.png` });
await page.evaluate(() => { const a = window.__rct.app; a.setTool({ kind: 'inspect' }); a.closePanel(); a.winOpen = false; a.sysOpen = false; a.refreshPanel(); }); await page.waitForTimeout(100); await clickWorld(rp.x, rp.y, rp.z);
check('picking works in the classic look', await page.evaluate(() => window.__rct.app.panelId === 'ride:' + window.__rct.app.g.rides[0].id), await page.evaluate(() => window.__rct.app.panelId));
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(120); await page.click('#sys [data-a="look:ink"]'); await page.waitForTimeout(400);
check('back to the ink look', await page.evaluate(() => window.__rct.app.look === 'ink' && window.__rct.app.world.view.isOrthographicCamera === true));
// the piece system: the Space set in the picker with drawn previews, a 3×3 launch pad placed by clicking the map,
// inspected, recoloured and turned; a row of hedges painted in one drag and taken back with one undo; riders and a breakdown drawn
const proj = async (x, y, z) => page.evaluate(([x, y, z]) => { const a = window.__rct.app; a.world.render(); const v = new (a.world.camera.position.constructor)(x, y, z); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }, [x, y, z]);
await page.evaluate(() => { const a = window.__rct.app; a.setTool({ kind: 'inspect' }); a.closePanel(); a.winOpen = false; a.sysOpen = false; a.refreshPanel(); });
await page.click('#bar [data-b="tool:scenery"]'); await page.waitForTimeout(200); await page.click('#tray .tab[data-i="3"]'); await page.waitForTimeout(900);
const pk = await page.evaluate(() => ({ cards: document.querySelectorAll('#tray .sc').length, imgs: [...document.querySelectorAll('#tray .sc img')].filter(i => i.src.startsWith('data:image/png') && i.naturalWidth > 0).length }));
check('the Space set shows in the picker with drawn previews', pk.cards === 11 && pk.imgs === 11, JSON.stringify(pk));
await page.click('#tray [data-a="item:space_launchpad"]'); await page.waitForTimeout(150);
const lp = await page.evaluate(() => { const a = window.__rct.app, g = a.g; const free = (x, y, h0) => { const t = g.tiles[y * g.w + x]; return t && t.owned && !t.water && !t.paths.length && !t.slope && t.rideId === null && !t.entrance && !t.tracks.length && !t.scenery && t.h === h0; };
  for (let y = 6; y < g.h - 8; y++) for (let x = 6; x < g.w - 8; x++) { const h0 = g.tiles[y * g.w + x].h; let ok = true; for (let yy = y; yy < y + 3 && ok; yy++) for (let xx = x; xx < x + 3 && ok; xx++) ok = free(xx, yy, h0); if (ok) { a.centerOn(x + 1.5, y + 1.5); const c = a.world.controls; c.target.x += Math.sin(c.yaw) * 5; c.target.z += Math.cos(c.yaw) * 5; return { x, y, h: h0 }; } } return null; });   /* the spot sits above the tray, as a player would place it */
await page.waitForTimeout(250); const lpAt = await proj(lp.x + 1.5, lp.h * 0.25, lp.y + 1.5); await page.mouse.move(lpAt.x, lpAt.y); await page.waitForTimeout(120); await page.mouse.click(lpAt.x, lpAt.y); await page.waitForTimeout(200);
const placed = await page.evaluate(([x, y]) => { const g = window.__rct.app.g; const sc = g.tiles[y * g.w + x].scenery; let n = 0; for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) if (g.tiles[yy * g.w + xx].scenery?.kind === 'space_launchpad') n++; return { kind: sc?.kind, n }; }, [lp.x, lp.y]);
check('a 3×3 launch pad is placed by clicking the map', placed.kind === 'space_launchpad' && placed.n === 9, JSON.stringify(placed));
await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.mouse.click(lpAt.x, lpAt.y); await page.waitForTimeout(200);
check('clicking a piece opens it in the inspector', await page.evaluate(([x, y]) => window.__rct.app.panelId === `scen:${x},${y}`, [lp.x, lp.y]), await page.evaluate(() => window.__rct.app.panelId));
await page.click('#inspector [data-a="col:1"]'); await page.waitForTimeout(100); await page.click('#inspector [data-a="rot"]'); await page.waitForTimeout(150);
check('the inspector recolours and turns the whole piece', await page.evaluate(([x, y]) => { const g = window.__rct.app.g; const t = g.tiles[(y + 2) * g.w + x + 2].scenery; return t?.colour === 1 && t?.rot === 1; }, [lp.x, lp.y]));
await page.keyboard.press('Escape'); await page.click('#bar [data-b="tool:scenery"]'); await page.waitForTimeout(150); if (!(await page.evaluate(() => window.__rct.app.ui.tray.isOpen))) { await page.click('#bar [data-b="tool:scenery"]'); await page.waitForTimeout(150); }
await page.click('#tray .tab[data-i="1"]'); await page.waitForTimeout(500); await page.click('#tray [data-a="item:hedge"]'); await page.waitForTimeout(150);
const row = await page.evaluate(() => { const a = window.__rct.app, g = a.g; for (let y = 6; y < g.h - 6; y++) for (let x = 6; x < g.w - 12; x++) { const h0 = g.tiles[y * g.w + x].h; let ok = true; for (let i = 0; i < 6 && ok; i++) { const t = g.tiles[y * g.w + x + i]; ok = t.owned && !t.water && !t.paths.length && !t.slope && t.rideId === null && !t.entrance && !t.tracks.length && !t.scenery && t.h === h0; } if (ok) { a.centerOn(x + 3, y + 0.5); const c = a.world.controls; c.target.x += Math.sin(c.yaw) * 5; c.target.z += Math.cos(c.yaw) * 5; return { x, y, h: h0 }; } } return null; });
await page.waitForTimeout(250); const r0 = await proj(row.x + 0.5, row.h * 0.25, row.y + 0.5), r1 = await proj(row.x + 5.5, row.h * 0.25, row.y + 0.5);
const hedges0 = await page.evaluate(() => window.__rct.app.g.tiles.filter(t => t.scenery?.kind === 'hedge').length);
await page.mouse.move(r0.x, r0.y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(r0.x + (r1.x - r0.x) * i / 8, r0.y + (r1.y - r0.y) * i / 8); await page.mouse.up(); await page.waitForTimeout(200);
const hedges1 = await page.evaluate(() => window.__rct.app.g.tiles.filter(t => t.scenery?.kind === 'hedge').length);
check('dragging paints a row of hedges', hedges1 - hedges0 === 6, `${hedges1 - hedges0} placed`);
await page.keyboard.press('Meta+z'); await page.waitForTimeout(150);
check('one undo takes the whole painted row back', await page.evaluate(n => window.__rct.app.g.tiles.filter(t => t.scenery?.kind === 'hedge').length === n, hedges0));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
const live = await page.evaluate(async () => { const a = window.__rct.app, g = a.g; a.resetCamera(); for (let i = 0; i < 3000; i++) window.__rct.tick(g); a.wake(); await new Promise(r => setTimeout(r, 300));
  const r = g.rides.find(x => x.type === 'merry_go_round'); r.breakdown = { type: 'safety_cut_out', since: g.tick, mechanicId: null, fixing: 0 }; a.wake(); await new Promise(r => setTimeout(r, 300));
  const fx = !!a.rides.entries.get(r.id)?.fx; const riders = a.rides.riderBody?.count ?? 0; const onRides = g.rides.reduce((s, x) => s + x.riders.length + x.trains.reduce((q, t) => q + t.riders.length, 0), 0); r.breakdown = null; return { fx, riders, onRides }; });
check('riders are drawn in the seats and a breakdown shows smoke and a sign', live.fx && (live.onRides === 0 || live.riders > 0), JSON.stringify(live));
// risky buttons ask in the game, never in a browser pop-up: demolish (keep it, then do it), fire, save over a slot
await page.evaluate(() => { const a = window.__rct.app, g = a.g; a.setTool({ kind: 'inspect' }); a.winOpen = false; a.sysOpen = false; const r = g.rides.find(x => x.type === 'burger_bar'); a.openPanel('ride:' + r.id); });
await page.waitForTimeout(150); await page.click('#inspector [data-a="arm:demolish"]'); await page.waitForTimeout(120);
check('Demolish asks in the game first', await page.evaluate(() => !!document.querySelector('#inspector .ask [data-a="demolish"]') && !!document.querySelector('#inspector .ask [data-a="keep"]')));
await page.click('#inspector .ask [data-a="keep"]'); await page.waitForTimeout(100);
check('Keep it leaves the ride standing', await page.evaluate(() => !!window.__rct.app.g.rides.find(x => x.type === 'burger_bar') && !document.querySelector('#inspector .ask')));
await page.click('#inspector [data-a="arm:demolish"]'); await page.waitForTimeout(100); await page.click('#inspector .ask [data-a="demolish"]'); await page.waitForTimeout(150);
check('the question\'s button demolishes it', await page.evaluate(() => !window.__rct.app.g.rides.find(x => x.type === 'burger_bar')));
await page.keyboard.press('Meta+z'); await page.waitForTimeout(100);
await page.evaluate(() => { const a = window.__rct.app; const s = a.g.staff[0]; a.openPanel('staff:' + s.id); }); await page.waitForTimeout(150); await page.click('#inspector [data-a="arm:fire"]'); await page.waitForTimeout(100);
const staffBefore = await page.evaluate(() => window.__rct.app.g.staff.length); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
check('Esc closes the question and nothing happens', await page.evaluate(n => !document.querySelector('#inspector .ask') && window.__rct.app.g.staff.length === n, staffBefore));
await page.evaluate(async () => { const R = window.__rct; await R.saves.writeSlot('2', R.app.g, 'Earlier park', 'March, Year 1'); window.__rct.app.openPanel('save'); }); await page.waitForTimeout(200);
await page.click('#sys [data-a="arm:save:2"]'); await page.waitForTimeout(120);
check('saving over a used slot asks first', await page.evaluate(() => (document.querySelector('#sys .ask')?.textContent ?? '').includes('Save over')));
await page.click('#sys .ask [data-a="keep"]'); await page.evaluate(async () => { await window.__rct.saves.clearSlot('2'); window.__rct.app.sysOpen = false; window.__rct.app.refreshPanel(); });
check('no browser pop-up appeared anywhere', dialogs.length === 0, dialogs.join(' | '));
const rt = await page.evaluate(() => { const R = window.__rct, a = R.app; const before = { rides: a.g.rides.length, guests: a.g.guests.length, tick: a.g.tick }; const s = R.serialize(a.g); a.start(R.deserialize(s)); return { ...before, after: { rides: a.g.rides.length, guests: a.g.guests.length, tick: a.g.tick }, bytes: s.length }; });
check('save round-trips through the 3D app', rt.rides === rt.after.rides && rt.guests === rt.after.guests && rt.tick === rt.after.tick, JSON.stringify(rt));
await page.waitForTimeout(300);
// optional goals: found a 45-minute park from the title screen, then meet every goal and see the report open
await page.evaluate(() => window.__rct.showTitle()); await page.waitForTimeout(200); await page.click('#title3d [data-a="goals:45"]'); await page.waitForTimeout(80);
check('title shows the goal targets', (await page.textContent('#title3d')).includes('Hold them all for two minutes'));
await page.screenshot({ path: `${shots}/${engine}-3d-11-title-goals.png` });
if (await page.isVisible('#title3d [data-a="ttab:free"]')) { await page.click('#title3d [data-a="ttab:free"]'); await page.waitForTimeout(100); } await page.click('#title3d [data-a="start"]'); await page.waitForTimeout(500);
check('goals park started with a clock chip', await page.evaluate(() => !!window.__rct.app.g.goals && !!document.querySelector('#stats .goalchip')));
await page.evaluate(() => { const a = window.__rct.app, o = a.g.goals; o.guests = 0; o.rating = 0; o.cash = 1; for (let i = 0; i < 40 * 125; i++) window.__rct.tick(a.g); });
await page.waitForTimeout(400);
check('meeting the goals opens the report', await page.evaluate(() => document.querySelector('#report').classList.contains('open') && document.querySelector('#report h2').textContent === 'Goals met'));
await page.screenshot({ path: `${shots}/${engine}-3d-12-goals-met.png` });
await page.click('#report [data-r="close"]'); await page.waitForTimeout(100);
// speed: a busy park (1,500 guests in view) stays inside the triangle budget, saves into every slot, rests when paused
const heavy = await page.evaluate(async () => {
  const R = window.__rct, a = R.app, g = a.g; g.speed = 1; const proto = g.guests.find(q => q.state === 'walking') ?? g.guests[0]; const paths = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const t = g.tiles[y * g.w + x]; for (const p of t.paths) if (!p.queue) paths.push([x, y, p.z]); }
  let id = g.nextGuestId; while (g.guests.filter(q => q.state !== 'left').length < 1500) { const [x, y, hz] = paths[id % paths.length]; const q = JSON.parse(JSON.stringify(proto)); Object.assign(q, { id: id++, x: x + 0.5, y: y + 0.5, z: hz, tx: x, ty: y, state: 'walking', route: null, dest: null, headingTo: null, rideId: null, entered: g.tick }); g.guests.push(q); }
  g.nextGuestId = id; g.guestsInPark = g.guests.filter(q => q.state !== 'left').length; a.resetCamera(); a.wake();
  await new Promise(r => setTimeout(r, 600)); const tris = a.world.renderer.info.render.triangles;
  const saves = []; for (const slot of ['autosave', '1', '2', '3']) saves.push(await R.saves.writeSlot(slot, g, g.parkName, '') ?? 'ok');
  const back = await R.saves.readSlot('3'); for (const s of ['1', '2', '3']) await R.saves.clearSlot(s);
  return { guests: g.guestsInPark, tris, saves, backGuests: back?.guests.length, guestsNow: g.guests.length };
});
check('a busy park stays inside the triangle budget', heavy.tris > 0 && heavy.tris < 900000, `${heavy.tris} triangles with ${heavy.guests} guests (budget 900,000; before this round about 2.5 M)`);
check('a busy park saves into every slot and loads back', heavy.saves.every(x => x === 'ok') && heavy.backGuests === heavy.guestsNow, JSON.stringify({ saves: heavy.saves, back: heavy.backGuests }));
const rest = await page.evaluate(async () => { const a = window.__rct.app, info = a.world.renderer.info.render; a.g.speed = 0; a.wakeUntil = 0; a.keys.clear(); await new Promise(r => setTimeout(r, 300)); const f0 = info.frame; await new Promise(r => setTimeout(r, 800)); const still = info.frame - f0;
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 300 })); const f1 = info.frame; await new Promise(r => setTimeout(r, 300)); return { still, woke: info.frame - f1 }; });
check('paused and untouched, nothing is drawn; a mouse move wakes it', rest.still === 0 && rest.woke > 0, JSON.stringify(rest));
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(150);
const res = await page.evaluate(() => { const a = window.__rct.app; const row = !!document.querySelector('#sys [data-a="res:auto"]'); a.setResMode(false); const full = a.world.renderer.getPixelRatio(); a.setResMode(true); return { row, full, max: a.res.max, auto: a.resAuto }; });
check('Options has the Resolution switch; Full draws every pixel', res.row && res.full === res.max && res.auto, JSON.stringify(res)); await page.keyboard.press('Escape');
// ---------- the full-season round: auto-connect, ready-made rides, Finish circuit, overlays, mini-map, pops, the Thoughts board, patrol, events, tempo, water rides, scenarios ----------
const screenOf = async (x, y) => page.evaluate(([x, y]) => { const a = window.__rct.app, g = a.g; const t = g.tiles[y * g.w + x]; a.centerOn(x + 0.5, y + 0.5); a.world.controls.pan(0, 230); a.world.render(); const v = new (a.world.camera.position.constructor)(x + 0.5, t.h * 0.25, y + 0.5); v.project(a.world.view); const r = a.world.canvas.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }, [x, y]);
await page.evaluate(() => { const a = window.__rct.app, g = a.g; g.speed = 0; g.guests = g.guests.slice(0, 300); g.guestsInPark = g.guests.filter(q => q.state !== 'left').length; g.finance.cash = 50_000_000; for (const p of [a.ui.inspector, a.ui.win, a.ui.tray]) p.close(); a.winOpen = false; a.panelId = ''; a.setTool({ kind: 'inspect' }); a.world.controls.distance = 30; });
// a free 2×2 spot near the paths, found by the game's own check, then a Ferris Wheel placed2 by clicking it: auto-connect lays its huts and paths and opens it
const fw = await page.evaluate(() => { const R = window.__rct, a = R.app, g = a.g; for (let r = 3; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = g.entrance.x + dx, y = g.entrance.y - 10 + dy; const res = R.cmds.cmdPlaceRide(g, 'ferris_wheel', x, y, 0); if (!res.ok) continue; const c = R.cmds.autoConnect(g, g.rides[g.rides.length - 1].id); if (c.ok) R.undo(); R.undo(); if (c.ok) return { x, y }; } return null; });   // where it fits and can be joined to the paths
check('a free spot for a Ferris Wheel', !!fw, JSON.stringify(fw));
await page.click('#bar [data-b="tool:newride"]'); await page.waitForTimeout(150); await page.click('#tray .tab[data-i="0"]'); await page.waitForTimeout(100); await page.click('#tray [data-a="pick:ferris_wheel"]'); await page.waitForTimeout(100);
let at = await screenOf(fw.x, fw.y); await page.mouse.click(at.x, at.y); await page.waitForTimeout(300);
const placed2 = await page.evaluate(() => { const a = window.__rct.app; const r = a.g.rides.filter(x => x.type === 'ferris_wheel').pop(); return r && { status: r.status, entrance: !!r.entrance, exit: !!r.exit, tool: a.tool.kind, panel: a.panelId }; });
check('a ride placed by clicking is connected and opens by itself (auto-connect)', placed2?.status === 'open' && placed2.entrance && placed2.exit && placed2.tool === 'inspect', JSON.stringify(placed2));
await page.screenshot({ path: `${shots}/${engine}-3d-20-autoconnect.png` });
// a ready-made coaster from the Ready-made tab, placed2 with one click
const dd = await page.evaluate(() => { const R = window.__rct, a = R.app, g = a.g; const h0 = g.tiles[(g.entrance.y - 2) * g.w + g.entrance.x].h;
  for (let y = g.entrance.y - 40; y <= g.entrance.y - 26; y++) for (let x = g.entrance.x - 8; x <= g.entrance.x + 26; x++) { const t = g.tiles[y * g.w + x]; if (!t || t.rideId !== null || t.tracks.length || t.entrance || t.paths.length) continue; t.h = h0; delete t.slope; t.water = false; delete t.wz; t.owned = true; t.scenery = null; }   // room for the bigger RCT-piece layout
  a.afterAnyChange(); const why = {}; for (let r = 4; r < 34; r += 2) for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const x = g.entrance.x + dx, y = g.entrance.y - 14 + dy; const res = R.cmds.cmdBuildDesign(g, 'little_dipper', x, y, 0); if (!res.ok) { why[res.why] = (why[res.why] ?? 0) + 1; continue; } const c = R.cmds.autoConnect(g, res.rideId); if (c.ok) R.undo(); R.undo(); if (c.ok) return { x, y }; why['connect: ' + c.why] = (why['connect: ' + c.why] ?? 0) + 1; } return { why }; });   // where it fits and can be joined to the paths
check('a spot where the Little Dipper fits', !!dd && dd.x !== undefined, JSON.stringify(dd));
await page.evaluate(() => { const a = window.__rct.app; a.setTool({ kind: 'inspect' }); a.dockAction('newride'); }); await page.waitForTimeout(150); await page.click('#tray .tab[data-i="5"]'); await page.waitForTimeout(100); await page.click('#tray [data-a="design:little_dipper"]'); await page.waitForTimeout(100);
at = await screenOf(dd.x, dd.y); await page.mouse.move(at.x, at.y); await page.waitForTimeout(200); const ghost = await page.evaluate(() => !!window.__rct.app.ghost && window.__rct.app.designCheck.why === '');
await page.mouse.click(at.x, at.y); await page.waitForTimeout(400);
const dip = await page.evaluate(() => { const r = window.__rct.app.g.rides.find(x => x.name === 'Little Dipper'); return r && { closed: r.closedLoop, status: r.status, e: r.ratings?.e, entrance: !!r.entrance }; });
check('the ready-made preview follows the mouse, green where it fits', ghost);
check('a ready-made coaster is built, connected, tested and opened in one click', !!dip && dip.closed && dip.status === 'open' && dip.entrance, JSON.stringify(dip));
await page.screenshot({ path: `${shots}/${engine}-3d-21-ready-made.png` });
// Finish circuit from the builder bar
const fin = await page.evaluate(() => { const R = window.__rct, a = R.app, g = a.g; for (let r = 4; r < 30; r += 2) for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const x = g.entrance.x + dx, y = g.entrance.y - 20 + dy; const n0 = g.rides.length; const s = R.cmds.cmdStartCoaster(g, 'junior_coaster', x, y, 1); if (!s.ok) continue; const ride = g.rides[g.rides.length - 1]; const built = ['station', 'up', 'up', 'down'].filter(k => R.cmds.cmdAddPiece(g, ride.id, k, k === 'up', 0).ok).length;
  if (built === 4) { const c = R.cmds.buildCircuit(g, ride.id); if (c.ok) { R.undo(); a.setTool({ kind: 'coaster', rideId: ride.id }); a.updateChrome(); return ride.id; } }   // a half-built coaster the planner can finish
  for (let i = 0; i < built + 1; i++) R.undo(); if (g.rides.length !== n0) g.rides.length = n0; } return null; });
await page.click('#bar [data-b="b:finish"]'); await page.waitForTimeout(400);
const fdone = await page.evaluate(id => { const r = window.__rct.app.g.rides.find(x => x.id === id); return r && { closed: r.closedLoop, status: r.status, pieces: r.pieces.length }; }, fin);
check('Finish circuit closes a half-built coaster from the builder bar', !!fdone && fdone.closed, JSON.stringify(fdone));
// the View menu: an overlay with its legend, the mini-map; money pops and thought bubbles while it runs
await page.evaluate(() => { const a = window.__rct.app; a.setTool({ kind: 'inspect' }); a.centerOn(a.g.entrance.x, a.g.entrance.y - 12); a.world.controls.distance = 26; });
await page.click('#bar [data-b="view"]'); await page.waitForTimeout(150); await page.click('#vmenu [data-v="lens:happiness"]'); await page.waitForTimeout(200);
const lens = await page.evaluate(() => ({ mode: window.__rct.app.lens.mode, legend: getComputedStyle(document.getElementById('legend')).display !== 'none', mini: getComputedStyle(document.getElementById('minimap')).display !== 'none' }));
check('the View menu turns on an overlay with its legend; the mini-map shows', lens.mode === 'happiness' && lens.legend && lens.mini, JSON.stringify(lens));
await page.keyboard.press('Escape'); await page.keyboard.press('m'); const miniOff = await page.evaluate(() => getComputedStyle(document.getElementById('minimap')).display === 'none'); await page.keyboard.press('m');
check('M hides and shows the mini-map', miniOff);
const made0 = await page.evaluate(() => { const a = window.__rct.app; a.g.speed = 4; a.g.rating = 900; return { ...a.floaters.made }; }); for (let i = 0; i < 40 && await page.evaluate(m => window.__rct.app.floaters.made.pops === m.pops, made0); i++) await page.waitForTimeout(500);   // up to 20 s: software GL in a headless Chromium runs the park slowly
const fx2 = await page.evaluate(m => { const f = window.__rct.app.floaters.made; return { pops: f.pops - m.pops, bubbles: f.bubbles - m.bubbles }; }, made0);
const popDiag = fx2.pops > 0 ? '' : await page.evaluate(() => { const g = window.__rct.app.g; const st = {}; for (const q of g.guests) st[q.state] = (st[q.state] ?? 0) + 1; return JSON.stringify({ tick: g.tick, speed: g.speed, open: g.parkOpen, guests: g.guests.length, st, rides: g.rides.map(r => r.type + ':' + r.status + ':' + r.income + ':q' + r.queue.length) }); });
check('money floats up where it is earned', fx2.pops > 0, JSON.stringify(fx2) + popDiag);
await page.screenshot({ path: `${shots}/${engine}-3d-22-overlay-pops.png` });
await page.evaluate(() => { const a = window.__rct.app; a.g.speed = 0; a.setLens('off'); });
// the Thoughts board: complaints park-wide, Show moves the view
await page.evaluate(() => window.__rct.app.openPanel('guests')); await page.waitForTimeout(300);
const board = await page.evaluate(() => ({ rows: document.querySelectorAll('#win .board .item').length, tab: document.querySelector('#win .tabs .tab.on')?.textContent }));
check('the Guests window opens on the Thoughts board', board.rows > 0 && board.tab === 'Thoughts', JSON.stringify(board));
const t0 = await page.evaluate(() => window.__rct.app.world.controls.target.toArray()); await page.click('#win .board [data-a^="show:"]'); await page.waitForTimeout(200); const t1 = await page.evaluate(() => window.__rct.app.world.controls.target.toArray());
check('Show goes to where the guests had the thought', t0.join() !== t1.join(), JSON.stringify({ t0, t1 }));
await page.screenshot({ path: `${shots}/${engine}-3d-23-thoughts.png` }); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
// a patrol area painted on the map
await page.evaluate(() => window.__rct.app.openPanel('staff')); await page.waitForTimeout(200); await page.click('#win [data-a="hire:handyman"]'); await page.waitForTimeout(150);
const sid = await page.evaluate(() => { const a = window.__rct.app; a.winOpen = false; a.refreshWin(); a.panelId = ''; const s = a.g.staff.filter(x => x.type === 'handyman').pop(); a.openPanel('staff:' + s.id); return s.id; }); await page.waitForTimeout(200);
const lensBefore = await page.evaluate(() => window.__rct.app.lens.mode); await page.click('#inspector [data-a="patrol"]'); await page.waitForTimeout(150);
at = await screenOf(await page.evaluate(() => window.__rct.app.g.entrance.x), await page.evaluate(() => window.__rct.app.g.entrance.y - 8)); await page.mouse.click(at.x, at.y); await page.waitForTimeout(150);
const pat = await page.evaluate(id => ({ cells: window.__rct.app.g.staff.find(x => x.id === id).patrol?.length ?? 0, lens: window.__rct.app.lens.mode }), sid);
await page.click('#tray [data-a="done"]'); await page.waitForTimeout(100); const patAfter = await page.evaluate(() => window.__rct.app.lens.mode);
check('Set area paints a patrol square; the overlay shows it while painting, then the one from before comes back', pat.cells === 1 && pat.lens === 'patrol' && patAfter === lensBefore, JSON.stringify({ ...pat, patAfter, lensBefore }));
// an event chip, the tempo switch
await page.evaluate(() => { const R = window.__rct; R.cmds.startEvent(R.app.g, 'heatwave', () => {}); R.app.updateChrome(); }); await page.waitForTimeout(400);
check('a running event shows in the top bar', await page.evaluate(() => !!document.querySelector('#stats .evchip')));
await page.click('#bar [data-b="menu"]'); await page.waitForTimeout(100); await page.click('#menu [data-m="options"]'); await page.waitForTimeout(150); await page.click('#sys [data-a="tempo1"]'); await page.waitForTimeout(100);
check('Options → Tempo changes the park tempo', await page.evaluate(() => window.__rct.app.g.tempo === 1)); await page.keyboard.press('Escape');
// a water ride and the railway, ready-made, running
const water = await page.evaluate(() => { const R = window.__rct, a = R.app, g = a.g; const out = {}; const h = g.tiles[(g.entrance.y - 2) * g.w + g.entrance.x].h; g.research.invented.push('log_flume', 'mini_railway');   // a goals park: not researched yet
  for (let y = 4; y <= 30; y++) for (let x = 4; x <= 17; x++) { const t = g.tiles[y * g.w + x]; if (t.rideId !== null || t.tracks.length || t.entrance) continue; t.h = h; delete t.slope; t.scenery = null; t.water = false; delete t.wz; t.owned = true; t.paths = []; }   // clear ground for them
  for (const key of ['log_jam', 'park_express']) { let done = false; for (let y = 5; y <= 24 && !done; y++) for (let x = 5; x <= 10 && !done; x++) { const res = R.cmds.cmdBuildDesign(g, key, x, y, 0); if (!res.ok) continue; const ride = g.rides.find(x => x.id === res.rideId); R.cmds.autoConnect(g, ride.id); R.testRide(g, ride); R.openRide(g, ride); ride.maxWait = 5; out[key] = { status: ride.status, e: ride.ratings?.e, completed: !!ride.stats?.completed, pos0: ride.trains[0]?.pos }; done = true; } }
  for (let i = 0; i < 600; i++) R.tick(g); for (const key of Object.keys(out)) { const r = g.rides.filter(x => x.type === (key === 'log_jam' ? 'log_flume' : 'mini_railway')).pop(); out[key].moved = r.trains.some(t => Math.abs(t.pos - out[key].pos0) > 0.5 || t.state === 'running'); } a.afterAnyChange(); const f = g.rides.find(x => x.type === 'log_flume'); if (f) a.centerOn(f.pieces[0].x, f.pieces[0].y); return out; });
await page.waitForTimeout(500);
check('a log flume and the railway build ready-made, test, and their trains run', ['log_jam', 'park_express'].every(k => water[k]?.completed && water[k]?.moved && water[k]?.e > 0), JSON.stringify(water));
await page.screenshot({ path: `${shots}/${engine}-3d-24-water.png` });
// RCT land: smooth slopes, one corner, cliffs, water up and down, and a bridge built from a path's height, all with the mouse
const lt = await page.evaluate(() => { const R = window.__rct, a = R.app; const g = R.newGame({ name: 'Land test', size: 'medium', cash: 5_000_000, loan: 0, maxLoan: 0, difficulty: 'easy', sandbox: false, seed: 4242, goalMinutes: 0 }); a.start(g);
  const ex = g.entrance.x, ey = g.entrance.y, x0 = ex + 9, y0 = ey - 12, h = 6;
  for (let y = y0 - 6; y <= y0 + 6; y++) for (let x = x0 - 6; x <= x0 + 6; x++) { const t = g.tiles[y * g.w + x]; t.h = h; delete t.slope; t.water = false; delete t.wz; t.owned = true; t.scenery = null; t.paths = []; }
  a.afterAnyChange(); a.centerOn(x0, y0); const c = a.world.controls; c.distance = 24; c.target.x += Math.sin(c.yaw) * 4; c.target.z += Math.cos(c.yaw) * 4; return { x0, y0, h }; });
await page.waitForTimeout(300);
const clickTile = async (x, y, fx = 0.5, fy = 0.5, z = lt.h) => { const p = await proj(x + fx, z * 0.25, y + fy); await page.mouse.move(p.x, p.y); await page.waitForTimeout(80); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
const tileState = (x, y) => page.evaluate(([x, y]) => { const g = window.__rct.app.g; const t = g.tiles[y * g.w + x]; return { h: t.h, slope: t.slope ?? 0, water: t.water, wz: t.wz, paths: t.paths.map(p => [p.z, p.slope]) }; }, [x, y]);
await page.click('#bar [data-b="tool:land"]'); await page.waitForTimeout(150); await page.click('#tray [data-a="raise"]'); await page.waitForTimeout(80);
await clickTile(lt.x0, lt.y0); const up = await tileState(lt.x0, lt.y0), side = await tileState(lt.x0 + 1, lt.y0);
check('Land: raising a tile slopes the land beside it', up.h === lt.h + 2 && up.slope === 0 && side.h === lt.h && side.slope > 0, JSON.stringify([up, side]));
await clickTile(lt.x0 - 3, lt.y0, 0.93, 0.93); const cn = await tileState(lt.x0 - 3, lt.y0);
check('Land: pointing at a corner raises just that corner', cn.h === lt.h && cn.slope === 1, JSON.stringify(cn));
await page.click('#tray [data-a="cliffs"]'); await page.waitForTimeout(80); await clickTile(lt.x0 + 3, lt.y0 + 3); const cl = await tileState(lt.x0 + 3, lt.y0 + 3), cl2 = await tileState(lt.x0 + 4, lt.y0 + 3);
check('Land: with Cliffs only the tile moves', cl.h === lt.h + 2 && cl2.h === lt.h && cl2.slope === 0, JSON.stringify([cl, cl2]));
await page.click('#tray [data-a="water"]'); await page.waitForTimeout(80); await clickTile(lt.x0 - 3, lt.y0 - 4); const wet = await tileState(lt.x0 - 3, lt.y0 - 4);
await page.click('#tray [data-a="drain"]'); await page.waitForTimeout(80); await clickTile(lt.x0 - 3, lt.y0 - 4, 0.5, 0.5, lt.h + 2); const dry = await tileState(lt.x0 - 3, lt.y0 - 4);
check('Water up floods a tile a step deep; Water down drains it', wet.water && wet.wz === lt.h + 2 && !dry.water, JSON.stringify([wet, dry]));
await page.click('#bar [data-b="tool:path"]'); await page.waitForTimeout(150); await clickTile(lt.x0 + 3, lt.y0 - 4);
await page.click('#tray [data-a="level"]'); await page.waitForTimeout(80); await clickTile(lt.x0 + 3, lt.y0 - 4); await page.click('#tray [data-a="zup"]'); await page.waitForTimeout(80); await page.click('#tray [data-a="zup"]'); await page.waitForTimeout(80);
const trayH = await page.evaluate(() => document.querySelector('#tray')?.textContent ?? ''); await clickTile(lt.x0 + 4, lt.y0 - 4); const br = await tileState(lt.x0 + 4, lt.y0 - 4);
check('Paths: Bridge or tunnel picks a path’s height, + lifts it, and the next tile is a bridge', /Height 5/.test(trayH) && br.h === lt.h && br.paths.length === 1 && br.paths[0][0] === lt.h + 4, JSON.stringify(br) + ' ' + /Height \d+/.exec(trayH));
await page.screenshot({ path: `${shots}/${engine}-3d-27-land.png` }); await page.keyboard.press('Escape');
// scenarios from the title screen
await page.evaluate(() => { localStorage.removeItem('rct.scenarios'); window.__rct.app.showTitle(); }); await page.waitForTimeout(300);
await page.click('#title3d [data-a="ttab:scen"]'); await page.waitForTimeout(100);
const locked = await page.evaluate(() => document.querySelectorAll('#title3d .scard.locked').length);
check('scenarios: the Beginner parks are open, the rest locked', locked === 5, String(locked));
await page.screenshot({ path: `${shots}/${engine}-3d-25-scenarios.png` });
await page.click('#title3d [data-a="scen:forest_glade"]'); await page.waitForTimeout(100); await page.click('#title3d [data-a="play"]'); await page.waitForTimeout(900);
const sc2 = await page.evaluate(() => { const g = window.__rct.app.g; return { name: g.parkName, scenario: g.goals?.scenario, rides: g.rides.length, chip: !!document.querySelector('#stats .goalchip') }; });
check('a scenario starts from the title with its goals and its rides already built', sc2.scenario === 'forest_glade' && sc2.rides >= 2 && sc2.chip, JSON.stringify(sc2));
await page.evaluate(() => { const a = window.__rct.app; a.g.goals.targets = [{ kind: 'rating', target: 0 }]; for (let i = 0; i < 40 * 125; i++) window.__rct.tick(a.g); }); await page.waitForTimeout(500);
const won = await page.evaluate(() => ({ report: document.querySelector('#report').classList.contains('open'), title: document.querySelector('#report h2')?.textContent, stars: JSON.parse(localStorage.getItem('rct.scenarios') || '{}') }));
check('completing it shows the stars and keeps them', won.report && /★/.test(won.title ?? '') && won.stars.forest_glade === 3, JSON.stringify(won));
await page.screenshot({ path: `${shots}/${engine}-3d-26-scenario-done.png` }); await page.click('#report [data-r="close"]'); await page.waitForTimeout(100);
const fit = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
check('fits the window', fit.sh <= fit.ih && fit.sw <= fit.iw, JSON.stringify(fit));
const fps = await page.evaluate(() => { const f = window.__rct.app.frameTimes; return f.length ? Math.round(1 / (f.reduce((a, b) => a + b, 0) / f.length)) : 0; }); console.log(`frame rate ≈ ${fps} fps (software GL in headless; real GPU is much faster)`);
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
